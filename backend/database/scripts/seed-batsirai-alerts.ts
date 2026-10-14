import path from 'path';
import pg from 'pg';

/**
 * Import des niveaux d'alerte cyclonique communaux de l'événement historique
 * « Cyclone Batsirai — février 2022 » dans `event_commune_alert_history`.
 *
 * Objectif : permettre à la carte de la salle de crise de colorer chaque commune
 * selon le niveau d'alerte officiel malgache (VERT / JAUNE / ROUGE / BLEU) à
 * l'instant consulté, en conservant la traçabilité complète (validité, nature de
 * l'information, source, commentaire).
 *
 * Principe de non-invention :
 *  - Le bulletin du 4 février 2022 ne cite QUE des régions (rouge/jaune) et des
 *    districts (vert), jamais des communes. Chaque commune hérite donc du niveau
 *    de son district / de sa région : la donnée est enregistrée
 *    `info_type = ESTIMATION` avec `territory_scope = DISTRICT | REGION` et un
 *    commentaire qui rappelle que le niveau est hérité. L'interface signale cette
 *    estimation spatiale.
 *  - Les impacts observés proviennent uniquement de `event_commune_impacts`
 *    (méthode PostGIS documentée, alimentée par `db:seed:batsirai`). Aucun impact
 *    communal n'est inventé.
 *  - Le bulletin du 1er février ne publie qu'un niveau global « VERTE » sans
 *    liste de territoires : aucune commune ne peut en être déduite. Le script le
 *    signale explicitement au lieu d'inventer une liste.
 *
 * Idempotence : relancer le script supprime puis réinsère toutes les lignes
 * d'alerte communale de l'événement. Il suppose que `db:seed:batsirai` a déjà été
 * exécuté (événement, bulletins et impacts créés).
 *
 * Exécution : `npm run db:seed:batsirai-alerts`
 */

const EVENT_CODE = 'HIST-BATSIRAI-2022';

/** Bulletin officiel porteur des niveaux communaux (hérités région/district). */
const BULLETIN_SOURCE_NAME = 'Météo Madagascar — Bulletin cyclonique du 4 février 2022';
const BULLETIN_SOURCE_URL = 'https://meteomadagascar.mg';
/** Validité officielle du bulletin du 4 février (16h00, heure de Madagascar). */
const BULLETIN_VALID_FROM = '2022-02-04T16:00:00+03:00';
const BULLETIN_VALID_TO = '2022-02-08T00:00:00+03:00';

/** Fin officielle de l'événement : borne des dangers résiduels documentés. */
const EVENT_ENDED_AT = '2022-02-11T00:00:00Z';

/** Source de repli de la ligne d'impact (best track IBTrACS). */
const IMPACT_SOURCE_URL_FALLBACK = 'https://ncics.org/ibtracs/index.php?name=v04r01-2022024S09090';

/**
 * Dangers résiduels après le passage du centre (crues, inondations) : documentés
 * à l'échelle de l'événement (inondations observées par satellite jusqu'au
 * 10 février 2022). Le report au niveau communal est une ESTIMATION dérivée des
 * communes à impact observé — jamais une donnée communale publiée.
 */
const RESIDUAL_SOURCE_NAME =
  "NASA Earth Observatory — inondations observées jusqu'au 10 février 2022";
const RESIDUAL_SOURCE_URL =
  'https://earthobservatory.nasa.gov/images/149434/cyclone-batsirai-soaks-madagascar';

type Level = 'VERT' | 'JAUNE' | 'ROUGE' | 'BLEU';
type Scope = 'COMMUNE' | 'DISTRICT' | 'REGION' | 'EVENEMENT';

interface RegionAlert {
  /** Nom de la région tel que publié par le bulletin. */
  region: string;
  level: Level;
  /** Districts (noms en base) dont l'union couvre la région. */
  districts: string[];
}

/**
 * Correspondance « région citée par le bulletin » -> districts en base.
 * Reprise à l'identique de `ZONES` dans `seed-batsirai.ts` (les géométries des
 * zones de vigilance y sont déjà assemblées à partir de ces mêmes districts).
 */
