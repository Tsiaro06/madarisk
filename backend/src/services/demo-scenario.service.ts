import { db } from '../config/database';
import { env, isDemoDatabaseName, resolveDatabaseName } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/app-error';
import { exposureService } from './exposure.service';
import { automaticAlertService } from './automatic-alerts.service';
import type { EventStatus } from '../types/event.types';

export const DEMO_EVENT_CODE = 'DEMO-CYC-ANKARATRA';
export const DEMO_EVENT_NAME = 'SCÉNARIO DE DÉMONSTRATION — Cyclone Ankaratra';
export const DEMO_SOURCE_NAME = 'SCÉNARIO SOUTENANCE — SIMULÉ';
export const DEMO_SOURCE_URL = 'simulation://soutenance';
export const DEMO_ALERT_SOURCE = DEMO_SOURCE_NAME;
export const DEMO_HISTORY_SOURCE = 'SIMULATION_SOUTENANCE';

export type DemoStep = 'PREVISION' | 'ACTIF' | 'SUIVI' | 'CLOTURE';

export interface DemoStepInfo {
  key: DemoStep;
  order: number;
  label: string;
  description: string;
}

export const DEMO_STEPS: DemoStepInfo[] = [
  {
    key: 'PREVISION',
    order: 1,
    label: 'Étape 1 — Prévision',
    description: 'Trajectoire prévue, zone d’influence simulée et alerte préventive.',
  },
  {
    key: 'ACTIF',
    order: 2,
    label: 'Étape 2 — Événement actif',
    description: 'Trajectoire observée, communes exposées et alerte active.',
  },
  {
    key: 'SUIVI',
    order: 3,
    label: 'Étape 3 — Suivi',
    description: 'Points observés supplémentaires, zones et risques mis à jour.',
  },
  {
    key: 'CLOTURE',
    order: 4,
    label: 'Étape 4 — Bilan et clôture',
    description: 'Événement clôturé, alertes archivées et bilan disponible.',
  },
];

const STEP_ORDER: DemoStep[] = ['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'];

export interface DemoScenarioState {
  demoMode: true;
  event: {
    id: string;
    eventCode: string;
    name: string;
    status: EventStatus;
    severity: string;
    sourceName: string | null;
    sourceUrl: string | null;
    startedAt: string | null;
    endedAt: string | null;
  } | null;
  step: DemoStep | null;
  steps: DemoStepInfo[];
  counts: {
    tracks: number;
    areas: number;
    exposedCommunes: number;
    risks: number;
    alerts: number;
  };
}

