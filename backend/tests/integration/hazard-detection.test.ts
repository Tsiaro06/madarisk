import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { weatherRepository } from '../../src/repositories/weather.repository';
import { password } from '../../src/utils/password';
import { hazardDetectionService } from '../../src/services/hazard-detection.service';

interface Commune {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

let admin: { id: string; token: string };
let client: { id: string; token: string };

let communes: Commune[];
let sourceId: string;
const marker = new Date();

const ruleIds: string[] = [];
let eventIds: string[] = [];

function makeEmail(suffix: string): string {
  return `hzd_${suffix}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: 'ADMIN' | 'SUPER_ADMIN' | 'CLIENT'): Promise<{
  id: string;
  token: string;
}> {
  const email = makeEmail(role.toLowerCase());
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: role,
    lastName: 'DetectionTester',
    role,
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  return { id: user.id, token: login.body.data.accessToken };
}

/** Purge des données liées aux communes du scénario (indépendant de l'ordre de test). */
async function cleanScenario(communeIds: string[]): Promise<void> {
  await db.query(
    `DELETE FROM hazard_events
     WHERE id IN (
       SELECT DISTINCT k.event_id
       FROM event_detection_keys k
       WHERE k.detection_key LIKE ANY($1::text[])
     )`,
    [communeIds.map((c) => `%:${c}`)],
  );
  await db.query('DELETE FROM weather_observations WHERE commune_id = ANY($1::uuid[])', [
    communeIds,
  ]);
  await db.query('DELETE FROM weather_forecasts WHERE commune_id = ANY($1::uuid[])', [communeIds]);
  await db.query('DELETE FROM hazard_detection_rules WHERE commune_id = ANY($1::uuid[])', [
    communeIds,
  ]);
}

async function insertRule(data: {
  hazard: string;
  metric: string;
  operator: string;
  threshold: number;
  horizonHours?: number;
  isActive?: boolean;
  communeId: string;
  severityRules?: { level: string; min: number }[];
}): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO hazard_detection_rules
       (hazard_type, metric, operator, threshold, threshold_max,
        duration_minutes, aggregation_window_minutes, forecast_horizon_hours,
        severity_rules, is_active, commune_id, created_by)
     VALUES ($1, $2, $3, $4, NULL, 0, 60, $5, $6, $7, $8, NULL)
     RETURNING id`,
    [
      data.hazard,
      data.metric,
      data.operator,
      data.threshold,
      data.horizonHours ?? 0,
      JSON.stringify(data.severityRules ?? []),
      data.isActive ?? true,
      data.communeId,
    ],
  );
  ruleIds.push(result.rows[0].id);
  return result.rows[0].id;
}

async function insertObservation(
  commune: Commune,
  data: {
    observedAt: string;
    precipitationMm?: number;
    rainfall24hMm?: number;
    windSpeedKmh?: number;
    pressureHpa?: number;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO weather_observations
       (weather_source_id, commune_id, observed_at, latitude, longitude,
        precipitation_mm, rainfall_24h_mm, wind_speed_kmh, pressure_hpa,
        data_kind, geom)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OBSERVE',
             ST_SetSRID(ST_MakePoint($5::numeric, $4::numeric), 4326))`,
    [
      sourceId,
      commune.id,
      data.observedAt,
      commune.latitude,
      commune.longitude,
      data.precipitationMm ?? null,
      data.rainfall24hMm ?? null,
      data.windSpeedKmh ?? null,
      data.pressureHpa ?? null,
    ],
  );
}

async function insertForecast(
  commune: Commune,
  data: { forecastDay: string; precipitationSumMm?: number },
): Promise<void> {
  await db.query(
    `INSERT INTO weather_forecasts
       (weather_source_id, commune_id, forecast_day, generated_at, latitude, longitude,
        precipitation_sum_mm, data_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PREVU')`,
    [
      sourceId,
      commune.id,
      data.forecastDay,
      new Date().toISOString(),
      commune.latitude,
      commune.longitude,
      data.precipitationSumMm ?? null,
    ],
  );
}

async function destroyEvent(eventId: string): Promise<void> {
  await db.query('DELETE FROM hazard_events WHERE id = $1', [eventId]);
}

async function destroyEvents(): Promise<void> {
  if (eventIds.length === 0) return;
  await db.query('DELETE FROM hazard_events WHERE id = ANY($1::uuid[])', [eventIds]);
  eventIds = [];
}

async function destroyWeather(communeIds: string[]): Promise<void> {
  await db.query('DELETE FROM weather_observations WHERE commune_id = ANY($1::uuid[])', [
    communeIds,
  ]);
  await db.query('DELETE FROM weather_forecasts WHERE commune_id = ANY($1::uuid[])', [communeIds]);
}