const RED_REGIONS: RegionAlert[] = [
  {
    region: 'Atsinanana',
    level: 'ROUGE',
    districts: [
      'Antanambao Manampontsy',
      'Brickaville',
      'Mahanoro',
      'Marolambo',
      'Toamasina I',
      'Toamasina II',
      'Vatomandry',
    ],
  },
  {
    region: 'Vatovavy',
    level: 'ROUGE',
    districts: ['Ifanadiana', 'Mananjary', 'Nosy-Varika'],
  },
  {
    region: 'Fitovinany',
    level: 'ROUGE',
    districts: ['Ikongo', 'Manakara Atsimo', 'Vohipeno'],
  },
  {
    region: 'Atsimo Atsinanana',
    level: 'ROUGE',
    districts: ['Befotaka', 'Farafangana', 'Midongy-Atsimo', 'Vangaindrano', 'Vondrozo'],
  },
  {
    region: 'Analamanga',
    level: 'ROUGE',
    districts: [
      // Antananarivo-Renivohitra est modélisée en six arrondissements : la
      // capitale appartient à la région Analamanga, placée en rouge.
      '1er Arrondissement',
      '2e Arrondissement',
      '3e Arrondissement',
      '4e Arrondissement',
      '5e Arrondissement',
      '6e Arrondissement',
      'Ambohidratrimo',
      'Andramasina',
      'Anjozorobe',
      'Ankazobe',
      'Antananarivo Atsimondrano',
      'Antananarivo Avaradrano',
      'Manjakandriana',
    ],
  },
  {
    // Le bulletin du 4 février 2022 cite « MANGORO » en alerte rouge. Cette
    // région (Alaotra-Mangoro) n'est pas citée nominativement ailleurs : les
    // districts AMPARAFARAVOLA et ANDILAMENA sont explicitement mentionnés
    // respectivement en jaune et en vert dans le même bulletin. L'inclusion ici
    // n'affecte donc que les districts non nommés explicitement (Moramanga,
    // Anosibe-An'ala), ce qui corrige les « trous » dans Alaotra-Mangoro.
    region: 'Mangoro',
    level: 'ROUGE',
    districts: ["Anosibe-An'ala", 'Moramanga'],
  },
];

const YELLOW_REGIONS: RegionAlert[] = [
  { region: 'Bongolava', level: 'JAUNE', districts: ['Fenoarivobe', 'Tsiroanomandidy'] },
  {
    region: 'Menabe',
    level: 'JAUNE',
    districts: ['Belo Sur Tsiribihina', 'Mahabo', 'Manja', 'Miandrivazo', 'Morondava'],
  },
  {
    region: 'Atsimo Andrefana',
    level: 'JAUNE',
    districts: [
      'Ampanihy Ouest',
      'Ankazoabo',
      'Benenitra',
      'Beroroha',
      'Betioky Atsimo',
      'Morombe',
      'Sakaraha',
      'Toliary-I',
      'Toliary-II',
    ],
  },
  { region: 'Anosy', level: 'JAUNE', districts: ['Amboasary-Atsimo', 'Betroka', 'Taolagnaro'] },
  {
    region: 'Androy',
    level: 'JAUNE',
    districts: ['Ambovombe-Androy', 'Bekily', 'Beloha', 'Tsihombe'],
  },
];

/** Districts cités en alerte verte par le bulletin du 4 février 2022. */
const GREEN_DISTRICTS = [
  'Antalaha',
  'Maroantsetra',
  'Mananara Avaratra',
  'Mandritsara',
  'Andilamena',
  'Tsaratanana',
  'Maevatanana',
];