interface GeoDistrict {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

interface ScenarioGeography {
  regionId: string;
  regionName: string;
  districts: GeoDistrict[];
  communeIds: string[];
  anchor: { lon: number; lat: number };
}

interface TrackSeed {
  observedAt: Date;
  forecastFor: Date | null;
  trackType: 'PREVUE' | 'OBSERVEE';
  latitude: number;
  longitude: number;
  windSpeedKmh: number;
  gustSpeedKmh: number;
  pressureHpa: number;
  precipitationMm: number;
  movementDirection: string;
  movementSpeedKmh: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Vérifie que l'environnement est bien celui de la démonstration isolée. */
export function assertDemoRuntime(): string {
  if (!env.DEMO_MODE) {
    throw AppError.notFound('Ressource introuvable');
  }
  const dbName = resolveDatabaseName({ databaseUrl: env.DATABASE_URL, dbName: env.DB_NAME });
  if (!isDemoDatabaseName(dbName)) {
    throw AppError.notFound('Ressource introuvable');
  }
  return dbName;
}

function demoRegionName(): string {
  const value = process.env.DEMO_REGION_NAME?.trim();
  return value && value.length > 0 ? value : 'VAKINANKARATRA';
}

function demoDistrictNames(): string[] {
  const raw = process.env.DEMO_DISTRICT_NAMES?.trim();
  const value = raw && raw.length > 0 ? raw : 'ANTSIRABE I,ANTSIRABE II,AMBATOLAMPY';
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function stepIndex(step: DemoStep): number {
  return STEP_ORDER.indexOf(step);
}

function isDemoStep(value: unknown): value is DemoStep {
  return typeof value === 'string' && STEP_ORDER.includes(value as DemoStep);
}

async function resolveGeography(): Promise<ScenarioGeography> {
  const regionName = demoRegionName();
  const districtNames = demoDistrictNames();

  const regionResult = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM regions
     WHERE normalized_name = $1 OR name = $2
     ORDER BY name LIMIT 1`,
    [normalize(regionName), regionName],
  );

  if (regionResult.rows.length === 0) {
    throw AppError.badRequest(
      `Région de démonstration introuvable : « ${regionName} ». ` +
        'Importez le référentiel géographique dans la base de démonstration (npm run db:demo:init) ' +
        'ou ajustez DEMO_REGION_NAME.',
    );
  }
  const region = regionResult.rows[0];

  const districtResult = await db.query<{
    id: string;
    name: string;
    lon: number | null;
    lat: number | null;
  }>(
    `SELECT id, name,
            ST_X(centroid) AS lon,
            ST_Y(centroid) AS lat
     FROM districts
     WHERE region_id = $1 AND normalized_name = ANY($2::text[])
     ORDER BY name`,
    [region.id, districtNames.map(normalize)],
  );

  const foundNames = new Set(districtResult.rows.map((r) => normalize(r.name)));
  const missing = districtNames.filter((n) => !foundNames.has(normalize(n)));
  if (missing.length > 0) {
    throw AppError.badRequest(
      `District(s) de démonstration introuvable(s) dans la région « ${region.name} » : ` +
        `${missing.join(', ')}. Ajustez DEMO_DISTRICT_NAMES ou importez la géographie.`,
    );
  }

  const districts: GeoDistrict[] = [];
  for (const row of districtResult.rows) {
    if (row.lon === null || row.lon === undefined || row.lat === null || row.lat === undefined) {
      throw AppError.badRequest(
        `Centroïde manquant pour le district « ${row.name} ». Géographie incomplète : exécutez db:demo:init.`,
      );
    }
    districts.push({ id: row.id, name: row.name, lon: Number(row.lon), lat: Number(row.lat) });
  }

  const communeResult = await db.query<{ id: string }>(
    `SELECT id FROM communes
     WHERE district_id = ANY($1::uuid[])
     ORDER BY name
     LIMIT 60`,
    [districts.map((d) => d.id)],
  );

  if (communeResult.rows.length === 0) {
    throw AppError.badRequest(
      'Aucune commune trouvée dans les districts de démonstration. Importez la géographie complète.',
    );
  }

  const lon = districts.reduce((sum, d) => sum + d.lon, 0) / districts.length;
  const lat = districts.reduce((sum, d) => sum + d.lat, 0) / districts.length;

  return {
    regionId: region.id,
    regionName: region.name,
    districts,
    communeIds: communeResult.rows.map((r) => r.id),
    anchor: { lon, lat },
  };
}

async function getDemoEventId(): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM hazard_events WHERE event_code = $1 LIMIT 1',
    [DEMO_EVENT_CODE],
  );
  return result.rows[0]?.id ?? null;
}

async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const result = await db.query<{ status: EventStatus }>(
    'SELECT status FROM hazard_events WHERE id = $1',
    [eventId],
  );
  return result.rows[0]?.status ?? null;
}

async function recordStatusTransition(
  eventId: string,
  from: EventStatus | null,
  to: EventStatus,
  reason: string,
): Promise<void> {
  await db.query(
    `INSERT INTO event_status_history
       (event_id, from_status, to_status, reason, actor_type, actor_id, source, recorded_at)
     VALUES ($1, $2, $3, $4, 'SYSTEM', NULL, $5, now())`,
    [eventId, from, to, reason, DEMO_HISTORY_SOURCE],
  );
}

async function setEventStatus(
  eventId: string,
  to: EventStatus,
  reason: string,
  endedAt: Date | null = null,
): Promise<void> {
  const from = await getEventStatus(eventId);
  if (from === to) return;
  await db.query(
    `UPDATE hazard_events
     SET status = $2,
         ended_at = COALESCE($3, ended_at),
         updated_at = now()
     WHERE id = $1`,
    [eventId, to, endedAt],
  );
  await recordStatusTransition(eventId, from, to, reason);
}

function buildTrajectory(anchor: { lon: number; lat: number }): TrackSeed[] {
  const now = Date.now();
  const hours = (h: number) => new Date(now + h * 3600_000);
  const { lon, lat } = anchor;

  return [
    {
      observedAt: hours(-30),
      forecastFor: hours(6),
      trackType: 'PREVUE',
      latitude: lat + 0.75,
      longitude: lon + 1.35,
      windSpeedKmh: 120,
      gustSpeedKmh: 160,
      pressureHpa: 965,
      precipitationMm: 12,
      movementDirection: 'OSO',
      movementSpeedKmh: 22,
    },
    {
      observedAt: hours(-24),
      forecastFor: hours(12),
      trackType: 'PREVUE',
      latitude: lat + 0.35,
      longitude: lon + 0.85,
      windSpeedKmh: 135,
      gustSpeedKmh: 175,
      pressureHpa: 955,
      precipitationMm: 24,
      movementDirection: 'OSO',
      movementSpeedKmh: 20,
    },
    {
      observedAt: hours(-18),
      forecastFor: hours(18),
      trackType: 'PREVUE',
      latitude: lat + 0.05,
      longitude: lon + 0.35,
      windSpeedKmh: 150,
      gustSpeedKmh: 195,
      pressureHpa: 945,
      precipitationMm: 38,
      movementDirection: 'OSO',
      movementSpeedKmh: 18,
    },
  ];
}

function buildObservedTrack(anchor: { lon: number; lat: number }, index: number): TrackSeed {
  const now = Date.now();
  const hours = (h: number) => new Date(now + h * 3600_000);
  const { lon, lat } = anchor;

  const points = [
    { latitude: lat - 0.02, longitude: lon - 0.05, wind: 165, gust: 210, pressure: 935 },
    { latitude: lat - 0.25, longitude: lon - 0.35, wind: 140, gust: 180, pressure: 948 },
    { latitude: lat - 0.55, longitude: lon - 0.75, wind: 110, gust: 145, pressure: 962 },
    { latitude: lat - 0.85, longitude: lon - 1.1, wind: 85, gust: 110, pressure: 975 },
  ];
  const point = points[Math.min(index, points.length - 1)];

  return {
    observedAt: hours(-12 + index * 4),
    forecastFor: null,
    trackType: 'OBSERVEE',
    latitude: point.latitude,
    longitude: point.longitude,
    windSpeedKmh: point.wind,
    gustSpeedKmh: point.gust,
    pressureHpa: point.pressure,
    precipitationMm: 30 + index * 10,
    movementDirection: 'OSO',
    movementSpeedKmh: 18 - index,
  };
}

async function insertTrack(eventId: string, track: TrackSeed): Promise<void> {
  await db.query(
    `INSERT INTO event_tracks
       (event_id, observed_at, forecast_for, track_type, latitude, longitude,
        wind_speed_kmh, gust_speed_kmh, pressure_hpa, precipitation_mm,
        movement_direction, movement_speed_kmh, geom)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            ST_SetSRID(ST_MakePoint($6, $5), 4326)
     WHERE NOT EXISTS (
       SELECT 1 FROM event_tracks
       WHERE event_id = $1 AND track_type = $4 AND observed_at = $2
     )`,
    [
      eventId,
      track.observedAt,
      track.forecastFor,
      track.trackType,
      track.latitude,
      track.longitude,
      track.windSpeedKmh,
      track.gustSpeedKmh,
      track.pressureHpa,
      track.precipitationMm,
      track.movementDirection,
      track.movementSpeedKmh,
    ],
  );
}

async function upsertDetectionCommunes(eventId: string, communeIds: string[]): Promise<void> {
  if (communeIds.length === 0) return;
  await db.query(
    `INSERT INTO event_detection_communes (event_id, commune_id, metric, value, threshold, recorded_at)
     SELECT $1, c.id, 'VENT_MAX_SIMULE', 155, 120, now()
     FROM unnest($2::uuid[]) AS c(id)
     ON CONFLICT (event_id, commune_id)
     DO UPDATE SET value = EXCLUDED.value, threshold = EXCLUDED.threshold, recorded_at = now()`,
    [eventId, communeIds],
  );
}

async function getSimulationWeatherSourceId(): Promise<string> {
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM weather_sources WHERE name = 'SIMULATION SOUTENANCE' LIMIT 1",
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO weather_sources (name, provider_type, base_url, refresh_interval_minutes, is_active)
     VALUES ('SIMULATION SOUTENANCE', 'SIMULATION', 'simulation://soutenance', 0, false)
     RETURNING id`,
  );
  return inserted.rows[0].id;
}

async function insertForecasts(_eventId: string, communeIds: string[]): Promise<void> {
  if (communeIds.length === 0) return;
  const sourceId = await getSimulationWeatherSourceId();
  await db.query(
    `INSERT INTO weather_forecasts
       (weather_source_id, commune_id, forecast_day, generated_at, latitude, longitude,
        temperature_min_c, temperature_max_c, relative_humidity_avg, precipitation_sum_mm,
        wind_speed_max_kmh, wind_gusts_max_kmh, pressure_avg_hpa, weather_code, raw_data, data_kind)
     SELECT $1, c.id, (now() + interval '1 day')::date, now(),
            ST_X(c.centroid), ST_Y(c.centroid),
            21, 29, 85, 65, 130, 175, 955, 65,
            jsonb_build_object('simulation', true, 'event_code', $3, 'marker', 'PREVU'), 'PREVU'
     FROM communes c
     WHERE c.id = ANY($2::uuid[]) AND c.centroid IS NOT NULL
     ON CONFLICT (commune_id, weather_source_id, forecast_day)
     DO UPDATE SET wind_speed_max_kmh = EXCLUDED.wind_speed_max_kmh, raw_data = EXCLUDED.raw_data`,
    [sourceId, communeIds, DEMO_EVENT_CODE],
  );
}

async function insertObservations(eventId: string, communeIds: string[]): Promise<void> {
  if (communeIds.length === 0) return;
  const sourceId = await getSimulationWeatherSourceId();
  await db.query(
    `INSERT INTO weather_observations
       (weather_source_id, commune_id, event_id, observed_at, latitude, longitude,
        precipitation_mm, rainfall_24h_mm, temperature_c, humidity_percent,
        wind_speed_kmh, wind_direction_deg, pressure_hpa, wind_gusts_kmh, weather_code,
        raw_data, geom, data_kind)
     SELECT $1, c.id, $2, now(),
            ST_X(c.centroid), ST_Y(c.centroid),
            42, 88, 24, 92, 120, 250, 958, 165, 65,
            jsonb_build_object('simulation', true, 'event_code', $3, 'marker', 'OBSERVE'),
            c.centroid, 'OBSERVE'
     FROM communes c
     WHERE c.id = ANY($4::uuid[]) AND c.centroid IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM weather_observations w
         WHERE w.weather_source_id = $1 AND w.commune_id = c.id
           AND w.raw_data->>'marker' = 'OBSERVE'
       )`,
    [sourceId, eventId, DEMO_EVENT_CODE, communeIds],
  );
}

async function markEventDataAsSimulated(eventId: string): Promise<void> {
  await db.query(
    `UPDATE event_areas
     SET source = $2,
         description = COALESCE(description, '') || ' — Zone d’influence simulée'
     WHERE event_id = $1`,
    [eventId, DEMO_HISTORY_SOURCE],
  );
  await db.query(
    `UPDATE exposed_communes
     SET data_type = 'ESTIME'
     WHERE event_id = $1`,
    [eventId],
  );
}

async function createDemoEvent(geography: ScenarioGeography): Promise<string> {
  const now = new Date();
  const expectedEnd = new Date(now.getTime() + 72 * 3600_000);
  const result = await db.query<{ id: string }>(
    `INSERT INTO hazard_events
       (event_code, name, type, status, severity, description, source_name, source_url,
        started_at, expected_end_at, ended_at, created_by)
     VALUES ($1, $2, 'CYCLONE', 'PREVISION', 'ELEVEE', $3, $4, $5, $6, $7, NULL, NULL)
     RETURNING id`,
    [
      DEMO_EVENT_CODE,
      DEMO_EVENT_NAME,
      `Scénario de démonstration — ${geography.regionName}. Trajectoire simulée pour démonstration.`,
      DEMO_SOURCE_NAME,
      DEMO_SOURCE_URL,
      now,
      expectedEnd,
    ],
  );
  const eventId = result.rows[0].id;
  await recordStatusTransition(
    eventId,
    null,
    'PREVISION',
    'Détection simulée — création en prévision',
  );
  return eventId;
}

async function applyPrevisionStep(eventId: string, geography: ScenarioGeography): Promise<void> {
  const tracks = buildTrajectory(geography.anchor);
  for (const track of tracks) {
    await insertTrack(eventId, track);
  }
  await upsertDetectionCommunes(eventId, geography.communeIds);
  await insertForecasts(eventId, geography.communeIds);

  await exposureService.computeForEvent(eventId, { trigger: 'MANUAL' });
  await markEventDataAsSimulated(eventId);

  await automaticAlertService.generateForEvent({
    eventId,
    trigger: 'MANUAL',
    basisOverride: 'PREVISION',
    autoPublish: false,
  });
}

async function applyActifStep(eventId: string, geography: ScenarioGeography): Promise<void> {
  await setEventStatus(eventId, 'ACTIF', 'Passage à actif — observation simulée');
  for (let i = 0; i < 2; i += 1) {
    await insertTrack(eventId, buildObservedTrack(geography.anchor, i));
  }
  await insertObservations(eventId, geography.communeIds);
  await exposureService.computeForEvent(eventId, { trigger: 'MANUAL' });
  await markEventDataAsSimulated(eventId);
  await automaticAlertService.generateForEvent({
    eventId,
    trigger: 'MANUAL',
    basisOverride: 'OBSERVATION',
    autoPublish: false,
  });
}

async function applySuiviStep(eventId: string, geography: ScenarioGeography): Promise<void> {
  await setEventStatus(eventId, 'SUIVI', 'Passage à suivi — évaluation post-événement simulée');
  for (let i = 2; i < 4; i += 1) {
    await insertTrack(eventId, buildObservedTrack(geography.anchor, i));
  }
  await exposureService.computeForEvent(eventId, { trigger: 'MANUAL' });
  await markEventDataAsSimulated(eventId);
  await automaticAlertService.generateForEvent({
    eventId,
    trigger: 'MANUAL',
    basisOverride: 'OBSERVATION',
    autoPublish: false,
  });
}

async function applyClotureStep(eventId: string): Promise<void> {
  await setEventStatus(eventId, 'CLOTURE', 'Clôture simulée — bilan disponible', new Date());
  await db.query(
    `UPDATE alerts
     SET status = 'ARCHIVEE', updated_at = now()
     WHERE event_id = $1 AND status <> 'ARCHIVEE'`,
    [eventId],
  );
}

async function applyStepInternal(
  eventId: string,
  step: DemoStep,
  geography: ScenarioGeography,
): Promise<void> {
  switch (step) {
    case 'PREVISION':
      await applyPrevisionStep(eventId, geography);
      break;
    case 'ACTIF':
      await applyActifStep(eventId, geography);
      break;
    case 'SUIVI':
      await applySuiviStep(eventId, geography);
      break;
    case 'CLOTURE':
      await applyClotureStep(eventId);
      break;
    default:
      throw AppError.badRequest(`Étape de démonstration inconnue : ${String(step)}`);
  }
}

async function clearScenario(): Promise<void> {
  const eventId = await getDemoEventId();

  await db.query('DELETE FROM alerts WHERE source = $1', [DEMO_ALERT_SOURCE]);

  if (eventId) {
    await db.query('DELETE FROM risk_assessments WHERE event_id = $1', [eventId]);
    await db.query('DELETE FROM reports WHERE event_id = $1', [eventId]);
  }

  await db.query('DELETE FROM hazard_events WHERE event_code = $1', [DEMO_EVENT_CODE]);
  await db.query("DELETE FROM weather_observations WHERE raw_data->>'simulation' = 'true'");
  await db.query("DELETE FROM weather_forecasts WHERE raw_data->>'simulation' = 'true'");
}

async function collectCounts(eventId: string | null): Promise<DemoScenarioState['counts']> {
  if (!eventId) {
    return { tracks: 0, areas: 0, exposedCommunes: 0, risks: 0, alerts: 0 };
  }
  const result = await db.query<{
    tracks: string;
    areas: string;
    exposed: string;
    risks: string;
    alerts: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM event_tracks WHERE event_id = $1) AS tracks,
       (SELECT COUNT(*)::text FROM event_areas WHERE event_id = $1) AS areas,
       (SELECT COUNT(*)::text FROM exposed_communes WHERE event_id = $1) AS exposed,
       (SELECT COUNT(*)::text FROM risk_assessments WHERE event_id = $1) AS risks,
       (SELECT COUNT(*)::text FROM alerts WHERE event_id = $1) AS alerts`,
    [eventId],
  );
  const row = result.rows[0];
  return {
    tracks: Number(row.tracks),
    areas: Number(row.areas),
    exposedCommunes: Number(row.exposed),
    risks: Number(row.risks),
    alerts: Number(row.alerts),
  };
}

async function buildState(): Promise<DemoScenarioState> {
  const eventId = await getDemoEventId();
  if (!eventId) {
    return {
      demoMode: true,
      event: null,
      step: null,
      steps: DEMO_STEPS,
      counts: await collectCounts(null),
    };
  }

  const result = await db.query<{
    id: string;
    event_code: string;
    name: string;
    status: EventStatus;
    severity: string;
    source_name: string | null;
    source_url: string | null;
    started_at: string | null;
    ended_at: string | null;
  }>(
    `SELECT id, event_code, name, status, severity, source_name, source_url, started_at, ended_at
     FROM hazard_events WHERE id = $1`,
    [eventId],
  );
  const row = result.rows[0];
  const step = isDemoStep(row.status) ? row.status : null;

  return {
    demoMode: true,
    event: {
      id: row.id,
      eventCode: row.event_code,
      name: row.name,
      status: row.status,
      severity: row.severity,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    },
    step,
    steps: DEMO_STEPS,
    counts: await collectCounts(eventId),
  };
}

export const demoScenarioService = {
  /** Réinitialise complètement le scénario puis applique l'étape de prévision. */
  async reset(): Promise<DemoScenarioState> {
    assertDemoRuntime();
    await clearScenario();
    const geography = await resolveGeography();
    const eventId = await createDemoEvent(geography);
    await applyPrevisionStep(eventId, geography);
    logger.warn({ eventId, region: geography.regionName }, 'Scénario de démonstration initialisé');
    return buildState();
  },

  /** Alias idempotent utilisé par le script de seed. */
  async seed(): Promise<DemoScenarioState> {
    return this.reset();
  },

  /**
   * Applique une étape de manière déterministe. Si l'étape demandée est
   * antérieure à l'étape courante, le scénario est reconstruit depuis zéro.
   */
  async goToStep(step: DemoStep): Promise<DemoScenarioState> {
    assertDemoRuntime();
    const geography = await resolveGeography();
    let eventId = await getDemoEventId();

    if (!eventId) {
      await clearScenario();
      eventId = await createDemoEvent(geography);
    }

    const currentStatus = await getEventStatus(eventId);
    const currentStep = isDemoStep(currentStatus) ? currentStatus : null;

    if (currentStep === null || stepIndex(step) < stepIndex(currentStep)) {
      await clearScenario();
      const freshGeography = await resolveGeography();
      eventId = await createDemoEvent(freshGeography);
      for (const candidate of STEP_ORDER) {
        if (stepIndex(candidate) > stepIndex(step)) break;
        await applyStepInternal(eventId, candidate, freshGeography);
      }
      return buildState();
    }

    for (const candidate of STEP_ORDER) {
      if (
        stepIndex(candidate) <= stepIndex(currentStep) ||
        stepIndex(candidate) > stepIndex(step)
      ) {
        continue;
      }
      await applyStepInternal(eventId, candidate, geography);
    }

    return buildState();
  },

  async getState(): Promise<DemoScenarioState> {
    assertDemoRuntime();
    return buildState();
  },

  /** Garde défensive : refuse toute donnée non-objet côté appelants. */
  isScenarioState(value: unknown): value is DemoScenarioState {
    return isPlainObject(value) && 'steps' in value;
  },
};
