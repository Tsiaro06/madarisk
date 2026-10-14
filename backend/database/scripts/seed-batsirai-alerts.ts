import path from 'path';
import pg from 'pg';
import { BATSIRAI_TRACK } from '../seeds/batsirai-2022';
import { BATSIRAI_RADII } from '../seeds/batsirai-2022-radii';

/**
 * Import des niveaux d'alerte cyclonique communaux de l'événement historique
 * « Cyclone Batsirai — février 2022 » dans `event_commune_alert_history`.
 *
 * Objectif : permettre à la carte de la salle de crise de colorer chaque commune
 * au fil de l'animation, en suivant le déplacement réel du cyclone et de son
 * champ de vent documenté (rayons R34 / R50 / R64 de la RSMC La Réunion).
 *
 * Règles de coloration (code couleur cyclonique malgache) :
 *  - ROUGE : la commune est dans le cœur du cyclone (« passage ») : rayon de vent
 *            ≥ 50 kt (R50/R64) documenté par la RSMC. Lorsque la RSMC cesse de
 *            publier le R50 (Batsirai retombe sous 50 kt le 6 février), la dernière
 *            valeur publiée est **prolongée** le long de la trajectoire pour que le
 *            cœur reste visible pendant tout le passage — méthode de persistance,
 *            jamais une valeur inventée.
 *  - JAUNE : la commune est dans le rayon de vent ≥ 34 kt (R34) mais hors du cœur
 *            — « affectée ».
 *  - VERT  : la commune est hors du champ de vent documenté — « safe ».
 *  - BLEU  : la commune vient de sortir du champ de vent (R34). La transition est
 *            progressive, commune par commune, dès que le cercle ne la touche
 *            plus — jamais une bascule globale quand le cyclone quitte Madagascar.
 *
 * Principe de non-invention :
 *  - Aucune commune n'est colorée à partir d'une simple proximité estimée : seuls
 *    les rayons de vent RÉELLEMENT publiés (RSMC La Réunion / IBTrACS v04r01)
 *    sont utilisés. Un seuil non publié reste `null` (jamais interpolé comme une
 *    valeur inventée) ; seule la valeur du cœur déjà publiée est prolongée.
 *  - Les niveaux sont stockés `info_type = ESTIMATION`, `territory_scope =
 *    COMMUNE`, avec la source et un commentaire explicite.
 *  - Le bulletin du 1er février ne publie qu'un niveau global « VERTE » sans liste
 *    de territoires : aucune commune ne peut en être déduite. Le script le signale
 *    explicitement au lieu d'inventer une liste.
 *
 * Idempotence : relancer le script supprime puis réinsère toutes les lignes
 * d'alerte de l'événement.
 *
 * Exécution : `npm run db:seed:batsirai-alerts`
 */

const EVENT_CODE = 'HIST-BATSIRAI-2022';

/** Début de l'événement : premier point de la trajectoire observée (UTC). */
const EVENT_START = BATSIRAI_TRACK[0].time;

/** Fin officielle de l'événement : borne des dangers résiduels documentés. */
const EVENT_ENDED_AT = '2022-02-11T00:00:00Z';

/** Source des rayons de vent documentés (autorité WMO du bassin). */
const WIND_SOURCE_NAME =
  'RSMC La Réunion (Météo-France) — rayons de vent IBTrACS v04r01 (2022024S09090)';
const WIND_SOURCE_URL = 'https://ncics.org/ibtracs/index.php?name=v04r01-2022024S09090';

/**
 * Dangers résiduels après le passage du champ de vent (crues, inondations) :
 * documentés à l'échelle de l'événement (inondations observées par satellite
 * jusqu'au 10 février 2022). Le report au niveau communal est une ESTIMATION —
 * jamais une donnée communale publiée.
 */
const RESIDUAL_SOURCE_NAME =
  "NASA Earth Observatory — inondations observées jusqu'au 10 février 2022";
const RESIDUAL_SOURCE_URL =
  'https://earthobservatory.nasa.gov/images/149434/cyclone-batsirai-soaks-madagascar';

type Level = 'VERT' | 'JAUNE' | 'ROUGE' | 'BLEU';
type Scope = 'COMMUNE' | 'DISTRICT' | 'REGION' | 'EVENEMENT';

