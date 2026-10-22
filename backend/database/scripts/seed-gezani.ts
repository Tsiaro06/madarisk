import path from 'path';
import pg from 'pg';
import { GEZANI_TRACK, GEZANI_REGION_DISTRICTS } from '../seeds/gezani-2026';
import { GEZANI_RADII } from '../seeds/gezani-2026-radii';
import {
  GEZANI_BULLETINS,
  GEZANI_DISTRICT_ALIASES,
  bulletinAlertLevels,
  type GezaniAlertLevel,
} from '../seeds/gezani-2026-bulletins';
import { haversineKm } from '../../src/services/cyclone/cyclone-coloring.logic';

/**
 * Import idempotent de l'événement historique « Cyclone Gezani — février 2026 ».
 *
 * Contraintes respectées :
 *  - Aucune donnée inventée : la trajectoire provient du best track officiel
 *    IBTrACS v04r01 (SID 2026035S11065, intensité WMO/RSMC La Réunion) ; les
 *    bulletins, positions publiées et niveaux d'alerte proviennent du recueil
 *    officiel de la Direction Générale de la Météorologie (DGM — Météo
 *    Madagascar), reproduit intégralement dans `seeds/gezani-2026-bulletins.ts`.
 *  - L'événement est un événement passé normal (statut CLOTURE) : il ne génère
 *    aucune notification et n'apparaît jamais comme actif.
 *  - Idempotence : relancer le script met à jour l'événement et remplace ses
 *    données rattachées (trajectoire, zones, bulletins, alertes, rapports).
 *
 * Exécution : `npm run db:seed:gezani`
 */

const EVENT_CODE = 'HIST-GEZANI-2026';
const KNOTS_TO_KMH = 1.852;

const EVENT_NAME = 'Cyclone Gezani — février 2026';
const EVENT_SOURCE_NAME =
  'DGM — Météo Madagascar / RSMC La Réunion (Météo-France) / NOAA IBTrACS';
const EVENT_SOURCE_URL = 'https://ncics.org/ibtracs/index.php?name=v04r01-2026035S11065';
const BULLETIN_SOURCE_NAME = 'DGM — Météo Madagascar (bulletins cycloniques)';
const BULLETIN_SOURCE_URL = 'https://meteomadagascar.mg';
const ADMIN_AREA_SOURCE = 'Découpage administratif officiel Madagascar (MadaRisk)';

/**
 * Bornes de l'événement : formation du système le 4 février 2026 (premier point
 * du best track IBTrACS) et transition extratropicale le 18 février 2026
 * (nature `ET` publiée par IBTrACS). Le dernier bulletin DGM est celui du
 * 17 février 2026 à 10h00 (alerte levée sur tout Madagascar).
 */
const STARTED_AT = '2026-02-04T00:00:00Z';
const ENDED_AT = '2026-02-18T00:00:00Z';

/**
 * Rayons de vent documentés (RSMC La Réunion, IBTrACS v04r01). Valeur retenue :
 * rayon maximal des 4 quadrants du vent ≥ 34/50/64 kt, en kilomètres. Aucune
 * valeur n'est inventée : les seuils non publiés restent nuls en base (la RSMC
 * La Réunion n'a publié aucun rayon ≥ 64 kt pour Gezani).
 */
const RADIUS_SOURCE = 'RSMC La Réunion (Météo-France) — IBTrACS v04r01 (2026035S11065)';
const RADIUS_MEASURE_TYPE = 'Rayon maximal des 4 quadrants';

/** Atterrissage documenté par la DGM : Toamasina, 10 février 2026 vers 19h30 locales. */
const LANDFALL_AT = '2026-02-10T16:30:00Z';
const LANDFALL_SOURCE_NAME = 'DGM — Météo Madagascar, bulletin cyclonique N° 13/10';
const LANDFALL_WIND_KMH = 180;
const LANDFALL_GUST_KMH = 250;

/**
 * Tolérance géométrique autour de la ligne du centre observé pour qualifier le
 * statut CENTER_CROSSED d'une commune (même méthode que Batsirai 2022) : le best
 * track est un pas de 3 h, soit des points espacés de 30 à 80 km. La même
 * valeur sert de corridor pour les communes affectées passées.
 */
const CENTER_CROSSING_TOLERANCE_M = 15_000;

const IMPACT_METHOD =
  'Sélection spatiale PostGIS : communes dont le polygone intersecte un corridor de 15 km ' +
  'autour de la ligne du centre observé (best track IBTrACS, pas 3 h ; index spatial) ; ' +
  'interpolation temporelle en TypeScript le long de la trajectoire : projection du centroïde ' +
  'communal sur la polyligne (distance orthodromique) pour first_affected_at, point du best ' +
  'track le plus proche pour last_affected_at ; risque dérivé du vent soutenu RSMC à ce point ' +
  '(>= 118 km/h TRES_ELEVE, 89-117 ELEVE, < 89 MODERE, vent inconnu INCONNU).';