/**
 * Districts explicitement cités par le bulletin EN PLUS des régions :
 * « Alerte Rouge (Danger imminent) : Régions d'ATSINANANA, VATOVAVY, FITOVINANY,
 * ATSIMO ATSINANANA, ANALAMANGA, les Districts de VAVATENINA, AMBATONDRAZAKA,
 * ARIVONIMAMO, AMBATOLAMPY, ANTANIFOTSY, ANTSIRABE I-II, FANDRIANA, AMBOSITRA,
 * MANANDRIANA, AMBOHIMAHASOA, LALANGINA, VOHIBATO, ISANDRA, FIANARANTSOA I,
 * IVOHIBE et IAKORA. »
 *
 * Sans ces listes, les hautes terres traversées par le cyclone (Haute Matsiatra,
 * Ihorombe, Amoron'i Mania, Vakinankaratra, Itasy, Alaotra-Mangoro, Analanjiroto,
 * Melaky) restaient GRISES alors que le bulletin les plaçait en alerte rouge ou
 * jaune : d'où des « trous » le long de la trajectoire, à côté de régions côtières
 * entièrement colorées.
 *
 * Source : bulletin cyclonique spécial de Météo Madagascar du 5 février 2022 à
 * 04h00 locales (« Les alertes cycloniques restent inchangées » depuis le bulletin
 * du 4 février 16h00).
 * https://reliefweb.int/report/madagascar/m-t-o-madagascar-bulletin-cyclonique-sp-cial-05-f-vrier-2022-04-heures-locales
 *
 * Le bulletin mentionne également la région « MANGORO » (Alaotra-Mangoro) en
 * alerte rouge. AMPARAFARAVOLA y est explicitement citée en jaune et
 * ANDILAMENA en vert : ces mentions explicites prévalent sur le niveau
 * régional. Seuls Moramanga et Anosibe-An'ala héritent donc de l'alerte rouge
 * régionale.
 */
const RED_DISTRICTS: string[] = [
  'Vavatenina',
  'Ambatondrazaka',
  'Arivonimamo',
  'Ambatolampy',
  'Antanifotsy',
  'Antsirabe I',
  'Antsirabe II',
  'Fandriana',
  'Ambositra',
  'Manandriana',
  'Ambohimahasoa',
  'Lalangina',
  'Vohibato',
  'Isandra',
  'Fianarantsoa I',
  'Ivohibe',
  'Iakora',
];

/** Districts cités en jaune par le même bulletin, en plus des régions. */
const YELLOW_DISTRICTS: string[] = [
  'Sainte Marie',
  'Soanierana Ivongo',
  'Fenerive Est',
  'Amparafaravola',
  'Antsalova',
  'Miarinarivo',
  'Soavinandriana',
  'Faratsiho',
  'Betafo',
  'Mandoto',
  'Ambatofinandrahana',
  'Ikalamavony',
  'Ihosy',
];