/** Pas d'échantillonnage de la trajectoire (minutes) pour dater entrées/sorties. */
const SAMPLE_STEP_MINUTES = 15;

/** Point d'échantillonnage du centre et de ses rayons de vent documentés. */
export interface WindSample {
  /** Horodatage epoch (ms, UTC). */
  t: number;
  /** Longitude du centre. */
  lon: number;
  /** Latitude du centre. */
  lat: number;
  /** Rayon du vent ≥ 34 kt (km) publié, ou null si absent. */
  r34: number | null;
  /** Rayon du vent ≥ 50 kt (km) publié, ou null si absent. */
  r50: number | null;
  /** Rayon du vent ≥ 64 kt (km) publié, ou null si absent. */
  r64: number | null;
  /**
   * Rayon du cœur (« passage du cyclone ») utilisé pour le ROUGE, en km.
   * Correspond au rayon ≥ 50 kt publié ; lorsque la RSMC cesse de le publier
   * (Batsirai retombe sous 50 kt le 6 février), la **dernière valeur publiée est
   * prolongée** — méthode de persistance, jamais une valeur inventée. Reste `null`
   * tant qu'aucun R50 n'a encore été documenté.
   */
  coreKm: number | null;
}

/** Intervalle d'alerte daté d'une commune (bornes en epoch ms). */
export interface AlertInterval {
  communeId: string;
  level: Level;
  from: number;
  to: number;
}

/** Distance en kilomètres entre deux points géographiques (formule de haversine). */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const earthRadiusKm = 6371.0088;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Échantillonne la trajectoire observée et ses rayons de vent. La position du
 * centre est interpolée linéairement entre deux points ; un rayon n'est interpolé
 * que si les DEUX points bornes le publient — sinon il reste `null` (aucune valeur
 * inventée). Le rayon du cœur (`coreKm`) est le R50 publié, par prolongation de la
 * dernière valeur publiée lorsqu'il n'est plus documenté.
 */
export function buildWindSamples(): WindSample[] {
  const radiiByTime = new Map(BATSIRAI_RADII.map((r) => [r.time, r]));
  const samples: WindSample[] = [];
  const lerp = (a: number | null | undefined, b: number | null | undefined, f: number) =>
    a != null && b != null ? a + (b - a) * f : null;

  for (let i = 0; i < BATSIRAI_TRACK.length; i += 1) {
    const point = BATSIRAI_TRACK[i];
    const next = BATSIRAI_TRACK[i + 1];
    const r0 = radiiByTime.get(point.time);
    const t0 = Date.parse(point.time);

    // Point de trajectoire exact : on reprend les valeurs publiées telles quelles.
    samples.push({
      t: t0,
      lon: point.lon,
      lat: point.lat,
      r34: r0?.radius34ktKm ?? null,
      r50: r0?.radius50ktKm ?? null,
      r64: r0?.radius64ktKm ?? null,
      coreKm: null,
    });

    if (!next) {
      continue;
    }

    const r1 = radiiByTime.get(next.time);
    const t1 = Date.parse(next.time);
    for (let t = t0 + SAMPLE_STEP_MINUTES * 60_000; t < t1; t += SAMPLE_STEP_MINUTES * 60_000) {
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      samples.push({
        t,
        lon: point.lon + (next.lon - point.lon) * f,
        lat: point.lat + (next.lat - point.lat) * f,
        r34: lerp(r0?.radius34ktKm, r1?.radius34ktKm, f),
        r50: lerp(r0?.radius50ktKm, r1?.radius50ktKm, f),
        r64: lerp(r0?.radius64ktKm, r1?.radius64ktKm, f),
        coreKm: null,
      });
    }
  }

  samples.sort((a, b) => a.t - b.t);

  // Prolongation du dernier R50 publié (cœur du cyclone) quand il n'est plus documenté.
  let lastPublishedCore: number | null = null;
  for (const sample of samples) {
    if (sample.r50 != null) {
      lastPublishedCore = sample.r50;
    }
    sample.coreKm = lastPublishedCore;
  }

  return samples;
}