/**
 * Normalisation côté SQL d'un nom de territoire : minuscules, sans caractère
 * non alphanumérique (identique à la requête des zones).
 */
function norm(column: string): string {
  return `regexp_replace(lower(${column}), '[^a-z0-9]', '', 'g')`;
}

function kmh(kt: number | null): number | null {
  if (kt === null || kt === undefined) return null;
  return Math.round(kt * KNOTS_TO_KMH * 100) / 100;
}

function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Nom de district en base à partir du nom publié par la DGM. */
function districtName(published: string): string {
  return GEZANI_DISTRICT_ALIASES[published] ?? published;
}

/**
 * Niveau de vigilance publié → niveau de risque cartographique.
 * Il s'agit du niveau d'alerte du bulletin, jamais d'une intensité mesurée.
 */
const RISK_BY_LEVEL: Record<GezaniAlertLevel, 'EXTREME' | 'ELEVE' | 'MODERE' | 'FAIBLE'> = {
  ROUGE: 'EXTREME',
  JAUNE: 'ELEVE',
  BLEU: 'MODERE',
  VERT: 'FAIBLE',
};

/** Niveau de vigilance publié → gravité de l'alerte archivée. */
const SEVERITY_BY_LEVEL: Record<
  GezaniAlertLevel,
  'EXTREME' | 'ELEVEE' | 'MODEREE' | 'FAIBLE'
> = {
  ROUGE: 'EXTREME',
  JAUNE: 'ELEVEE',
  BLEU: 'MODEREE',
  VERT: 'FAIBLE',
};

/**
 * Zones de vigilance documentaires.
 *
 * Chaque zone reprend le niveau MAXIMAL publié pour un territoire pendant une
 * phase documentée du cyclone, avec la fenêtre de validité exacte de ce niveau
 * (de la publication du bulletin qui l'annonce à celle du bulletin qui le
 * change). Deux phases sont représentées, parce que la DGM a publié deux
 * épisodes distincts :
 *  1. l'atterrissage du 10 février 2026 (bulletin N° 12/10, 16h00 locales) ;
 *  2. la ré-intensification dans le canal du Mozambique (16 février 2026).
 * La géométrie est l'union des districts administratifs réels (illustrative :
 * elle n'est pas issue du bulletin).
 */
interface AreaSpec {
  level: GezaniAlertLevel;
  phase: 'PENDANT' | 'APRES';
  label: string;
  /** Région officielle DGM (majuscules) ou district publié par la DGM. */
  region?: string;
  district?: string;
  validFrom: string;
  validTo: string;
  bulletinRef: string;
}

const AREA_BULLETIN_12 = 'N° 12/10 (10 février 2026, 16h00)';
const AREA_BULLETIN_19 = 'N° 19/10 (15 février 2026, 16h00)';
const AREA_BULLETIN_20 = 'N° 20/10 (16 février 2026, 10h00)';
const AREA_BULLETIN_21 = 'N° 21/10 (16 février 2026, 16h00)';