async function findEventByKey(key: string): Promise<{ id: string; status: string } | null> {
  const result = await db.query<{ id: string; status: string }>(
    `SELECT e.id, e.status
     FROM event_detection_keys k
     JOIN hazard_events e ON e.id = k.event_id
     WHERE k.detection_key = $1
     ORDER BY k.last_seen_at DESC
     LIMIT 1`,
    [key],
  );
  return result.rows[0] ?? null;
}

async function eventStatusHistory(
  eventId: string,
): Promise<{ from_status: string | null; to_status: string }[]> {
  const result = await db.query<{ from_status: string | null; to_status: string }>(
    `SELECT from_status, to_status::text AS to_status
     FROM event_status_history
     WHERE event_id = $1
     ORDER BY recorded_at ASC`,
    [eventId],
  );
  return result.rows;
}

async function snapshotCount(eventId: string): Promise<number> {
  const result = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM event_snapshots WHERE event_id = $1`,
    [eventId],
  );
  return parseInt(result.rows[0].n, 10);
}

async function latestRun(): Promise<{ status: string }> {
  const result = await db.query<{ status: string }>(
    `SELECT status
     FROM hazard_detection_runs
     WHERE created_at >= $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [marker.toISOString()],
  );
  expect(result.rows[0]).toBeDefined();
  return result.rows[0];
}

function dayFromNow(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3600_000).toISOString().slice(0, 10);
}

async function runVentScenario(now: Date): Promise<void> {
  const cv = communes[1];
  await insertObservation(cv, {
    observedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    windSpeedKmh: 60,
  });
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  client = await createUserAndLogin('CLIENT');
  sourceId = await weatherRepository.getSourceId();

  const c = await db.query<Commune & { latitude: string; longitude: string }>(
    `SELECT c.id, c.name,
            ST_Y(c.centroid)::text AS latitude,
            ST_X(c.centroid)::text AS longitude
     FROM communes c
     JOIN districts d ON d.id = c.district_id
     WHERE d.normalized_name = 'MAROANTSETRA'
     ORDER BY c.name
     LIMIT 6`,
  );
  communes = c.rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: parseFloat(r.latitude),
    longitude: parseFloat(r.longitude),
  }));
  expect(communes.length).toBeGreaterThanOrEqual(5);
});

afterAll(async () => {
  await destroyEvents();
  await destroyWeather(communes.map((x) => x.id));
  await db.query('DELETE FROM hazard_detection_rules WHERE id = ANY($1::uuid[])', [ruleIds]);
  await db.query('DELETE FROM hazard_detection_runs WHERE created_at >= $1', [
    marker.toISOString(),
  ]);
  await db.query('DELETE FROM audit_logs WHERE user_id IN ($1, $2)', [admin.id, client.id]);
  await db.query('DELETE FROM user_sessions WHERE user_id IN ($1, $2)', [admin.id, client.id]);
  await db.query('DELETE FROM users WHERE id IN ($1, $2)', [admin.id, client.id]);
});