/**
 * Niveau d'une commune à un instant donné, d'après les rayons documentés.
 *  - ROUGE : dans le R64 ou dans le cœur (R50 publié / prolongé) — « passage ».
 *  - JAUNE : dans le R34 mais hors du cœur — « affectée ».
 *  - VERT  : hors du champ de vent.
 * Le cœur est plafonné par le R34 pour ne jamais dépasser la zone affectée.
 * Quand aucun seuil n'est documenté à cet instant, le niveau précédent est
 * conservé (on ne bascule pas une commune sur une donnée absente).
 */
export function classifyWind(lon: number, lat: number, sample: WindSample, previous: Level): Level {
  if (sample.r34 == null && sample.r50 == null && sample.r64 == null && sample.coreKm == null) {
    return previous;
  }
  const distance = haversineKm(lon, lat, sample.lon, sample.lat);
  // Le cœur est plafonné par le R34 pour ne jamais dépasser la zone affectée.
  const core =
    sample.coreKm == null
      ? null
      : sample.r34 == null
        ? sample.coreKm
        : Math.min(sample.coreKm, sample.r34);
  if ((sample.r64 != null && distance <= sample.r64) || (core != null && distance <= core)) {
    return 'ROUGE';
  }
  if (sample.r34 != null && distance <= sample.r34) {
    return 'JAUNE';
  }
  return 'VERT';
}

/**
 * Intervalles temporels d'alerte d'une commune le long de la trajectoire :
 * JAUNE dans R34, ROUGE dans le cœur (R50/R64, R50 prolongé), puis BLEU (danger
 * résiduel) à partir de sa sortie du champ de vent jusqu'à la fin de l'événement.
 * Les intervalles ne se chevauchent jamais : à chaque instant, un seul niveau
 * dynamique est actif.
 */
export function windIntervalsForCommune(
  communeId: string,
  lon: number,
  lat: number,
  samples: WindSample[],
  eventEndMs: number,
): AlertInterval[] {
  const intervals: AlertInterval[] = [];
  if (samples.length === 0) {
    return intervals;
  }

  let previous: Level = 'VERT';
  let current: Level | null = null;
  let runStart = samples[0].t;
  let lastExit: number | null = null;

  for (const sample of samples) {
    const level = classifyWind(lon, lat, sample, previous);
    previous = level;
    if (level !== current) {
      if ((current === 'ROUGE' || current === 'JAUNE') && sample.t > runStart) {
        intervals.push({ communeId, level: current, from: runStart, to: sample.t });
        lastExit = sample.t;
      }
      current = level;
      runStart = sample.t;
    }
  }

  const lastSampleTime = samples[samples.length - 1].t;
  if ((current === 'ROUGE' || current === 'JAUNE') && lastSampleTime > runStart) {
    intervals.push({ communeId, level: current, from: runStart, to: lastSampleTime });
    lastExit = lastSampleTime;
  }
  if (lastExit != null && lastExit < eventEndMs) {
    intervals.push({ communeId, level: 'BLEU', from: lastExit, to: eventEndMs });
  }

  return intervals;
}

/** Métadonnées (source + commentaire) associées à chaque niveau dynamique. */
const WIND_LEVEL_META: Record<
  'ROUGE' | 'JAUNE' | 'BLEU',
  { name: string; url: string; comment: string }
> = {
  ROUGE: {
    name: WIND_SOURCE_NAME,
    url: WIND_SOURCE_URL,
    comment:
      "Cyclone (passage) : commune à l'intérieur du cœur du cyclone — rayon de vent ≥ 50 kt " +
      '(R50/R64) documenté par la RSMC La Réunion le long de la trajectoire observée ' +
      '(IBTrACS v04r01). Après la dernière publication du R50, la dernière valeur publiée ' +
      'est prolongée (persistance), sans valeur inventée.',
  },
  JAUNE: {
    name: WIND_SOURCE_NAME,
    url: WIND_SOURCE_URL,
    comment:
      "Commune affectée : à l'intérieur du rayon de vent ≥ 34 kt (R34) mais hors du cœur " +
      '(hors R50/R64) documenté (RSMC La Réunion / IBTrACS v04r01).',
  },
  BLEU: {
    name: RESIDUAL_SOURCE_NAME,
    url: RESIDUAL_SOURCE_URL,
    comment:
      "Fin d'alerte progressive : le cercle du cyclone ne touche plus la commune " +
      '(sortie du rayon de vent ≥ 34 kt). Des dangers persistent (pluies ' +
      'torrentielles, crues, vents résiduels), reportés depuis les inondations ' +
      "observées par satellite jusqu'au 10 février 2022.",
  },
};

