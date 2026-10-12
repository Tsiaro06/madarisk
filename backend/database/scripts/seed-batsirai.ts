import path from 'path';
import pg from 'pg';
import { BATSIRAI_TRACK } from '../seeds/batsirai-2022';

/**
 * Import idempotent de l'événement historique « Cyclone Batsirai — février 2022 ».
 *
 * Contraintes respectées :
 *  - Aucune donnée inventée : la trajectoire provient du best track officiel
 *    IBTrACS v04r01 (SID 2022024S09090) ; les niveaux d'alerte, bulletins et
 *    bilans proviennent des sources citées (Météo Madagascar, UNICEF, ONU/OCHA).
 *  - L'événement est un événement passé normal (statut CLOTURE) : il ne génère
 *    aucune notification et n'apparaît jamais comme actif.
 *  - Idempotence : relancer le script met à jour l'événement et remplace ses
 *    données rattachées (trajectoire, zones, bulletins, alertes, rapports).
 *
 * Exécution : `npm run db:seed:batsirai`
 */

const EVENT_CODE = 'HIST-BATSIRAI-2022';
const KNOTS_TO_KMH = 1.852;

const EVENT_SOURCE_NAME = 'Météo-France (RSMC La Réunion) / NOAA IBTrACS';
const EVENT_SOURCE_URL =
  'https://ncics.org/ibtracs/index.php?name=v04r01-2022024S09090';
const BULLETIN_SOURCE_NAME = 'Météo Madagascar — Bulletins cycloniques';
const BULLETIN_SOURCE_URL = 'https://meteomadagascar.mg';
const BULLETIN_PUBLISHED_AT = '2022-02-04T16:00:00+03:00';
const BULLETIN_ALERT_SOURCE = 'Météo Madagascar — Bulletin cyclonique du 4 février 2022';
const ADMIN_AREA_SOURCE = 'Découpage administratif officiel Madagascar (MadaRisk)';
const VALID_FROM = '2022-02-04T16:00:00+03:00';
const VALID_TO = '2022-02-08T00:00:00+03:00';

/**
 * Normalisation côté SQL d'un nom de territoire : minuscules, sans caractère
 * non alphanumérique. Permet de retrouver une région ou un district quelle que
 * soit la ponctuation (« Atsimo-Andrefana » vs « Atsimo Andrefana »).
 */
function norm(column: string): string {
  return `regexp_replace(lower(${column}), '[^a-z0-9]', '', 'g')`;
}

function kmh(kt: number | null): number | null {
  if (kt === null || kt === undefined) return null;
  return Math.round(kt * KNOTS_TO_KMH * 100) / 100;
}

type VigilanceLevel = 'ROUGE' | 'JAUNE' | 'VERTE';

/**
 * Groupe de territoires placé à un même niveau de vigilance par le bulletin
 * cyclonique du 4 février 2022. `districts` liste les districts ADMINISTRATIFS
 * présents en base dont la géométrie compose la zone (données réelles du
 * découpage administratif) ; aucune coordonnée n'est inventée.
 */
interface ZoneSpec {
  level: VigilanceLevel;
  label: string;
  /** event_areas.risk_level (enum risk_level : EXTREME | ELEVE | FAIBLE). */
  riskLevel: 'EXTREME' | 'ELEVE' | 'FAIBLE';
  /** alerts.severity (enum severity_level : EXTREME | ELEVEE | FAIBLE). */
  severity: 'EXTREME' | 'ELEVEE' | 'FAIBLE';
  /** Territoires cités par le bulletin (régions ou districts), pour le libellé. */
  territories: string;
  /** Districts en base dont l'union forme la zone. */
  districts: string[];
}

// Territoires nommés par le bulletin du 4 février 2022 (repris tel quel dans le
// champ `alert_levels` des bulletins).
const RED_TERRITORIES = [
  'Atsinanana',
  'Vatovavy',
  'Fitovinany',
  'Atsimo Atsinanana',
  'Analamanga',
];
const YELLOW_TERRITORIES = [
  'Bongolava',
  'Menabe',
  'Atsimo Andrefana',
  'Anosy',
  'Androy',
];
const GREEN_TERRITORIES = [
  'Antalaha',
  'Maroantsetra',
  'Mananara Avaratra',
  'Mandritsara',
  'Andilamena',
  'Tsaratanana',
  'Maevatanana',
];

