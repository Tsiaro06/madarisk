import path from 'path';
import pg from 'pg';
import { GEZANI_TRACK, GEZANI_REGION_DISTRICTS } from '../seeds/gezani-2026';
import { GEZANI_RADII } from '../seeds/gezani-2026-radii';
import {
  GEZANI_BULLETINS,
  GEZANI_DISTRICT_ALIASES,
  type GezaniAlertLevel,
  type GezaniBulletin,
} from '../seeds/gezani-2026-bulletins';
import {
  buildWindSamples as sampleWindAnchors,
  SAMPLE_STEP_MINUTES,
  windIntervalsForCommune,
  type CommuneAlertInterval,
  type WindAnchor,
  type WindSample,
} from '../../src/services/cyclone/cyclone-coloring.logic';

/**
 * Import des niveaux d'alerte cyclonique de l'événement historique
 * « Cyclone Gezani — février 2026 » dans `event_commune_alert_history`.
 *
 * Deux sources distinctes, jamais mélangées :
 *
 * 1. ALERTES OFFICIELLES (`info_type = OFFICIELLE`) — reproduites telles que la
 *    Direction Générale de la Météorologie (DGM — Météo Madagascar) les a
 *    publiées, bulletin par bulletin (`seeds/gezani-2026-bulletins.ts`).
 *    Le script rejoue les 23 bulletins spéciaux comme une machine à états :
 *      • un territoire cité par un bulletin prend le niveau annoncé ;
 *      • un territoire non cité CONSERVE son niveau précédent (aucune couleur
 *        n'est retirée sans que le bulletin ne le dise) ;
 *      • « Foana ny filazana loza » / « Alerte levée » supprime le niveau :
 *        la commune repasse GRIS (aucune ligne active) ;
 *      • un district explicitement cité l'emporte sur le niveau de sa région
 *        et n'est jamais recoloré par l'extension régionale du même bulletin ;
 *      • les bulletins flash « Vaovao Tselatra » ne publient PAS la répartition
 *        des alertes : ils ne modifient aucun niveau.
 *    Portée stockée : `REGION` quand la DGM a nommé la région (le niveau est
 *    alors hérité par toutes ses communes — signalé comme estimation spatiale
 *    dans l'interface), `DISTRICT` quand elle a nommé le district.
 *    Aucun niveau VERT « par défaut » n'est créé : une commune non concernée
 *    reste GRIS, exactement comme la DGM la laisse.
 *
 * 2. ESTIMATIONS DE VENT (`info_type = ESTIMATION`, portée `COMMUNE`) — rayons
 *    R34/R50/R64 réellement publiés par la RSMC La Réunion (IBTrACS v04r01),
 *    via la logique de coloration partagée avec l'ingestion temps réel
 *    (`src/services/cyclone/cyclone-coloring.logic.ts`). Elles ne servent que
 *    là où AUCUNE alerte officielle n'existe : la précédence de
 *    `events.repository.ts` donne toujours la priorité à l'OFFICIELLE.
 *
 * Idempotence : relancer le script supprime puis réinsère toutes les lignes
 * d'alerte de l'événement.
 *
 * Exécution : `npm run db:seed:gezani-alerts`
 */

const EVENT_CODE = 'HIST-GEZANI-2026';

/** Fin de l'événement (transition extratropicale, IBTrACS) : borne des estimations. */
const EVENT_ENDED_AT = '2026-02-18T00:00:00Z';

const BULLETIN_SOURCE_URL = 'https://meteomadagascar.mg';

const WIND_SOURCE_NAME =
  'RSMC La Réunion (Météo-France) — rayons de vent IBTrACS v04r01 (2026035S11065)';
const WIND_SOURCE_URL = 'https://ncics.org/ibtracs/index.php?name=v04r01-2026035S11065';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

type Scope = 'COMMUNE' | 'DISTRICT' | 'REGION' | 'EVENEMENT';