interface WindAlertCounts {
  ROUGE: number;
  JAUNE: number;
  BLEU: number;
}

/**
 * Niveau de base VERT : toute commune est « safe » tant qu'elle n'est pas dans le
 * champ de vent documenté. Ces lignes couvrent la totalité de l'événement et sont
 * recolorées par les intervalles JAUNE / ROUGE / BLEU lorsqu'ils s'appliquent
 * (leur `valid_from` plus récent l'emporte à rang égal).
 */
async function insertBaseVert(client: pg.PoolClient, eventId: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT $1, c.id, 'VERT', $2::timestamptz, $3::timestamptz,
            'ESTIMATION', 'COMMUNE', $4, $5,
            'Hors du champ de vent documenté (rayons R34/R50/R64 de la RSMC La Réunion) '
              || 'à cet instant : pas de menace publiée (niveau vert). Niveau de base '
              || 'estimé ; toute commune entrant dans le champ de vent est recolorée '
              || 'en jaune (R34) ou rouge (R50/R64), puis en bleu à sa sortie.'
       FROM communes c`,
    [eventId, EVENT_START, EVENT_ENDED_AT, WIND_SOURCE_NAME, WIND_SOURCE_URL],
  );
  return res.rowCount ?? 0;
}

/** Échappe une chaîne pour l'inliner comme littéral SQL (apostrophes doublées). */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Insère par lots les intervalles d'un même niveau (source/commentaire idem). */
async function insertAlertIntervals(
  client: pg.PoolClient,
  eventId: string,
  intervals: AlertInterval[],
  level: 'ROUGE' | 'JAUNE' | 'BLEU',
): Promise<number> {
  if (intervals.length === 0) {
    return 0;
  }
  const meta = WIND_LEVEL_META[level];
  const chunkSize = 4000;
  let inserted = 0;

  for (let i = 0; i < intervals.length; i += chunkSize) {
    const chunk = intervals.slice(i, i + chunkSize);
    const params: unknown[] = [eventId];
    const tuples = chunk.map((interval, index) => {
      const offset = 2 + index * 3;
      params.push(
        interval.communeId,
        new Date(interval.from).toISOString(),
        new Date(interval.to).toISOString(),
      );
      return (
        `($1, $${offset}, ${sqlLiteral(level)}, ` +
        `$${offset + 1}::timestamptz, $${offset + 2}::timestamptz, ` +
        `'ESTIMATION', 'COMMUNE', ${sqlLiteral(meta.name)}, ` +
        `${sqlLiteral(meta.url)}, ${sqlLiteral(meta.comment)})`
      );
    });

    const res = await client.query(
      `INSERT INTO event_commune_alert_history
         (event_id, commune_id, alert_level, valid_from, valid_to,
          info_type, territory_scope, source_name, source_url, comment)
       VALUES ${tuples.join(', ')}`,
      params,
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

/** Calcule puis insère tous les intervalles JAUNE / ROUGE / BLEU par commune. */
async function insertWindAlerts(client: pg.PoolClient, eventId: string): Promise<WindAlertCounts> {
  const samples = buildWindSamples();
  const eventEndMs = Date.parse(EVENT_ENDED_AT);
  const communes = await client.query<{ id: string; lon: number; lat: number }>(
    `SELECT id, ST_X(centroid)::float8 AS lon, ST_Y(centroid)::float8 AS lat
       FROM communes
      WHERE centroid IS NOT NULL`,
  );

  const all: AlertInterval[] = [];
  for (const commune of communes.rows) {
    all.push(...windIntervalsForCommune(commune.id, commune.lon, commune.lat, samples, eventEndMs));
  }

  const counts: WindAlertCounts = { ROUGE: 0, JAUNE: 0, BLEU: 0 };
  for (const level of ['ROUGE', 'JAUNE', 'BLEU'] as const) {
    counts[level] = await insertAlertIntervals(
      client,
      eventId,
      all.filter((interval) => interval.level === level),
      level,
    );
  }
  return counts;
}

/**
 * Signale les bulletins sans liste de territoires : un niveau global ne permet
 * pas d'attribuer une alerte à des communes sans inventer la donnée.
 */
async function reportGlobalOnlyBulletins(client: pg.PoolClient, eventId: string): Promise<void> {
  const res = await client.query<{
    title: string;
    alert_level: string | null;
    alert_levels: Record<string, unknown> | null;
  }>(
    `SELECT title, alert_level, alert_levels
       FROM weather_bulletins
      WHERE event_id = $1
      ORDER BY published_at ASC`,
    [eventId],
  );
  for (const b of res.rows) {
    const keys = b.alert_levels ? Object.keys(b.alert_levels) : [];
    const onlyGlobal = keys.length === 0 || (keys.length === 1 && keys[0] === 'global');
    if (onlyGlobal) {
      console.log(
        `  ⚠ « ${b.title} » : niveau global « ${b.alert_level ?? 'inconnu'} » sans liste de ` +
          'territoires. Aucune commune ne peut en être déduite sans inventer : aucune ligne ' +
          "n'est créée pour ce bulletin (donnée indisponible à l'échelle communale).",
      );
    }
  }
}

export interface BatsiraiAlertsReport {
  eventId: string;
  total: number;
  byLevel: Record<Level, number>;
  byScope: Record<Scope, number>;
}

export async function runBatsiraiAlertsSeed(): Promise<BatsiraiAlertsReport> {
  const { env } = await import('../../src/config/env');
  const { assertLocalDbWritable } = await import('./assert-local-db');
  assertLocalDbWritable({ databaseUrl: env.DATABASE_URL, host: env.DB_HOST });

  const connectionString =
    env.DATABASE_URL ??
    `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  const pool = new pg.Pool({
    connectionString,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });
  const client = await pool.connect();

  try {
    console.log('--- Alertes communales Batsirai 2022 ---\n');
    await client.query('BEGIN');

    const found = await client.query<{ id: string }>(
      'SELECT id FROM hazard_events WHERE event_code = $1',
      [EVENT_CODE],
    );
    if (found.rows.length === 0) {
      throw new Error(
        `Événement ${EVENT_CODE} introuvable. Exécutez d'abord « npm run db:seed:batsirai ».`,
      );
    }
    const eventId = found.rows[0].id;

    await client.query('DELETE FROM event_commune_alert_history WHERE event_id = $1', [eventId]);

    const baseRows = await insertBaseVert(client, eventId);
    const wind = await insertWindAlerts(client, eventId);

    const counts = await client.query<{ level: string; scope: string; n: number }>(
      `SELECT alert_level AS level, territory_scope AS scope, COUNT(*)::int AS n
         FROM event_commune_alert_history
        WHERE event_id = $1
        GROUP BY alert_level, territory_scope`,
      [eventId],
    );

    const byLevel: Record<Level, number> = { VERT: 0, JAUNE: 0, ROUGE: 0, BLEU: 0 };
    const byScope: Record<Scope, number> = { COMMUNE: 0, DISTRICT: 0, REGION: 0, EVENEMENT: 0 };
    let total = 0;
    for (const row of counts.rows) {
      byLevel[row.level as Level] = (byLevel[row.level as Level] ?? 0) + row.n;
      byScope[row.scope as Scope] = (byScope[row.scope as Scope] ?? 0) + row.n;
      total += row.n;
    }

    console.log(`  ✓ Niveau de base VERT (safe, hors champ de vent) : ${baseRows} lignes.`);
    console.log(
      `  ✓ Zones dynamiques — ROUGE (cœur, R50/R64 prolongés) : ${wind.ROUGE} ; ` +
        `JAUNE (≤ R34) : ${wind.JAUNE} ; BLEU (sortie de rayon) : ${wind.BLEU} intervalles.`,
    );
    console.log(
      `  ✓ ${total} lignes au total — par niveau : ${JSON.stringify(byLevel)} ; par portée : ${JSON.stringify(byScope)}.`,
    );
    await reportGlobalOnlyBulletins(client, eventId);

    await client.query('COMMIT');

    return { eventId, total, byLevel, byScope };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import des alertes communales échoué :', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return entry ? path.resolve(entry) === path.resolve(__filename) : false;
}

if (isDirectInvocation()) {
  runBatsiraiAlertsSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