// Correspondance administrative région -> districts (noms présents en base).
// Sert uniquement à assembler les géométries réelles des districts ; la
// géométrie obtenue est illustrative (union administrative), non issue du
// bulletin.
const ZONES: ZoneSpec[] = [
  {
    level: 'ROUGE',
    label: 'Alerte rouge — région Atsinanana',
    riskLevel: 'EXTREME',
    severity: 'EXTREME',
    territories: 'La région Atsinanana',
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
    level: 'ROUGE',
    label: 'Alerte rouge — région Vatovavy',
    riskLevel: 'EXTREME',
    severity: 'EXTREME',
    territories: 'La région Vatovavy',
    districts: ['Ifanadiana', 'Mananjary', 'Nosy-Varika'],
  },
  {
    level: 'ROUGE',
    label: 'Alerte rouge — région Fitovinany',
    riskLevel: 'EXTREME',
    severity: 'EXTREME',
    territories: 'La région Fitovinany',
    districts: ['Ikongo', 'Manakara Atsimo', 'Vohipeno'],
  },
  {
    level: 'ROUGE',
    label: 'Alerte rouge — région Atsimo Atsinanana',
    riskLevel: 'EXTREME',
    severity: 'EXTREME',
    territories: 'La région Atsimo Atsinanana',
    districts: [
      'Befotaka',
      'Farafangana',
      'Midongy-Atsimo',
      'Vangaindrano',
      'Vondrozo',
    ],
  },
  {
    level: 'ROUGE',
    label: 'Alerte rouge — région Analamanga',
    riskLevel: 'EXTREME',
    severity: 'EXTREME',
    territories: 'La région Analamanga',
    districts: [
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
    level: 'JAUNE',
    label: 'Alerte jaune — région Bongolava',
    riskLevel: 'ELEVE',
    severity: 'ELEVEE',
    territories: 'La région Bongolava',
    districts: ['Fenoarivobe', 'Tsiroanomandidy'],
  },
  {
    level: 'JAUNE',
    label: 'Alerte jaune — région Menabe',
    riskLevel: 'ELEVE',
    severity: 'ELEVEE',
    territories: 'La région Menabe',
    districts: [
      'Belo Sur Tsiribihina',
      'Mahabo',
      'Manja',
      'Miandrivazo',
      'Morondava',
    ],
  },
  {
    level: 'JAUNE',
    label: 'Alerte jaune — région Atsimo Andrefana',
    riskLevel: 'ELEVE',
    severity: 'ELEVEE',
    territories: 'La région Atsimo Andrefana',
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
  {
    level: 'JAUNE',
    label: 'Alerte jaune — région Anosy',
    riskLevel: 'ELEVE',
    severity: 'ELEVEE',
    territories: 'La région Anosy',
    districts: ['Amboasary-Atsimo', 'Betroka', 'Taolagnaro'],
  },
  {
    level: 'JAUNE',
    label: 'Alerte jaune — région Androy',
    riskLevel: 'ELEVE',
    severity: 'ELEVEE',
    territories: 'La région Androy',
    districts: ['Ambovombe-Androy', 'Bekily', 'Beloha', 'Tsihombe'],
  },
  ...GREEN_TERRITORIES.map<ZoneSpec>((district) => ({
    level: 'VERTE',
    label: `Alerte verte — district de ${district}`,
    riskLevel: 'FAIBLE',
    severity: 'FAIBLE',
    territories: `Le district de ${district}`,
    districts: [district],
  })),
];

/** Normalise un nom de territoire comme le fait la requête SQL. */
function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const EVENT_DESCRIPTION = [
  'Événement historique reconstitué : cyclone tropical intense Batsirai (saison 2021-2022).',
  'Formation du système le 24 janvier 2022, atterrissage le 5 février 2022 vers 17h30 UTC (20h30, heure de Madagascar) à proximité de Nosy Varika, traversée de la Grande Île puis dissipation le 11 février 2022.',
  'Zones les plus touchées : régions Atsinanana, Vatovavy, Fitovinany et Atsimo Atsinanana.',
  'Bilans humains (sources datées, estimations divergentes conservées) : environ 112 000 personnes affectées et 62 000 déplacées (situation au 10 février 2022) ; 121 décès (bilan consolidé ONU/OCHA, 14 février 2022), contre un bilan initial de 92 décès (UNICEF).',
  'Données importées depuis des sources officielles citees : elles decrivent une situation passee et ne correspondent en aucun cas à une situation en temps reel.',
].join(' ');

const BULLETIN_1 = {
  bulletinRef: 'Bulletin cyclonique — 1er février 2022',
  title: 'Bulletin cyclonique du 1er février 2022 à 16h00 (heure de Madagascar)',
  publishedAt: '2022-02-01T16:00:00+03:00',
  observedAt: '2022-02-01T13:00:00Z',
  windKmh: 150,
  gustKmh: 210,
  alertLevel: 'VERTE',
  alertLevels: { global: 'VERTE' },
  positionDescription:
    'Système encore en mer, à distance de la Grande Île. Le bulletin ne fournit pas de coordonnée : la position officielle associée (best track IBTrACS au 1er février 2022 à 13h00 UTC) est approximativement 17,4°S 60,3°E.',
  content:
    "Bulletin du 1er février 2022 (16h00, heure de Madagascar). Vent soutenu moyen estimé à 150 km/h, rafales pouvant atteindre 210 km/h. Vigilance de niveau vert. Le système évolue encore en mer, se déplaçant vers l'ouest-sud-ouest.",
};

const BULLETIN_4 = {
  bulletinRef: 'Bulletin cyclonique — 4 février 2022',
  title: 'Bulletin cyclonique du 4 février 2022 à 16h00 (heure de Madagascar)',
  publishedAt: BULLETIN_PUBLISHED_AT,
  observedAt: '2022-02-04T13:00:00Z',
  windKmh: 185,
  gustKmh: 260,
  alertLevel: 'ROUGE',
  alertLevels: {
    rouge: RED_TERRITORIES,
    jaune: YELLOW_TERRITORIES,
    verte: GREEN_TERRITORIES,
  },
  positionDescription:
    "Approche de la côte est de Madagascar. Atterrissage prévu le 5 février 2022 entre 11h00 et 17h00 (heure de Madagascar), à proximité de Nosy Varika. Le bulletin ne fournit pas de coordonnée : la position officielle associée (best track IBTrACS au 4 février 2022 à 13h00 UTC) est approximativement 19,8°S 51,6°E.",
  content:
    "Bulletin du 4 février 2022 (16h00, heure de Madagascar). Vent soutenu moyen estimé à 185 km/h, rafales jusqu'à 260 km/h. Atterrissage prévu le 5 février entre 11h00 et 17h00 sur la côte est, avec un vent prévu d'environ 195 km/h. Alerte rouge pour les régions Atsinanana, Vatovavy, Fitovinany, Atsimo Atsinanana et Analamanga ; alerte jaune pour Bongolava, Menabe, Atsimo Andrefana, Anosy et Androy ; alerte verte pour les districts d'Antalaha, Maroantsetra, Mananara Avaratra, Mandritsara, Andilamena, Tsaratanana et Maevatanana.",
};

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
    reason: 'Formation du système tropical suivie par le RSMC La Réunion.',
    source: 'IBTRACS',
    recordedAt: '2022-01-24T00:00:00Z',
  },
  {
    from: 'PREVISION',
    to: 'ACTIF',
    reason: 'Atterrissage du cyclone près de Nosy Varika (Madagascar).',
    source: 'IBTRACS',
    recordedAt: '2022-02-05T17:30:00Z',
  },
  {
    from: 'ACTIF',
    to: 'SUIVI',
    reason: 'Traversée de la Grande Île et début de la phase de secours.',
    source: 'HISTORIQUE_BATSIRAI',
    recordedAt: '2022-02-06T06:00:00Z',
  },
  {
    from: 'SUIVI',
    to: 'CLOTURE',
    reason: 'Fin de la phase de réponse — événement historique clos.',
    source: 'HISTORIQUE_BATSIRAI',
    recordedAt: '2022-03-15T00:00:00Z',
  },
];