const AREAS: AreaSpec[] = [
  // --- Phase 1 : atterrissage sur la côte est (10 février 2026) ---------------
  // Alerte rouge publiée par le N° 12/10 (16h00), maintenue par le N° 13/10.
  // ANALANJIROFO et ATSINANANA passent en bleu au N° 14/10 (11/02 04h00) ;
  // les trois autres régions rouges restent rouges jusqu'au N° 15/10 (11/02 10h00).
  {
    level: 'ROUGE',
    phase: 'PENDANT',
    label: 'Alerte rouge — région ANALANJIROFO',
    region: 'ANALANJIROFO',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T04:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'ROUGE',
    phase: 'PENDANT',
    label: 'Alerte rouge — région ATSINANANA',
    region: 'ATSINANANA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T04:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'ROUGE',
    phase: 'PENDANT',
    label: 'Alerte rouge — région ALAOTRA MANGORO',
    region: 'ALAOTRA MANGORO',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'ROUGE',
    phase: 'PENDANT',
    label: 'Alerte rouge — région ANALAMANGA',
    region: 'ANALAMANGA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'ROUGE',
    phase: 'PENDANT',
    label: 'Alerte rouge — région BETSIBOKA',
    region: 'BETSIBOKA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  // Alerte jaune du N° 12/10. AMBATOSOA est levée au N° 14/10 (22h00) ; les
  // cinq régions de l'ouest restent jaunes jusqu'au N° 15/10 (11/02 10h00).
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région AMBATOSOA',
    region: 'AMBATOSOA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-10T22:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région BONGOLAVA',
    region: 'BONGOLAVA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région ITASY',
    region: 'ITASY',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région VAKINANKARATRA',
    region: 'VAKINANKARATRA',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région MELAKY',
    region: 'MELAKY',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — région MENABE',
    region: 'MENABE',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-11T10:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  // Districts de Sofia maintenus en jaune par le N° 12/10, levés au N° 14/10.
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — district de Mandritsara',
    district: 'Mandritsara',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-10T22:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  {
    level: 'JAUNE',
    phase: 'PENDANT',
    label: 'Alerte jaune — district de Befandriana Avaratra',
    district: 'Befandriana Avaratra',
    validFrom: '2026-02-10T16:00:00+03:00',
    validTo: '2026-02-10T22:00:00+03:00',
    bulletinRef: AREA_BULLETIN_12,
  },
  // --- Phase 2 : ré-intensification dans le canal du Mozambique --------------
  // JAUNE au N° 19/10 (15/02 16h00), ROUGE Ampanihy au N° 20/10 (16/02 10h00),
  // ROUGE Beloha au N° 21/10 (16/02 16h00), bleu pour tous au N° 23/10 (17/02 04h00).
  {
    level: 'ROUGE',
    phase: 'APRES',
    label: "Alerte rouge — district d'Ampanihy Andrefana",
    district: 'Ampanihy Andrefana',
    validFrom: '2026-02-16T10:00:00+03:00',
    validTo: '2026-02-17T04:00:00+03:00',
    bulletinRef: AREA_BULLETIN_20,
  },
  {
    level: 'ROUGE',
    phase: 'APRES',
    label: 'Alerte rouge — district de Beloha',
    district: 'Beloha',
    validFrom: '2026-02-16T16:00:00+03:00',
    validTo: '2026-02-17T04:00:00+03:00',
    bulletinRef: AREA_BULLETIN_21,
  },
  {
    level: 'JAUNE',
    phase: 'APRES',
    label: 'Alerte jaune — district de Tsihombe',
    district: 'Tsihombe',
    validFrom: '2026-02-15T16:00:00+03:00',
    validTo: '2026-02-17T04:00:00+03:00',
    bulletinRef: AREA_BULLETIN_19,
  },
];

/**
 * Districts dont l'union compose la géométrie d'une zone. Une région est
 * développée en ses districts administratifs (projection sur la base) ; un
 * district est pris tel quel. Les territoires non couverts par la carte
 * administrative de la base ne produisent aucune géométrie et sont signalés.
 */
function areaDistricts(area: AreaSpec): string[] {
  if (area.region) {
    return GEZANI_REGION_DISTRICTS[area.region] ?? [];
  }
  return area.district ? [districtName(area.district)] : [];
}

const EVENT_DESCRIPTION = [
  'Événement historique reconstitué : cyclone tropical intense Gezani (saison 2025-2026), importé depuis les bulletins officiels de la Direction Générale de la Météorologie (DGM — Météo Madagascar) et le best track IBTrACS v04r01.',
  'Formation le 4 février 2026 dans le centre du bassin sud-indien ; baptême « Gezani » le 8 février 2026 à 10h00 locales alors que le système se trouvait à environ 823 km à l\'est de Toamasina.',
  'Intensification rapide : forte tempête tropicale le 9 février au soir, cyclone tropical le 10 février à 04h00, cyclone tropical intense le 10 février à 16h00 (vent moyen 185 km/h, rafales 260 km/h, 89 km à l\'est de Toamasina). Pic du best track : 105 kt (≈ 194 km/h) et 952 hPa le 10 février 2026 à 12h00 UTC.',
  'Atterrissage sur Toamasina le 10 février 2026 vers 19h30 locales (16h30 UTC). Traversée des hautes terres centrales d\'est en ouest, puis sortie en mer dans le canal du Mozambique entre Maintirano et Morondava le 11 février en soirée ; toutes les alertes sont alors levées (bulletin N° 17/10, 11 février 17h30).',
  'Ré-intensification dans le canal du Mozambique à partir du 14 février (155 km/h, rafales 210 km/h) puis rapprochement de la côte sud-ouest : alerte rouge sur le district d\'Ampanihy Andrefana le 16 février, jaune sur Beloha et Tsihombe. Bulletin final le 17 février 2026 à 10h00 : toutes les alertes sont levées. Transition extratropicale le 18 février 2026 (IBTrACS).',
  'Les niveaux d\'alerte affichés sont ceux publiés par la DGM (rouge / jaune / vert / bleu) ; ils ne sont jamais déduits d\'une mesure. Les 23 bulletins spéciaux et 6 bulletins flash « Vaovao Tselatra » sont reproduits intégralement et horodatés en heure de Madagascar (UTC+03:00). Aucun bilan d\'impact n\'était disponible dans la source : aucun chiffre de dégâts n\'est donc inventé.',
].join(' ');

const STATUS_HISTORY: Array<{
  from: string | null;
  to: string;
  reason: string;
  source: string;
  recordedAt: string;
}> = [
  {
    from: null,
    to: 'PREVISION',
    reason: 'Formation du système tropical suivie par le RSMC La Réunion (best track IBTrACS).',
    source: 'IBTRACS',
    recordedAt: STARTED_AT,
  },
  {
    from: 'PREVISION',
    to: 'ACTIF',
    reason:
      "Atterrissage du cyclone tropical intense Gezani sur Toamasina (bulletin DGM N° 13/10, 10 février 2026 à 20h00 locales).",
    source: 'DGM_GEZANI',
    recordedAt: LANDFALL_AT,
  },
  {
    from: 'ACTIF',
    to: 'SUIVI',
    reason:
      'Sortie en mer dans le canal du Mozambique ; toutes les alertes cycloniques sont levées (bulletin DGM N° 17/10, 11 février 2026 à 17h30).',
    source: 'DGM_GEZANI',
    recordedAt: '2026-02-11T14:30:00Z',
  },
  {
    from: 'SUIVI',
    to: 'ACTIF',
    reason:
      "Ré-intensification dans le canal du Mozambique : alerte rouge sur le district d'Ampanihy Andrefana (bulletin DGM N° 20/10, 16 février 2026 à 10h00).",
    source: 'DGM_GEZANI',
    recordedAt: '2026-02-16T07:00:00Z',
  },
  {
    from: 'ACTIF',
    to: 'CLOTURE',
    reason:
      'Bulletin final : toutes les alertes sont levées (bulletin DGM N° 24/10, 17 février 2026 à 10h00). Transition extratropicale le 18 février 2026 (IBTrACS).',
    source: 'DGM_GEZANI',
    recordedAt: '2026-02-17T07:00:00Z',
  },
];

/**
 * Rapport de situation historique : synthèse FACTUELLE du recueil de bulletins.
 * Aucun bilan humain ou matériel n'y figure — la source n'en publie pas.
 */
const REPORTS: Array<{
  title: string;
  reportType: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  parameters: Record<string, unknown>;
}> = [
  {
    title: 'Cyclone Gezani — synthèse des bulletins officiels DGM (février 2026)',
    reportType: 'RAPPORT_SITUATION',
    source: 'DGM — Météo Madagascar',
    periodStart: '2026-02-08T10:00:00+03:00',
    periodEnd: '2026-02-17T10:00:00+03:00',
    parameters: {
      historical: true,
      source: 'DGM — Météo Madagascar',
      sourceDocument: 'Recueil officiel « Bulletin DGM GEZANI » (23 bulletins spéciaux, 6 flashs)',
      sourceDate: '2026-02-17',
      note: 'Synthèse factuelle du recueil de bulletins. Aucun bilan d\'impact humain ou matériel n\'est publié dans la source : aucune estimation n\'est ajoutée.',
      indicators: [
        {
          code: 'bulletins_special',
          label: 'Bulletins spéciaux publiés',
          value: 23,
          unit: 'bulletins',
          source: 'DGM — recueil officiel',
        },
        {
          code: 'bulletins_flash',
          label: 'Bulletins flash « Vaovao Tselatra »',
          value: 6,
          unit: 'bulletins',
          source: 'DGM — recueil officiel',
        },
        {
          code: 'vent_max_publie',
          label: 'Vent moyen maximal publié',
          value: 195,
          unit: 'km/h',
          source: 'DGM — bulletin flash N° 03/10 (10 février 2026, 19h00)',
        },
        {
          code: 'rafales_max_publiees',
          label: 'Rafales maximales publiées',
          value: 270,
          unit: 'km/h',
          source: 'DGM — bulletin flash N° 03/10 (10 février 2026, 19h00)',
        },
        {
          code: 'vent_pic_best_track',
          label: 'Vent soutenu au pic (best track)',
          value: 105,
          unit: 'kt',
          source: 'RSMC La Réunion / IBTrACS v04r01 — 10 février 2026 12h00 UTC',
        },
        {
          code: 'pression_min',
          label: 'Pression minimale au centre',
          value: 952,
          unit: 'hPa',
          source: 'RSMC La Réunion / IBTrACS v04r01 — 10 février 2026 12h00 UTC',
        },
      ],
    },
  },
];

export interface GezaniSeedSummary {
  eventId: string;
  tracks: number;
  areas: number;
  bulletins: number;
  alerts: number;
  reports: number;
  communeImpacts: number;
  skippedZones: string[];
}

/** Bulletins triés par heure de publication (les flashs s'intercalent). */
function sortedBulletins(): typeof GEZANI_BULLETINS {
  return [...GEZANI_BULLETINS].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  );
}