const ALL_DISTRICTS = [
  ...RED_REGIONS.flatMap((r) => r.districts),
  ...YELLOW_REGIONS.flatMap((r) => r.districts),
  ...RED_DISTRICTS,
  ...YELLOW_DISTRICTS,
  ...GREEN_DISTRICTS,
];
/** Normalise un nom de territoire comme la requête SQL (`regexp_replace`). */
function normalize(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Alias SQL de normalisation d'un nom de district (identique à seed-batsirai). */
const NORM_DISTRICT_SQL = `regexp_replace(lower(d.name), '[^a-z0-9]', '', 'g')`;

function scopeComment(scope: Scope, label: string, level: Level): string {
  if (scope === 'REGION') {
    return (
      `Niveau « ${level} » publié par le bulletin du 4 février 2022 pour la région ` +
      `${label}. Le bulletin ne cite pas les communes : le niveau est hérité de la ` +
      'région (estimation spatiale), et non observé commune par commune.'
    );
  }
  return (
    `Niveau « ${level} » publié par le bulletin du 4 février 2022 pour le district de ` +
    `${label}. Le bulletin ne cite pas les communes : le niveau est hérité du district ` +
    '(estimation spatiale), et non observé commune par commune.'
  );
}

/**
 * Insère, pour chaque commune des districts fournis, une ligne héritée du
 * bulletin. Le niveau n'est jamais attribué « au district » : il est stocké pour
 * chaque commune, mais avec `territory_scope` et un commentaire qui rappellent
 * qu'il est estimé à partir d'une échelle supérieure.
 */
async function insertTerritoryAlerts(
  client: pg.PoolClient,
  eventId: string,
  districts: string[],
  level: Level,
  scope: Scope,
  label: string,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT $1, c.id, $2, $3, $4, 'ESTIMATION', $5, $6, $7, $8
       FROM communes c
       JOIN districts d ON d.id = c.district_id
      WHERE ${NORM_DISTRICT_SQL} = ANY($9::text[])`,
    [
      eventId,
      level,
      BULLETIN_VALID_FROM,
      BULLETIN_VALID_TO,
      scope,
      BULLETIN_SOURCE_NAME,
      BULLETIN_SOURCE_URL,
      scopeComment(scope, label, level),
      districts.map(normalize),
    ],
  );
  return res.rowCount ?? 0;
}

/**
 * Impacts observés datés : une commune ayant subi un impact documenté devient
 * ROUGE pendant la période d'impact. La borne de fin est portée au moins jusqu'à
 * la fin de validité du bulletin officiel (8 février) : une commune réellement
 * touchée ne doit pas être rétrogradée tant que l'alerte officielle court, puis
 * elle passe au bleu (danger résiduel). Aucune commune n'est concernée avant le
 * passage réellement documenté.
 */
async function insertImpactAlerts(client: pg.PoolClient, eventId: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT eci.event_id,
            eci.commune_id,
            'ROUGE',
            LEAST(eci.first_affected_at, COALESCE(eci.last_affected_at, eci.first_affected_at)),
            GREATEST(
              eci.first_affected_at,
              COALESCE(eci.last_affected_at, eci.first_affected_at),
              $3::timestamptz
            ),
            'IMPACT_OBSERVE',
            'COMMUNE',
            COALESCE(eci.source_name, 'Météo-France (RSMC La Réunion) / NOAA IBTrACS'),
            COALESCE(eci.source_url, $2),
            'Impacts observés documentés : le centre du cyclone a traversé la commune '
              || '(corridor de 15 km autour du best track IBTrACS). Niveau rouge pendant '
              || 'la période d''impact documentée, maintenu jusqu''à la fin de validité du '
              || 'bulletin officiel (8 février 2022).'
       FROM event_commune_impacts eci
      WHERE eci.event_id = $1
        AND eci.first_affected_at IS NOT NULL`,
    [eventId, IMPACT_SOURCE_URL_FALLBACK, BULLETIN_VALID_TO],
  );
  return res.rowCount ?? 0;
}

/**
 * Dangers résiduels après le passage : les communes à impact observé restent
 * BLEU de la fin de l'impact documenté jusqu'à la fin officielle de l'événement.
 * Le report communal est une ESTIMATION (aucune donnée de danger résiduel n'est
 * publiée à l'échelle communale) ; l'interface la signale comme telle.
 */