const REPORTS: Array<{
  title: string;
  reportType: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  parameters: Record<string, unknown>;
}> = [
  {
    title: 'Cyclone Batsirai — Rapport de situation UNICEF No.1 (février 2022)',
    reportType: 'RAPPORT_SITUATION',
    source: 'UNICEF — SitRep No.1',
    periodStart: '2022-02-05T00:00:00Z',
    periodEnd: '2022-02-08T00:00:00Z',
    parameters: {
      historical: true,
      source: 'UNICEF',
      sourceDocument: 'Rapport de situation No.1 — Cyclone Batsirai',
      sourceDate: '2022-02-08',
      indicators: [
        {
          code: 'affectes',
          label: 'Personnes affectées',
          value: 112115,
          unit: 'personnes',
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'deplaces',
          label: 'Personnes déplacées',
          value: 62000,
          unit: 'personnes',
          approx: true,
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'deces',
          label: 'Décès (bilan initial)',
          value: 92,
          unit: 'personnes',
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'routes_coupees',
          label: 'Routes coupées',
          value: 17,
          unit: 'axes',
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'ponts',
          label: 'Ponts endommagés',
          value: 17,
          unit: 'ouvrages',
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'salles_classe',
          label: 'Salles de classe endommagées',
          value: 2000,
          unit: 'salles',
          approx: true,
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
        {
          code: 'structures_sante',
          label: 'Structures sanitaires touchées',
          value: 69,
          unit: 'établissements',
          source: 'UNICEF SitRep No.1',
          date: '2022-02-08',
        },
      ],
    },
  },
  {
    title: 'Cyclone Batsirai — Bilan consolidé ONU/OCHA (14 février 2022)',
    reportType: 'RAPPORT_SITUATION',
    source: 'ONU/OCHA',
    periodStart: '2022-02-05T00:00:00Z',
    periodEnd: '2022-02-14T00:00:00Z',
    parameters: {
      historical: true,
      source: 'ONU/OCHA',
      sourceDocument: 'Bilan consolidé — Cyclone Batsirai',
      sourceDate: '2022-02-14',
      note: 'Les estimations divergent selon les sources et les dates : elles sont conservées distinctes et datées.',
      indicators: [
        {
          code: 'deces',
          label: 'Décès (cumul consolidé)',
          value: 121,
          unit: 'personnes',
          source: 'ONU/OCHA',
          date: '2022-02-14',
          note: 'Estimation consolidée, divergente du bilan initial UNICEF (92) et de la situation au 10 février (≈90).',
        },
        {
          code: 'affectes',
          label: 'Personnes affectées',
          value: 112000,
          unit: 'personnes',
          approx: true,
          source: 'Situation au 10 février 2022',
          date: '2022-02-10',
        },
        {
          code: 'deplaces',
          label: 'Personnes déplacées',
          value: 62000,
          unit: 'personnes',
          approx: true,
          source: 'Situation au 10 février 2022',
          date: '2022-02-10',
        },
        {
          code: 'deces_initial',
          label: 'Décès (bilan initial)',
          value: 90,
          unit: 'personnes',
          approx: true,
          source: 'Situation au 10 février 2022',
          date: '2022-02-10',
        },
      ],
    },
  },
];

export interface BatsiraiSeedSummary {
  eventId: string;
  tracks: number;
  areas: number;
  bulletins: number;
  alerts: number;
  reports: number;
  skippedZones: string[];
}

async function insertAreaForZone(
  client: pg.PoolClient,
  eventId: string,
  zone: ZoneSpec,
): Promise<number> {
  const description = `${zone.label} — zone placée en vigilance selon le bulletin Météo Madagascar du 4 février 2022 (niveau de vigilance, non une intensité mesurée). Géométrie illustrative : union des districts administratifs (non issue du bulletin).`;

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
     SELECT $1, 'AVANT', $3, $4, $5, $6, 'OFFICIEL', false, $7,
            agg.geom::geometry(MultiPolygon, 4326)
       FROM agg`,
    [
      eventId,
      zone.districts.map(normalizeName),
      zone.riskLevel,
      VALID_FROM,
      VALID_TO,
      ADMIN_AREA_SOURCE,
      description,
    ],
  );

  return result.rowCount ?? 0;
}

export async function runBatsiraiSeed(): Promise<BatsiraiSeedSummary> {
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
    console.log('--- Import historique : Cyclone Batsirai (février 2022) ---\n');
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
          'Cyclone Batsirai — février 2022',
          EVENT_DESCRIPTION,
          EVENT_SOURCE_NAME,
          EVENT_SOURCE_URL,
          '2022-01-24T00:00:00Z',
          '2022-02-11T00:00:00Z',
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
          'Cyclone Batsirai — février 2022',
          EVENT_DESCRIPTION,
          EVENT_SOURCE_NAME,
          EVENT_SOURCE_URL,
          '2022-01-24T00:00:00Z',
          '2022-02-11T00:00:00Z',
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

    // 4. Trajectoire officielle (IBTrACS).
    let tracks = 0;
    for (const point of BATSIRAI_TRACK) {
      await client.query(
        `INSERT INTO event_tracks
           (event_id, observed_at, track_type, latitude, longitude,
            wind_speed_kmh, pressure_hpa, movement_direction, movement_speed_kmh, geom)
         VALUES ($1, $2, 'OBSERVEE', $3::numeric, $4::numeric, $5, $6, $7, $8,
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
        ],
      );
      tracks += 1;
    }
    console.log(`  ✓ Trajectoire : ${tracks} points (source IBTrACS).`);

    // 5. Zones (géométrie administrative réelle).
    let areas = 0;
    const skippedZones: string[] = [];
    for (const zone of ZONES) {
      const insertedAreas = await insertAreaForZone(client, eventId, zone);
      if (insertedAreas > 0) {
        areas += insertedAreas;
      } else {
        skippedZones.push(zone.label);
      }
    }
    console.log(`  ✓ Zones : ${areas} géométries administratives.`);
    if (skippedZones.length > 0) {
      console.log(
        `  ⚠ Zones non trouvées en base (ignorées) : ${skippedZones.join(', ')}`,
      );
    }

    // 6. Bulletins météo historiques.
    const bulletins = [BULLETIN_1, BULLETIN_4];
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
          bulletin.bulletinRef,
          bulletin.title,
          bulletin.publishedAt,
          bulletin.observedAt,
          bulletin.positionDescription,
          bulletin.windKmh,
          bulletin.gustKmh,
          null,
          null,
          null,
          bulletin.alertLevel,
          JSON.stringify(bulletin.alertLevels),
          bulletin.content,
        ],
      );
    }
    console.log(`  ✓ Bulletins météo : ${bulletins.length} bulletins sourcés.`);

    // 7. Alertes historiques (archivées, sans notification).
    //    Une alerte par zone de vigilance, rattachée à l'événement (les régions
    //    ne sont pas rattachées en base). Aucune n'est publiée : statut
    //    ARCHIVEE + is_historique, donc jamais active ni notifiée.
    let alerts = 0;
    for (const zone of ZONES) {
      const title = `Historique — bulletin du 4 février 2022 : ${zone.label}`;
      const message =
        `Donnée historique (non active, bulletin du 4 février 2022). ${zone.territories} concerné(e) par le niveau de vigilance « ${zone.level} » émis par le bulletin cyclonique Météo Madagascar du 4 février 2022 à 16h00 (heure de Madagascar).`;

      await client.query(
        `INSERT INTO alerts
           (event_id, type, severity, status, title, message,
            source, basis, valid_from, is_automatic, update_count, created_by,
            published_at, expires_at, is_historique)
         VALUES ($1, 'CYCLONE', $2, 'ARCHIVEE', $3, $4,
                 $5, 'PREVISION', $6, false, 0, $7, $8, $9, true)`,
        [
          eventId,
          zone.severity,
          title,
          message,
          BULLETIN_ALERT_SOURCE,
          VALID_FROM,
          createdBy,
          BULLETIN_PUBLISHED_AT,
          VALID_TO,
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

    return { eventId, tracks, areas, bulletins: bulletins.length, alerts, reports: REPORTS.length, skippedZones };
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
  runBatsiraiSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