describe('Détection automatique - authentification et rôles (HTTP)', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const run = await request(app).post('/api/v1/detection/run').send({ scope: 'ALL' });
    expect(run.status).toBe(401);
    const runs = await request(app).get('/api/v1/detection/runs');
    expect(runs.status).toBe(401);
  });

  it('interdit le déclenchement et le monitoring à un CLIENT (403)', async () => {
    const run = await request(app)
      .post('/api/v1/detection/run')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ scope: 'ALL' });
    expect(run.status).toBe(403);
    const runs = await request(app)
      .get('/api/v1/detection/runs')
      .set('Authorization', `Bearer ${client.token}`);
    expect(runs.status).toBe(403);
  });

  it('un ADMIN peut déclencher et lister les exécutions (200)', async () => {
    const run = await request(app)
      .post('/api/v1/detection/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scope: 'ALL' });
    expect(run.status).toBe(200);
    expect(run.body.data.started).toBe(true);
    expect(run.body.data.status).toBe('SUCCESS');

    const runs = await request(app)
      .get('/api/v1/detection/runs')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(runs.status).toBe(200);
    expect(Array.isArray(runs.body.data)).toBe(true);
  });

  it('rejette un périmètre inconnu (422)', async () => {
    const res = await request(app)
      .post('/api/v1/detection/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scope: 'ONDE_DE_CHALEUR' });
    expect(res.status).toBe(422);
  });

  it('chronologie : 401 sans jeton, 404 événement inconnu', async () => {
    const missing = await request(app).get(
      `/api/v1/events/00000000-0000-4000-8000-000000000000/history`,
    );
    expect(missing.status).toBe(401);
    const authed = await request(app)
      .get(`/api/v1/events/00000000-0000-4000-8000-000000000000/history`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(authed.status).toBe(404);
  });
});

describe('Détection automatique - prévision > seuil crée un événement PREVISION', () => {
  let now: Date;

  it('crée un PREVISION depuis une prévision, avec historique, snapshot et run', async () => {
    const cf = communes[0];
    await cleanScenario([cf.id]);
    await insertRule({
      hazard: 'FORTE_PLUIE',
      metric: 'precipitation',
      operator: 'GE',
      threshold: 15,
      horizonHours: 24,
      communeId: cf.id,
    });
    now = new Date();
    await insertForecast(cf, {
      forecastDay: dayFromNow(now, 24),
      precipitationSumMm: 60,
    });

    const result = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'FORECASTS',
      now,
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.detections).toBeGreaterThanOrEqual(1);
    expect(result.eventsCreated).toBe(1);

    const event = await findEventByKey(`FORTE_PLUIE:${cf.id}`);
    expect(event).not.toBeNull();
    expect(event!.status).toBe('PREVISION');
    eventIds.push(event!.id);

    const history = await eventStatusHistory(event!.id);
    expect(history).toContainEqual({
      from_status: null,
      to_status: 'PREVISION',
    });
    expect(await snapshotCount(event!.id)).toBeGreaterThanOrEqual(1);
    const run = await latestRun();
    expect(run.status).toBe('SUCCESS');

    await destroyEvents();
    await destroyWeather([cf.id]);
  });
});

describe('Détection automatique - promotion PREVISION vers ACTIF sur observation réelle', () => {
  let now: Date;
  let eventId: string;

  it('bascule le PREVISION existant en ACTIF en conservant l historique', async () => {
    const cf = communes[0];
    await cleanScenario([cf.id]);
    await insertRule({
      hazard: 'FORTE_PLUIE',
      metric: 'precipitation',
      operator: 'GE',
      threshold: 15,
      horizonHours: 24,
      communeId: cf.id,
    });
    await insertRule({
      hazard: 'FORTE_PLUIE',
      metric: 'precipitation',
      operator: 'GE',
      threshold: 20,
      communeId: cf.id,
    });
    now = new Date();
    await insertForecast(cf, { forecastDay: dayFromNow(now, 24), precipitationSumMm: 60 });
    await insertObservation(cf, {
      observedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
      precipitationMm: 30,
    });

    const pre = await hazardDetectionService.run({ trigger: 'MANUAL', scope: 'FORECASTS', now });
    expect(pre.eventsCreated).toBe(1);
    const before = (await findEventByKey(`FORTE_PLUIE:${cf.id}`))!;
    expect(before.status).toBe('PREVISION');

    const post = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(post.status).toBe('SUCCESS');
    expect(post.eventsCreated).toBe(0);
    expect(post.eventsUpdated).toBe(1);

    const after = (await findEventByKey(`FORTE_PLUIE:${cf.id}`))!;
    expect(after.id).toBe(before.id);
    expect(after.status).toBe('ACTIF');
    eventId = after.id;
    eventIds.push(eventId);

    const history = await eventStatusHistory(eventId);
    expect(history).toContainEqual({
      from_status: 'PREVISION',
      to_status: 'ACTIF',
    });
    expect(await snapshotCount(eventId)).toBeGreaterThanOrEqual(2);

    await destroyEvents();
    await destroyWeather([cf.id]);
  });
});

describe('Détection automatique - création ACTIF directe depuis une observation', () => {
  let now: Date;

  it('crée un ACTIF quand une observation confirme l aléa', async () => {
    const cv = communes[1];
    await cleanScenario([cv.id]);
    await insertRule({
      hazard: 'VENT_VIOLENT',
      metric: 'wind_speed_10m',
      operator: 'GE',
      threshold: 50,
      communeId: cv.id,
    });
    now = new Date();
    await runVentScenario(now);

    const result = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(result.eventsCreated).toBe(1);
    const event = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(event.status).toBe('ACTIF');
    eventIds.push(event.id);

    const history = await eventStatusHistory(event.id);
    expect(history).toContainEqual({ from_status: null, to_status: 'ACTIF' });

    await destroyEvents();
    await destroyWeather([cv.id]);
  });
});