async function insertResidualAlerts(client: pg.PoolClient, eventId: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT eci.event_id,
            eci.commune_id,
            'BLEU',
            GREATEST(eci.first_affected_at, COALESCE(eci.last_affected_at, eci.first_affected_at)),
            $2,
            'ESTIMATION',
            'COMMUNE',
            $3,
            $4,
            'Danger résiduel après le passage du centre (crues, inondations). '
              || 'Estimation communale dérivée des communes à impact observé : aucune '
              || 'donnée de danger résiduel n''est publiée à l''échelle de la commune.'
       FROM event_commune_impacts eci
      WHERE eci.event_id = $1
        AND eci.first_affected_at IS NOT NULL
        AND GREATEST(eci.first_affected_at, COALESCE(eci.last_affected_at, eci.first_affected_at)) < $2`,
    [eventId, EVENT_ENDED_AT, RESIDUAL_SOURCE_NAME, RESIDUAL_SOURCE_URL],
  );
  return res.rowCount ?? 0;
}

/**
 * Fin d'alerte (post-cyclone) : conformément au code couleur cyclonique
 * malgache (« Alerte Bleue : le cyclone s'éloigne ou se comble, mais des
 * dangers persistent »), les communes qui étaient sous le bulletin du
 * 4 février passent en BLEU à la fin de validité de ce bulletin — le cyclone a
 * quitté le territoire mais les pluies, crues et vents résiduels perdurent — et
 * le restent jusqu'à la fin officielle de l'événement. Le niveau territorial est
 * reporté au niveau communal : ESTIMATION, signalée comme telle. Les communes à
 * impact observé ont déjà leur propre ligne de danger résiduel.
 */
async function insertEndOfAlertBlue(client: pg.PoolClient, eventId: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT DISTINCT h.event_id, h.commune_id, 'BLEU', $2::timestamptz, $3::timestamptz,
            'ESTIMATION', 'COMMUNE', $4::varchar, $5::text,
            'Fin d''alerte (post-cyclone) : le cyclone a quitté le territoire mais des '
              || 'dangers persistent (pluies torrentielles, crues, vents résiduels). '
              || 'Niveau bleu reporté depuis le bulletin territorial du 4 février 2022 ; '
              || 'aucune donnée de fin d''alerte n''est publiée à l''échelle communale.'
       FROM event_commune_alert_history h
      WHERE h.event_id = $1
        AND h.info_type = 'ESTIMATION'
        AND h.territory_scope IN ('REGION', 'DISTRICT')
        AND NOT EXISTS (
          SELECT 1 FROM event_commune_alert_history r
           WHERE r.event_id = h.event_id
             AND r.commune_id = h.commune_id
             AND r.alert_level = 'BLEU'
        )`,
    [eventId, BULLETIN_VALID_TO, EVENT_ENDED_AT, RESIDUAL_SOURCE_NAME, RESIDUAL_SOURCE_URL],
  );
  return res.rowCount ?? 0;
}

/** Districts de la correspondance absents de la base (signalés, non bloquants). */
async function findMissingDistricts(client: pg.PoolClient): Promise<string[]> {
  const res = await client.query<{ norm: string }>(
    `SELECT regexp_replace(lower(name), '[^a-z0-9]', '', 'g') AS norm FROM districts`,
  );
  const present = new Set(res.rows.map((r) => r.norm));
  return ALL_DISTRICTS.filter((n) => !present.has(normalize(n)));
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
  missingDistricts: string[];
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

    // Purge idempotente des alertes communales de cet événement.
    await client.query('DELETE FROM event_commune_alert_history WHERE event_id = $1', [eventId]);

    const missingDistricts = await findMissingDistricts(client);

    for (const r of RED_REGIONS) {
      await insertTerritoryAlerts(client, eventId, r.districts, r.level, 'REGION', r.region);
    }
    for (const d of RED_DISTRICTS) {
      await insertTerritoryAlerts(client, eventId, [d], 'ROUGE', 'DISTRICT', d);
    }
    for (const r of YELLOW_REGIONS) {
      await insertTerritoryAlerts(client, eventId, r.districts, r.level, 'REGION', r.region);
    }
    for (const d of YELLOW_DISTRICTS) {
      await insertTerritoryAlerts(client, eventId, [d], 'JAUNE', 'DISTRICT', d);
    }
    for (const district of GREEN_DISTRICTS) {
      await insertTerritoryAlerts(client, eventId, [district], 'VERT', 'DISTRICT', district);
    }

    const impactRows = await insertImpactAlerts(client, eventId);
    const residualRows = await insertResidualAlerts(client, eventId);
    const endOfAlertRows = await insertEndOfAlertBlue(client, eventId);

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

    console.log(
      `  ✓ Impacts observés (ROUGE) : ${impactRows} lignes ; dangers résiduels (BLEU, estimation) : ${residualRows} lignes.`,
    );
    console.log(
      `  ✓ Fin d'alerte (BLEU, post-cyclone) reportée aux communes du bulletin : ${endOfAlertRows} lignes.`,
    );
    console.log(
      `  ✓ ${total} lignes au total — par niveau : ${JSON.stringify(byLevel)} ; par portée : ${JSON.stringify(byScope)}.`,
    );
    if (missingDistricts.length > 0) {
      console.log(`  ⚠ Districts absents de la base (ignorés) : ${missingDistricts.join(', ')}`);
    }
    await reportGlobalOnlyBulletins(client, eventId);

    await client.query('COMMIT');

    return { eventId, total, byLevel, byScope, missingDistricts };
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