/** Échappe une chaîne pour l'inliner comme littéral SQL (apostrophes doublées). */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** « 2026-02-10T16:00:00+03:00 » → « 10 février 2026 à 16h00 (heure de Madagascar) ». */
function frenchPublication(publishedAt: string): string {
  const [datePart, timePart] = publishedAt.split('T');
  const [year, month, day] = datePart.split('-');
  const hhmm = timePart.slice(0, 5).replace(':', 'h');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year} à ${hhmm} (heure de Madagascar)`;
}

/**
 * Bulletins triés par heure de publication. Les flashs, qui ne publient aucune
 * répartition d'alerte, sont ignorés par la machine à états.
 */
function sortedSpecialBulletins(): GezaniBulletin[] {
  return GEZANI_BULLETINS.filter((bulletin) => bulletin.kind === 'SPECIAL').sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  );
}

interface DistrictRef {
  id: string;
  name: string;
}

interface LevelEntry {
  level: GezaniAlertLevel;
  scope: 'REGION' | 'DISTRICT';
  /** Région DGM à l'origine d'un niveau hérité (scope REGION). */
  region: string | null;
  /** Nom du territoire tel que publié par la DGM (région ou district). */
  territory: string;
  bulletin: GezaniBulletin;
}

interface DistrictInterval {
  district: DistrictRef;
  level: GezaniAlertLevel;
  scope: 'REGION' | 'DISTRICT';
  region: string | null;
  territory: string;
  bulletin: GezaniBulletin;
  from: number;
  to: number | null;
}

/** Échantillonne la trajectoire observée de Gezani et ses rayons documentés. */
export function buildWindSamples(): WindSample[] {
  const radiiByTime = new Map(GEZANI_RADII.map((r) => [r.time, r]));
  const anchors: WindAnchor[] = GEZANI_TRACK.map((point) => {
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

/** Charge les districts de la base (nom normalisé → référence). */
async function loadDistricts(client: pg.PoolClient): Promise<Map<string, DistrictRef>> {
  const result = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM districts ORDER BY name',
  );
  const map = new Map<string, DistrictRef>();
  for (const row of result.rows) {
    map.set(normalizeName(row.name), { id: row.id, name: row.name });
  }
  return map;
}

/**
 * Rejoue les bulletins spéciaux et produit les intervalles de niveau par
 * district. La machine à états est volontairement explicite : chaque fermeture
 * d'intervalle correspond à une décision PUBLIÉE par la DGM.
 */
function replayBulletins(
  districts: Map<string, DistrictRef>,
  warnings: string[],
): DistrictInterval[] {
  const intervals: DistrictInterval[] = [];
  const byId = new Map<string, DistrictRef>();
  for (const district of districts.values()) byId.set(district.id, district);
  /** État courant : district id → niveau en vigueur (null = alerte levée). */
  let state = new Map<string, LevelEntry | null>();
  /** Ouverture de l'intervalle courant, par district. */
  const openSince = new Map<string, number>();

  const resolveDistrict = (published: string): DistrictRef | null => {
    const name = GEZANI_DISTRICT_ALIASES[published] ?? published;
    const found = districts.get(normalizeName(name));
    if (!found) {
      warnings.push(`district « ${published} » introuvable dans la base`);
    }
    return found ?? null;
  };

  const regionDistricts = (regionName: string): string[] => {
    const names = GEZANI_REGION_DISTRICTS[regionName];
    if (!names) {
      warnings.push(`région « ${regionName} » absente de GEZANI_REGION_DISTRICTS`);
      return [];
    }
    const ids: string[] = [];
    for (const name of names) {
      const found = districts.get(normalizeName(name));
      if (!found) {
        warnings.push(`district « ${name} » de la région ${regionName} introuvable en base`);
        continue;
      }
      ids.push(found.id);
    }
    return ids;
  };

  for (const bulletin of sortedSpecialBulletins()) {
    const at = Date.parse(bulletin.publishedAt);
    const previous = state;
    const next = new Map(previous);

    // 1. Levées explicites : région nommée → tous ses districts.
    for (const region of bulletin.lifted.regions) {
      for (const id of regionDistricts(region)) {
        next.delete(id);
      }
    }
    const liftedDistrictIds = new Set<string>();
    for (const published of bulletin.lifted.districts) {
      const found = resolveDistrict(published);
      if (found) {
        liftedDistrictIds.add(found.id);
        next.delete(found.id);
      }
    }

    // 2. Niveaux annoncés par région : extension à tous ses districts, sauf
    //    ceux explicitement cités (district prioritaire) ou levés par ce bulletin.
    const explicitDistrictIds = new Set<string>();
    for (const group of bulletin.alerts) {
      for (const published of group.districts) {
        const found = resolveDistrict(published);
        if (found) explicitDistrictIds.add(found.id);
      }
    }
    for (const group of bulletin.alerts) {
      for (const region of group.regions) {
        for (const id of regionDistricts(region)) {
          if (explicitDistrictIds.has(id) || liftedDistrictIds.has(id)) continue;
          next.set(id, {
            level: group.level,
            scope: 'REGION',
            region,
            territory: region,
            bulletin,
          });
        }
      }
    }

    // 3. Niveaux annoncés par district : priorité absolue sur la région.
    for (const group of bulletin.alerts) {
      for (const published of group.districts) {
        const found = resolveDistrict(published);
        if (!found) continue;
        next.set(found.id, {
          level: group.level,
          scope: 'DISTRICT',
          region: null,
          territory: found.name,
          bulletin,
        });
      }
    }

    // 4. Diff des états : ferme ce qui change, ouvre ce qui apparaît.
    const changed = new Set<string>();
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const before = previous.get(id) ?? null;
      const after = next.get(id) ?? null;
      const same =
        before === null
          ? after === null
          : after !== null &&
            before.level === after.level &&
            before.scope === after.scope &&
            before.region === after.region;
      if (!same) changed.add(id);
    }

    for (const id of changed) {
      const district = byId.get(id);
      if (!district) continue;
      const before = previous.get(id) ?? null;
      const after = next.get(id) ?? null;

      if (before !== null) {
        intervals.push({
          district,
          level: before.level,
          scope: before.scope,
          region: before.region,
          territory: before.territory,
          bulletin: before.bulletin,
          from: openSince.get(id) ?? at,
          to: at - 1,
        });
        openSince.delete(id);
      }
      if (after !== null) {
        openSince.set(id, at);
      }
    }

    state = next;
  }

  // Dernier état : clos par le dernier bulletin s'il lève tout (le cas échéant,
  // la dernière publication est justement une levée, donc state est vide).
  for (const [id, entry] of state) {
    if (entry === null) continue;
    const district = byId.get(id);
    if (!district) continue;
    intervals.push({
      district,
      level: entry.level,
      scope: entry.scope,
      region: entry.region,
      territory: entry.territory,
      bulletin: entry.bulletin,
      from: openSince.get(id) ?? Date.parse(entry.bulletin.publishedAt),
      to: null,
    });
  }

  return intervals;
}

/** Commentaire tracé de chaque ligne officielle (source, portée, décision). */
function officialComment(interval: DistrictInterval): string {
  const when = frenchPublication(interval.bulletin.publishedAt);
  if (interval.scope === 'REGION') {
    return (
      `Alerte ${interval.level.toLowerCase()} publiée par la DGM pour la région ` +
      `${interval.region} (bulletin cyclonique N° ${interval.bulletin.reference} du ${when}). ` +
      'Le bulletin nomme la région, pas la commune : le niveau est reporté à chaque ' +
      'commune de la région (héritage spatial, signalé comme estimation dans l\'interface).'
    );
  }
  return (
    `Alerte ${interval.level.toLowerCase()} publiée par la DGM pour le district de ` +
    `${interval.territory} (bulletin cyclonique N° ${interval.bulletin.reference} du ${when}). ` +
    'District nommé explicitement : le niveau n\'est pas déduit de sa région.'
  );
}

/** Insère les intervalles officiels (extension région/district → communes). */
async function insertOfficialIntervals(
  client: pg.PoolClient,
  eventId: string,
  intervals: DistrictInterval[],
): Promise<number> {
  const chunkSize = 200;
  let inserted = 0;

  for (let i = 0; i < intervals.length; i += chunkSize) {
    const chunk = intervals.slice(i, i + chunkSize);
    const values = chunk.map((interval) => {
      const source = `DGM — Météo Madagascar, bulletin cyclonique N° ${interval.bulletin.reference}`;
      return (
        `(${sqlLiteral(interval.district.id)}::uuid, ` +
        `${sqlLiteral(interval.level)}, ` +
        `${sqlLiteral(new Date(interval.from).toISOString())}::timestamptz, ` +
        `${interval.to === null ? 'NULL' : `${sqlLiteral(new Date(interval.to).toISOString())}::timestamptz`}, ` +
        `${sqlLiteral(interval.scope)}, ${sqlLiteral(source)}, ` +
        `${sqlLiteral(BULLETIN_SOURCE_URL)}, ${sqlLiteral(officialComment(interval))})`
      );
    });

    const result = await client.query(
      `INSERT INTO event_commune_alert_history
         (event_id, commune_id, alert_level, valid_from, valid_to,
          info_type, territory_scope, source_name, source_url, comment)
       SELECT $1, c.id, v.level, v.valid_from, v.valid_to,
              'OFFICIELLE', v.scope, v.source_name, v.source_url, v.comment
         FROM (VALUES ${values.join(', ')})
           AS v(district_id, level, valid_from, valid_to, scope, source_name, source_url, comment)
         JOIN communes c ON c.district_id = v.district_id`,
      [eventId],
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

/** Métadonnées (source + commentaire) des estimations dérivées du vent. */
const WIND_LEVEL_META: Record<'ROUGE' | 'JAUNE' | 'BLEU', string> = {
  ROUGE:
    "Estimation de vent : commune à l'intérieur du cœur du cyclone — rayon de vent " +
    '≥ 50 kt (R50) publié par la RSMC La Réunion le long de la trajectoire observée ' +
    '(IBTrACS v04r01). Aucun rayon ≥ 64 kt n\'a été publié pour Gezani ; après la ' +
    'dernière publication du R50, la dernière valeur publiée est prolongée (persistance).',
  JAUNE:
    "Estimation de vent : commune à l'intérieur du rayon de vent ≥ 34 kt (R34) mais hors " +
    'du cœur (hors R50), rayons publiés par la RSMC La Réunion (IBTrACS v04r01).',
  BLEU:
    "Fin d'alerte estimée : le cercle du cyclone ne touche plus la commune (sortie du " +
    'rayon de vent ≥ 34 kt). Des dangers résiduels persistent (pluies, crues, vents). ' +
    'Cette estimation ne remplace jamais une alerte officielle de la DGM.',
};

/** Insère par lots les estimations d'un même niveau. */
async function insertWindIntervals(
  client: pg.PoolClient,
  eventId: string,
  intervals: Array<{ communeId: string; from: number; to: number | null }>,
  level: 'ROUGE' | 'JAUNE' | 'BLEU',
): Promise<number> {
  const chunkSize = 2000;
  let inserted = 0;

  for (let i = 0; i < intervals.length; i += chunkSize) {
    const chunk = intervals.slice(i, i + chunkSize);
    const params: unknown[] = [eventId];
    const tuples = chunk.map((interval, index) => {
      const offset = 2 + index * 3;
      params.push(
        interval.communeId,
        new Date(interval.from).toISOString(),
        interval.to === null ? null : new Date(interval.to).toISOString(),
      );
      return (
        `($1, $${offset}::uuid, ${sqlLiteral(level)}, ` +
        `$${offset + 1}::timestamptz, $${offset + 2}::timestamptz, ` +
        `'ESTIMATION', 'COMMUNE', ${sqlLiteral(WIND_SOURCE_NAME)}, ` +
        `${sqlLiteral(WIND_SOURCE_URL)}, ${sqlLiteral(WIND_LEVEL_META[level])})`
      );
    });

    const result = await client.query(
      `INSERT INTO event_commune_alert_history
         (event_id, commune_id, alert_level, valid_from, valid_to,
          info_type, territory_scope, source_name, source_url, comment)
       VALUES ${tuples.join(', ')}`,
      params,
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

/** Calcule puis insère les estimations JAUNE / ROUGE / BLEU par commune. */
async function insertWindAlerts(
  client: pg.PoolClient,
  eventId: string,
): Promise<Record<'ROUGE' | 'JAUNE' | 'BLEU', number>> {
  const samples = buildWindSamples();
  const eventEndMs = Date.parse(EVENT_ENDED_AT);
  const communes = await client.query<{ id: string; lon: number; lat: number }>(
    `SELECT id, ST_X(centroid)::float8 AS lon, ST_Y(centroid)::float8 AS lat
       FROM communes
      WHERE centroid IS NOT NULL`,
  );

  const all: CommuneAlertInterval[] = [];
  for (const commune of communes.rows) {
    all.push(...windIntervalsForCommune(commune.id, commune.lon, commune.lat, samples, eventEndMs));
  }

  const counts = { ROUGE: 0, JAUNE: 0, BLEU: 0 };
  for (const level of ['ROUGE', 'JAUNE', 'BLEU'] as const) {
    counts[level] = await insertWindIntervals(
      client,
      eventId,
      all.filter((interval) => interval.level === level),
      level,
    );
  }
  return counts;
}

export interface GezaniAlertsReport {
  eventId: string;
  total: number;
  official: number;
  byLevel: Record<GezaniAlertLevel, number>;
  byScope: Record<Scope, number>;
  districtsWithAlert: number;
  warnings: string[];
}

export async function runGezaniAlertsSeed(): Promise<GezaniAlertsReport> {
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
    console.log('--- Alertes communales Gezani 2026 ---\n');
    await client.query('BEGIN');

    const found = await client.query<{ id: string }>(
      'SELECT id FROM hazard_events WHERE event_code = $1',
      [EVENT_CODE],
    );
    if (found.rows.length === 0) {
      throw new Error(
        `Événement ${EVENT_CODE} introuvable. Exécutez d'abord « npm run db:seed:gezani ».`,
      );
    }
    const eventId = found.rows[0].id;

    await client.query('DELETE FROM event_commune_alert_history WHERE event_id = $1', [eventId]);

    const warnings: string[] = [];
    const districts = await loadDistricts(client);
    const intervals = replayBulletins(districts, warnings);
    const official = await insertOfficialIntervals(client, eventId, intervals);
    const wind = await insertWindAlerts(client, eventId);

    const openIntervals = intervals.filter((interval) => interval.to === null).length;
    const districtsWithAlert = new Set(intervals.map((interval) => interval.district.id)).size;

    const counts = await client.query<{ level: string; scope: string; n: number }>(
      `SELECT alert_level AS level, territory_scope AS scope, COUNT(*)::int AS n
         FROM event_commune_alert_history
        WHERE event_id = $1
        GROUP BY alert_level, territory_scope`,
      [eventId],
    );

    const byLevel: Record<GezaniAlertLevel, number> = { VERT: 0, JAUNE: 0, ROUGE: 0, BLEU: 0 };
    const byScope: Record<Scope, number> = { COMMUNE: 0, DISTRICT: 0, REGION: 0, EVENEMENT: 0 };
    let total = 0;
    for (const row of counts.rows) {
      byLevel[row.level as GezaniAlertLevel] =
        (byLevel[row.level as GezaniAlertLevel] ?? 0) + row.n;
      byScope[row.scope as Scope] = (byScope[row.scope as Scope] ?? 0) + row.n;
      total += row.n;
    }

    console.log(
      `  ✓ Alertes officielles DGM : ${official} lignes ` +
        `(${intervals.length} intervalles de district sur ${districtsWithAlert} districts).`,
    );
    console.log(
      `  ✓ Estimations de vent — ROUGE : ${wind.ROUGE} ; JAUNE : ${wind.JAUNE} ; ` +
        `BLEU : ${wind.BLEU} intervalles communaux.`,
    );
    console.log(
      `  ✓ ${total} lignes au total — par niveau : ${JSON.stringify(byLevel)} ; ` +
        `par portée : ${JSON.stringify(byScope)}.`,
    );
    if (openIntervals > 0) {
      console.log(
        `  ⚠ ${openIntervals} intervalle(s) officiel(s) sans fin : le dernier bulletin ` +
          'spécial ne lève pas explicitement ce territoire.',
      );
    }
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`);
    }

    await client.query('COMMIT');

    return {
      eventId,
      total,
      official,
      byLevel,
      byScope,
      districtsWithAlert,
      warnings,
    };
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
  runGezaniAlertsSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