describe('Détection automatique - pas de doublon et mise à jour de l événement existant', () => {
  let now: Date;

  it('ne crée jamais un second événement pour la même clé et actualise le plus récent', async () => {
    const cv = communes[1];
    await cleanScenario([cv.id]);
    await insertRule({
      hazard: 'VENT_VIOLENT',
      metric: 'wind_speed_10m',
      operator: 'GE',
      threshold: 50,
      communeId: cv.id,
    });
    now = new Date();
    const observedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
    await insertObservation(cv, { observedAt, windSpeedKmh: 60 });

    const first = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    const event = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(first.eventsCreated).toBe(1);

    const second = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(second.eventsCreated).toBe(0);
    expect(second.eventsUpdated).toBe(1);
    expect((await findEventByKey(`VENT_VIOLENT:${cv.id}`))!.id).toBe(event.id);

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM event_detection_keys k
       JOIN hazard_events e ON e.id = k.event_id
       WHERE k.detection_key = $1 AND e.type = 'VENT_VIOLENT'`,
      [`VENT_VIOLENT:${cv.id}`],
    );
    expect(parseInt(count.rows[0].n, 10)).toBe(1);

    await insertObservation(cv, { observedAt, windSpeedKmh: 90 });
    const third = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(third.eventsCreated).toBe(0);
    expect(third.eventsUpdated).toBe(1);
    const updated = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(updated.id).toBe(event.id);

    eventIds.push(event.id);
    await destroyEvents();
    await destroyWeather([cv.id]);
  });
});

describe('Détection automatique - réexécution idempotente', () => {
  let now: Date;

  it('deux exécutions successives ne dupliquent rien', async () => {
    const cv = communes[1];
    await cleanScenario([cv.id]);
    await insertRule({
      hazard: 'VENT_VIOLENT',
      metric: 'wind_speed_10m',
      operator: 'GE',
      threshold: 50,
      communeId: cv.id,
    });
    now = new Date();
    await insertObservation(cv, {
      observedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
      windSpeedKmh: 70,
    });

    await hazardDetectionService.run({ trigger: 'MANUAL', scope: 'OBSERVATIONS', now });
    const before = await findEventByKey(`VENT_VIOLENT:${cv.id}`);
    await hazardDetectionService.run({ trigger: 'MANUAL', scope: 'OBSERVATIONS', now });
    const after = await findEventByKey(`VENT_VIOLENT:${cv.id}`);
    expect(after!.id).toBe(before!.id);

    const events = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM hazard_events e
       JOIN event_detection_keys k ON k.event_id = e.id
       WHERE k.detection_key = $1`,
      [`VENT_VIOLENT:${cv.id}`],
    );
    expect(parseInt(events.rows[0].n, 10)).toBe(1);

    const runs = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM hazard_detection_runs WHERE created_at >= $1`,
      [marker.toISOString()],
    );
    expect(parseInt(runs.rows[0].n, 10)).toBeGreaterThanOrEqual(2);

    eventIds.push(before!.id);
    await destroyEvents();
    await destroyWeather([cv.id]);
  });
});

describe('Détection automatique - danger décroissant : ACTIF vers SUIVI puis CLOTURE', () => {
  let now: Date;
  let eventId: string;

  it('passe en SUIVI après les cycles normaux configurés, puis CLOTURE après la période', async () => {
    const cv = communes[1];
    await cleanScenario([cv.id]);
    await insertRule({
      hazard: 'VENT_VIOLENT',
      metric: 'wind_speed_10m',
      operator: 'GE',
      threshold: 50,
      communeId: cv.id,
    });
    now = new Date();
    await insertObservation(cv, {
      observedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
      windSpeedKmh: 60,
    });

    await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
      normalCyclesBeforeMonitoring: 1,
      monitoringHours: 1,
    });
    const created = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(created.status).toBe('ACTIF');
    eventId = created.id;
    eventIds.push(eventId);

    await destroyWeather([cv.id]);

    const now2 = new Date(now.getTime() + 10 * 60_000);
    await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now: now2,
      normalCyclesBeforeMonitoring: 1,
      monitoringHours: 1,
    });
    const suivEvent = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(suivEvent.status).toBe('SUIVI');
    const history2 = await eventStatusHistory(eventId);
    expect(history2).toContainEqual({ from_status: 'ACTIF', to_status: 'SUIVI' });
    expect(suivEvent.status).toBe('SUIVI');

    const now3 = new Date(now2.getTime() + 2 * 3600_000);
    await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now: now3,
      normalCyclesBeforeMonitoring: 1,
      monitoringHours: 1,
    });
    const closed = (await findEventByKey(`VENT_VIOLENT:${cv.id}`))!;
    expect(closed.status).toBe('CLOTURE');
    const history3 = await eventStatusHistory(eventId);
    expect(history3).toContainEqual({ from_status: 'SUIVI', to_status: 'CLOTURE' });

    const ended = await db.query<{ ended_at: string | null }>(
      `SELECT ended_at FROM hazard_events WHERE id = $1`,
      [eventId],
    );
    expect(ended.rows[0].ended_at).not.toBeNull();

    const monitoring = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM event_monitoring WHERE event_id = $1`,
      [eventId],
    );
    expect(parseInt(monitoring.rows[0].n, 10)).toBe(0);

    await destroyEvents();
  });
});

