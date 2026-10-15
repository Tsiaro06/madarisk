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

/**
 * Logique de coloration vent PARTAGÉE avec l'ingestion temps réel : le seed ne
 * doit pas en diverger. Les types et fonctions pures vivent dans
 * `src/services/cyclone/cyclone-coloring.logic.ts` et sont ré-exportés ici pour
 * que le seed reste la référence lisible de Batsirai 2022.
 */
import {
  buildWindSamples as sampleWindAnchors,
  classifyWind,
  SAMPLE_STEP_MINUTES,
  windIntervalsForCommune,
  type CommuneAlertInterval,
  type WindAnchor,
  type WindSample,
} from '../../src/services/cyclone/cyclone-coloring.logic';

export { classifyWind, windIntervalsForCommune, type WindSample };
export type AlertInterval = CommuneAlertInterval;

/**
 * Échantillonne la trajectoire observée de Batsirai et ses rayons de vent
 * documentés (mêmes fonctions pures que l'ingestion temps réel).
 */
export function buildWindSamples(): WindSample[] {
  const radiiByTime = new Map(BATSIRAI_RADII.map((r) => [r.time, r]));
  const anchors: WindAnchor[] = BATSIRAI_TRACK.map((point) => {
    const radii = radiiByTime.get(point.time);
    return {
      t: Date.parse(point.time),
      lon: point.lon,
      lat: point.lat,
      r34: radii?.radius34ktKm ?? null,
      r50: radii?.radius50ktKm ?? null,
      r64: radii?.radius64ktKm ?? null,
    };
  });
  return sampleWindAnchors(anchors, SAMPLE_STEP_MINUTES);
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
        // Batsirai est clos : `to` est toujours daté (jamais null ici).
        interval.to === null ? null : new Date(interval.to).toISOString(),
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