async function insertArea(client: pg.PoolClient, eventId: string, area: AreaSpec): Promise<number> {
  const districts = areaDistricts(area).map(normalizeName);
  if (districts.length === 0) {
    return 0;
  }

  const description =
    `${area.label} — niveau de vigilance publié par le bulletin cyclonique DGM ` +
    `${area.bulletinRef} (niveau d'alerte, non une intensité mesurée). ` +
    'Géométrie illustrative : union des districts administratifs (non issue du bulletin).';

  const result = await client.query(
    `INSERT INTO event_areas
       (event_id, phase, risk_level, valid_from, valid_to, source, source_type, is_estimate, description, geom)
     WITH src AS (
       SELECT d.geom FROM districts d
        WHERE ${norm('d.name')} = ANY($2::text[])
     ),
          agg AS (
            SELECT ST_Multi(ST_Union(geom)) AS geom FROM src HAVING count(*) > 0
          )
     SELECT $1, $3, $4, $5, $6, $7, 'OFFICIEL', false, $8,
            agg.geom::geometry(MultiPolygon, 4326)
       FROM agg`,
    [
      eventId,
      districts,
      area.phase,
      RISK_BY_LEVEL[area.level],
      area.validFrom,
      area.validTo,
      ADMIN_AREA_SOURCE,
      description,
    ],
  );

  return result.rowCount ?? 0;
}