describe('Détection automatique - absence de données et règle inactive', () => {
  let now: Date;

  it('aucune donnée : aucun événement, run SUCCESS sans détection', async () => {
    await cleanScenario([communes[1].id]);
    now = new Date();
    const result = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.detections).toBe(0);
    expect(result.eventsCreated).toBe(0);
    expect(await findEventByKey(`VENT_VIOLENT:${communes[1].id}`)).toBeNull();
  });

  it('une règle inactive n est pas évaluée', async () => {
    const ci2 = communes[4];
    await cleanScenario([ci2.id]);
    await insertRule({
      hazard: 'FORTE_PLUIE',
      metric: 'precipitation',
      operator: 'GT',
      threshold: 10,
      communeId: ci2.id,
      isActive: false,
    });
    now = new Date();
    await insertObservation(ci2, {
      observedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
      precipitationMm: 40,
    });
    const result = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.rulesTriggered).toBe(0);
    expect(result.eventsCreated).toBe(0);
    expect(await findEventByKey(`FORTE_PLUIE:${ci2.id}`)).toBeNull();

    await destroyWeather([ci2.id]);
  });
});

describe('Détection automatique - cyclone jamais confirmé par le vent seul', () => {
  let now: Date;

  it('vent seul crée un PREVISION, vent + pression bascule en ACTIF', async () => {
    const cc = communes[3];
    await cleanScenario([cc.id]);
    await insertRule({
      hazard: 'CYCLONE',
      metric: 'wind_speed_10m',
      operator: 'GE',
      threshold: 45,
      communeId: cc.id,
    });
    await insertRule({
      hazard: 'CYCLONE',
      metric: 'pressure',
      operator: 'LE',
      threshold: 1000,
      communeId: cc.id,
    });

    now = new Date();
    const observedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
    await insertObservation(cc, { observedAt, windSpeedKmh: 60 });

    const windOnly = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(windOnly.eventsCreated).toBe(1);
    const windEvent = (await findEventByKey(`CYCLONE:${cc.id}`))!;
    expect(windEvent.status).toBe('PREVISION');
    eventIds.push(windEvent.id);

    await insertObservation(cc, { observedAt, pressureHpa: 980 });
    const withPressure = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(withPressure.eventsCreated).toBe(0);
    expect(withPressure.eventsUpdated).toBe(1);
    const confirmed = (await findEventByKey(`CYCLONE:${cc.id}`))!;
    expect(confirmed.id).toBe(windEvent.id);
    expect(confirmed.status).toBe('ACTIF');

    await destroyEvents();
    await destroyWeather([cc.id]);
  });
});

describe('Détection automatique - inondation jamais confirmée par la pluie seule', () => {
  let now: Date;

  it('pluie seule crée un PREVISION, deux métriques pluie confirment l ACTIF', async () => {
    const ci = communes[2];
    await cleanScenario([ci.id]);
    await insertRule({
      hazard: 'INONDATION',
      metric: 'precipitation',
      operator: 'GT',
      threshold: 20,
      communeId: ci.id,
    });

    now = new Date();
    const observedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
    await insertObservation(ci, { observedAt, precipitationMm: 30 });

    const rainOnly = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(rainOnly.eventsCreated).toBe(1);
    const prev = (await findEventByKey(`INONDATION:${ci.id}`))!;
    expect(prev.status).toBe('PREVISION');
    eventIds.push(prev.id);

    await insertRule({
      hazard: 'INONDATION',
      metric: 'rainfall_24h',
      operator: 'GT',
      threshold: 40,
      communeId: ci.id,
    });
    await insertObservation(ci, { observedAt, rainfall24hMm: 60 });

    const confirmed = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: 'OBSERVATIONS',
      now,
    });
    expect(confirmed.eventsCreated).toBe(0);
    expect(confirmed.eventsUpdated).toBe(1);
    const actif = (await findEventByKey(`INONDATION:${ci.id}`))!;
    expect(actif.id).toBe(prev.id);
    expect(actif.status).toBe('ACTIF');

    await destroyEvents();
    await destroyWeather([ci.id]);
  });
});