export async function runGezaniSeed(): Promise<GezaniSeedSummary> {
  const { env } = await import('../../src/config/env');
  const { assertLocalDbWritable } = await import('./assert-local-db');

  assertLocalDbWritable({ databaseUrl: env.DATABASE_URL, host: env.DB_HOST });

  const connectionString =
    env.DATABASE_URL ||
    `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  const pool = new pg.Pool({
    connectionString,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const client = await pool.connect();

  try {
    console.log('--- Import historique : Cyclone Gezani (février 2026) ---\n');
    await client.query('BEGIN');

    // Auteur : premier administrateur existant (sinon NULL).
    const adminResult = await client.query<{ id: string }>(
      `SELECT id FROM users
        WHERE role IN ('SUPER_ADMIN', 'ADMIN')
        ORDER BY created_at ASC
        LIMIT 1`,
    );
    const createdBy = adminResult.rows[0]?.id ?? null;

    // 1. Événement (upsert par event_code).
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM hazard_events WHERE event_code = $1',
      [EVENT_CODE],
    );

    let eventId: string;
    let created = false;

    if (existing.rows.length > 0) {
      eventId = existing.rows[0].id;
      await client.query(
        `UPDATE hazard_events
            SET name = $2, type = 'CYCLONE', status = 'CLOTURE', severity = 'EXTREME',
                description = $3, source_name = $4, source_url = $5,
                started_at = $6, expected_end_at = NULL, ended_at = $7,
                created_by = COALESCE(created_by, $8), updated_at = now()
          WHERE id = $1`,
        [
          eventId,
          EVENT_NAME,
          EVENT_DESCRIPTION,
          EVENT_SOURCE_NAME,
          EVENT_SOURCE_URL,
          STARTED_AT,
          ENDED_AT,
          createdBy,
        ],
      );
      console.log(`  ↻ Événement mis à jour (${EVENT_CODE}).`);
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO hazard_events
           (event_code, name, type, status, severity, description,
            source_name, source_url, started_at, expected_end_at, ended_at, created_by)
         VALUES ($1, $2, 'CYCLONE', 'CLOTURE', 'EXTREME', $3, $4, $5, $6, NULL, $7, $8)
         RETURNING id`,
        [
          EVENT_CODE,
          EVENT_NAME,
          EVENT_DESCRIPTION,
          EVENT_SOURCE_NAME,
          EVENT_SOURCE_URL,
          STARTED_AT,
          ENDED_AT,
          createdBy,
        ],
      );
      eventId = inserted.rows[0].id;
      created = true;
      console.log(`  ✓ Événement créé (${EVENT_CODE}).`);
    }

    // 2. Purge des données rattachées (idempotence).
    await client.query('DELETE FROM event_tracks WHERE event_id = $1', [eventId]);
    await client.query('DELETE FROM event_status_history WHERE event_id = $1', [eventId]);
    await client.query('DELETE FROM event_areas WHERE event_id = $1', [eventId]);
    await client.query('DELETE FROM weather_bulletins WHERE event_id = $1', [eventId]);
    await client.query('DELETE FROM event_commune_impacts WHERE event_id = $1', [eventId]);
    await client.query('DELETE FROM alerts WHERE event_id = $1 AND is_historique = true', [eventId]);
    await client.query('DELETE FROM reports WHERE event_id = $1 AND is_historique = true', [eventId]);

    // 3. Chronologie (event_status_history).
    for (const entry of STATUS_HISTORY) {
      await client.query(
        `INSERT INTO event_status_history
           (event_id, from_status, to_status, reason, actor_type, source, recorded_at)
         VALUES ($1, $2, $3, $4, 'SYSTEM', $5, $6)`,
        [eventId, entry.from, entry.to, entry.reason, entry.source, entry.recordedAt],
      );
    }
    console.log(`  ✓ Chronologie : ${STATUS_HISTORY.length} étapes.`);

    // 4. Trajectoire officielle (IBTrACS) + rayons de vent documentés (RSMC).
    const radiiByTime = new Map(GEZANI_RADII.map((entry) => [entry.time, entry]));
    let tracks = 0;
    let documentedRadii = 0;
    for (const point of GEZANI_TRACK) {
      const radii = radiiByTime.get(point.time);
      const hasRadii = Boolean(
        radii &&
          (radii.radius34ktKm != null ||
            radii.radius50ktKm != null ||
            radii.radius64ktKm != null),
      );
      if (hasRadii) documentedRadii += 1;
      await client.query(
        `INSERT INTO event_tracks
           (event_id, observed_at, track_type, latitude, longitude,
            wind_speed_kmh, pressure_hpa, movement_direction, movement_speed_kmh,
            radius_34kt_km, radius_50kt_km, radius_64kt_km,
            radius_source, radius_measure_type, geom)
         VALUES ($1, $2, 'OBSERVEE', $3::numeric, $4::numeric, $5, $6, $7, $8,
                 $9, $10, $11, $12, $13,
                 ST_SetSRID(ST_MakePoint($4::double precision, $3::double precision), 4326))`,
        [
          eventId,
          point.time,
          point.lat,
          point.lon,
          kmh(point.windKt),
          point.pressureHpa,
          point.dirDeg === null ? null : `${point.dirDeg}°`,
          kmh(point.speedKt),
          radii?.radius34ktKm ?? null,
          radii?.radius50ktKm ?? null,
          radii?.radius64ktKm ?? null,
          hasRadii ? RADIUS_SOURCE : null,
          hasRadii ? RADIUS_MEASURE_TYPE : null,
        ],
      );
      tracks += 1;
    }
    console.log(
      `  ✓ Trajectoire : ${tracks} points (source IBTrACS), ` +
        `${documentedRadii} avec rayon de vent RSMC documenté.`,
    );

    // 5. Zones de vigilance documentaires (géométrie administrative réelle).
    let areas = 0;
    const skippedZones: string[] = [];
    for (const area of AREAS) {
      const insertedAreas = await insertArea(client, eventId, area);
      if (insertedAreas > 0) {
        areas += insertedAreas;
      } else {
        skippedZones.push(area.label);
      }
    }
    console.log(`  ✓ Zones de vigilance : ${areas} géométries administratives.`);
    if (skippedZones.length > 0) {
      console.log(`  ⚠ Zones non trouvées en base (ignorées) : ${skippedZones.join(', ')}`);
    }

    // 5bis. Impacts communaux observés (dérivés du best track).
    //   - Sélection spatiale PostGIS : communes dont le polygone intersecte le
    //     corridor (15 km) autour de la ligne du centre observé.
    //   - first_affected_at : projection du centroïde sur la polyligne (même
    //     principe que ST_LineLocatePoint) puis interpolation de l'heure entre
    //     les deux points encadrants du best track.
    //   - last_affected_at / risque observé : point du best track le plus proche
    //     du centroïde ; risque dérivé de son vent soutenu RSMC.
    // Une seule requête spatiale est envoyée au serveur (sans jointure latérale
    // sur les 143 points) : l'interpolation est faite ici, ce qui garde la
    // requête légère en mémoire.
    const trackPoints = GEZANI_TRACK.map((point) => ({
      t: Date.parse(point.time),
      lat: point.lat,
      lon: point.lon,
      windKmh: kmh(point.windKt),
    }));

    const candidates = await client.query<{ id: string; lat: number; lon: number }>(
      `SELECT c.id, ST_Y(c.centroid)::float8 AS lat, ST_X(c.centroid)::float8 AS lon
         FROM communes c
        WHERE c.centroid IS NOT NULL
          AND ST_DWithin(c.geom::geography, ST_GeogFromText($1), $2)`,
      [
        `SRID=4326;LINESTRING(${GEZANI_TRACK.map((p) => `${p.lon} ${p.lat}`).join(', ')})`,
        CENTER_CROSSING_TOLERANCE_M,
      ],
    );

    interface CommuneImpact {
      communeId: string;
      firstAffectedAt: string;
      lastAffectedAt: string;
      riskLevel: 'TRES_ELEVE' | 'ELEVE' | 'MODERE' | 'INCONNU';
    }

    const impacts: CommuneImpact[] = [];
    for (const commune of candidates.rows) {
      // 1) Heure de passage : projection du centroïde sur chaque segment.
      const cosLat = Math.cos((commune.lat * Math.PI) / 180);
      let bestTimeMs = trackPoints[0].t;
      let bestDistanceKm = Number.POSITIVE_INFINITY;
      for (let i = 0; i < trackPoints.length - 1; i += 1) {
        const a = trackPoints[i];
        const b = trackPoints[i + 1];
        const ax = a.lon * cosLat;
        const ay = a.lat;
        const dx = b.lon * cosLat - ax;
        const dy = b.lat - ay;
        const lengthSq = dx * dx + dy * dy;
        const raw =
          lengthSq === 0
            ? 0
            : ((commune.lon * cosLat - ax) * dx + (commune.lat - ay) * dy) / lengthSq;
        const f = Math.min(1, Math.max(0, raw));
        const crossedLon = (ax + f * dx) / cosLat;
        const crossedLat = ay + f * dy;
        const distanceKm = haversineKm(commune.lon, commune.lat, crossedLon, crossedLat);
        if (distanceKm < bestDistanceKm) {
          bestDistanceKm = distanceKm;
          bestTimeMs = a.t + f * (b.t - a.t);
        }
      }

      // 2) Point du best track le plus proche : vent observé et date associée.
      let nearest = trackPoints[0];
      let nearestKm = Number.POSITIVE_INFINITY;
      for (const point of trackPoints) {
        const distanceKm = haversineKm(commune.lon, commune.lat, point.lon, point.lat);
        if (distanceKm < nearestKm) {
          nearestKm = distanceKm;
          nearest = point;
        }
      }
      const riskLevel: CommuneImpact['riskLevel'] =
        nearest.windKmh === null
          ? 'INCONNU'
          : nearest.windKmh >= 118
            ? 'TRES_ELEVE'
            : nearest.windKmh >= 89
              ? 'ELEVE'
              : 'MODERE';

      impacts.push({
        communeId: commune.id,
        firstAffectedAt: new Date(bestTimeMs).toISOString(),
        lastAffectedAt: new Date(nearest.t).toISOString(),
        riskLevel,
      });
    }

    const impactChunkSize = 200;
    let computedImpacts = 0;
    for (let i = 0; i < impacts.length; i += impactChunkSize) {
      const chunk = impacts.slice(i, i + impactChunkSize);
      const params: unknown[] = [eventId, EVENT_SOURCE_NAME, EVENT_SOURCE_URL, IMPACT_METHOD];
      const tuples = chunk.map((impact, index) => {
        const offset = 5 + index * 4;
        params.push(
          impact.communeId,
          impact.firstAffectedAt,
          impact.lastAffectedAt,
          impact.riskLevel,
        );
        return (
          `($1, $${offset}::uuid, $${offset + 1}::timestamptz, ` +
          `$${offset + 2}::timestamptz, 'CENTER_CROSSED', $${offset + 3}, NULL, ` +
          '$2, $3, NULL, $4, NULL)'
        );
      });
      const result = await client.query(
        `INSERT INTO event_commune_impacts
           (event_id, commune_id, first_affected_at, last_affected_at,
            impact_state, observed_risk_level, forecast_risk_level,
            source_name, source_url, confidence, method, notes)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (event_id, commune_id) DO NOTHING`,
        params,
      );
      computedImpacts += result.rowCount ?? 0;
    }

    // Ligne d'impact documentée par la DGM : atterrissage sur Toamasina le
    // 10 février 2026 vers 19h30 locales. Les communes du district de
    // Toamasina I (quartiers) sont rattachées explicitement au point
    // d'atterrissage : sans cela, le corridor du best track (point 18:00Z à
    // 0 km de la terre, résolution 3 h) peut les manquer alors que la DGM
    // documente le passage du centre sur la ville.
    const toamasinaLandfall = await client.query(
      `INSERT INTO event_commune_impacts
         (event_id, commune_id, first_affected_at, last_affected_at,
          impact_state, observed_risk_level, forecast_risk_level,
          source_name, source_url, confidence, method, notes)
       SELECT $1, c.id, $2, $2, 'CENTER_CROSSED', 'TRES_ELEVE', NULL,
              $3, $4, NULL, $5, $6
         FROM communes c
         JOIN districts d ON d.id = c.district_id
        WHERE ${norm('d.name')} = 'toamasinai'
       ON CONFLICT (event_id, commune_id) DO UPDATE SET
         first_affected_at = EXCLUDED.first_affected_at,
         last_affected_at = EXCLUDED.last_affected_at,
         impact_state = EXCLUDED.impact_state,
         observed_risk_level = EXCLUDED.observed_risk_level,
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         method = EXCLUDED.method,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [
        eventId,
        LANDFALL_AT,
        LANDFALL_SOURCE_NAME,
        BULLETIN_SOURCE_URL,
        "Atterrissage documenté par la DGM : « Le cyclone tropical intense GEZANI a " +
          'touché terre sur Toamasina vers 19 heures et demie locales » (bulletin ' +
          'N° 13/10, 10 février 2026 à 20h00). Les quartiers du district de ' +
          'Toamasina I sont marqués affectés à cette heure (16h30 UTC), au moment ' +
          'du passage du centre sur la ville.',
        `Atterrissage DGM : vent moyen ≈ ${LANDFALL_WIND_KMH} km/h, rafales de l'ordre de ${LANDFALL_GUST_KMH} km/h.`,
      ],
    );

    // Comptage final robuste (idempotent).
    const impactCount = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM event_commune_impacts WHERE event_id = $1`,
      [eventId],
    );
    const communeImpacts = impactCount.rows[0]?.n ?? 0;
    console.log(
      `  ✓ Impacts communaux observés : ${communeImpacts} (dont corridor ` +
        `${computedImpacts}, atterrissage Toamasina ${toamasinaLandfall.rowCount ?? 0} ligne(s) traitée(s)).`,
    );

    // 6. Bulletins météo historiques (recueil officiel DGM).
    const bulletins = sortedBulletins();
    for (const bulletin of bulletins) {
      await client.query(
        `INSERT INTO weather_bulletins
           (event_id, source_name, source_url, bulletin_ref, title, published_at,
            observed_at, position_description, wind_kmh, gust_kmh, pressure_hpa,
            movement_direction, movement_speed_kmh, alert_level, alert_levels, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          eventId,
          BULLETIN_SOURCE_NAME,
          BULLETIN_SOURCE_URL,
          `${bulletin.kind === 'FLASH' ? 'Flash' : 'Spécial'} N° ${bulletin.reference}`,
          bulletin.title,
          bulletin.publishedAt,
          bulletin.observedAt,
          bulletin.positionDescription,
          bulletin.windKmh,
          bulletin.gustKmh,
          null, // pression : non publiée par la DGM.
          bulletin.movementDirection,
          bulletin.movementSpeedKmh,
          bulletin.alertLevel,
          JSON.stringify(bulletinAlertLevels(bulletin)),
          bulletin.content,
        ],
      );
    }
    console.log(
      `  ✓ Bulletins météo : ${bulletins.length} bulletins DGM ` +
        `(${bulletins.filter((b) => b.kind === 'SPECIAL').length} spéciaux, ` +
        `${bulletins.filter((b) => b.kind === 'FLASH').length} flashs).`,
    );

    // 7. Alertes historiques (archivées, sans notification).
    //    Une alerte par zone de vigilance documentaire, rattachée à l'événement.
    //    Aucune n'est publiée : statut ARCHIVEE + is_historique, donc jamais
    //    active ni notifiée.
    let alerts = 0;
    for (const area of AREAS) {
      if (skippedZones.includes(area.label)) {
        // Zone introuvable en base : ni géométrie ni alerte (aucune donnée inventée).
        continue;
      }
      const title = `Historique — ${area.bulletinRef} : ${area.label}`;
      const message =
        `Donnée historique (non active, bulletin cyclonique DGM ${area.bulletinRef}, ` +
        'heure de Madagascar). ' +
        `${area.label} — niveau de vigilance « ${area.level} » publié par la DGM, ` +
        `en vigueur du ${area.validFrom} au ${area.validTo}.`;

      await client.query(
        `INSERT INTO alerts
           (event_id, type, severity, status, title, message,
            source, basis, valid_from, is_automatic, update_count, created_by,
            published_at, expires_at, is_historique)
         VALUES ($1, 'CYCLONE', $2, 'ARCHIVEE', $3, $4,
                 $5, 'PREVISION', $6, false, 0, $7, $8, $9, true)`,
        [
          eventId,
          SEVERITY_BY_LEVEL[area.level],
          title,
          message,
          `DGM — Météo Madagascar, bulletin cyclonique ${area.bulletinRef}`,
          area.validFrom,
          createdBy,
          area.validFrom,
          area.validTo,
        ],
      );
      alerts += 1;
    }
    console.log(`  ✓ Alertes historiques : ${alerts} (archivées, aucune notification).`);

    // 8. Rapports de situation historiques.
    for (const report of REPORTS) {
      await client.query(
        `INSERT INTO reports
           (generated_by, event_id, title, report_type, format, period_start,
            period_end, file_path, parameters, source, is_historique, generated_at)
         VALUES ($1, $2, $3, $4, 'PDF', $5, $6, NULL, $7, $8, true, $9)`,
        [
          createdBy,
          eventId,
          report.title,
          report.reportType,
          report.periodStart,
          report.periodEnd,
          JSON.stringify(report.parameters),
          report.source,
          report.periodEnd,
        ],
      );
    }
    console.log(`  ✓ Rapports de situation : ${REPORTS.length} (sources datées).`);

    await client.query('COMMIT');

    if (created) {
      console.log(`\n--- Import terminé : événement ${EVENT_CODE} créé ---\n`);
    } else {
      console.log(`\n--- Import terminé : événement ${EVENT_CODE} mis à jour ---\n`);
    }

    return {
      eventId,
      tracks,
      areas,
      bulletins: bulletins.length,
      alerts,
      reports: REPORTS.length,
      communeImpacts,
      skippedZones,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nImport échoué:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    await client.release();
    await pool.end();
  }
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return entry ? path.resolve(entry) === path.resolve(__filename) : false;
}

if (isDirectInvocation()) {
  runGezaniSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
