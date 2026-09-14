import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';
import { AppError } from '../../src/utils/app-error';
import { weatherService } from '../../src/services/weather.service';
import { weatherSyncService } from '../../src/services/weather-sync.service';
import {
  WeatherCurrent,
  WeatherCurrentBatchItem,
  WeatherForecast,
  WeatherForecastDailyItem,
  WeatherProvider,
  BatchCommuneInput,
} from '../../src/types/weather.types';
import { env } from '../../src/config/env';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const FIXED_STAMP = `${new Date().toISOString().slice(0, 10)}T09:00:00.000Z`;

function distinctStamp(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return d.toISOString();
}
const FORECAST_DAYS = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];

class SyncMockProvider implements WeatherProvider {
  observedAt = FIXED_STAMP;
  delayMs = 0;
  currentError: Error | null = null;
  forecastError: Error | null = null;
  respondIds: Set<string> | null = null;
  missingData = false;
  invalidResponse = false;
  currentBatchCalls = 0;
  forecastBatchCalls = 0;
  currentCalls = 0;
  forecastCalls = 0;

  private goodCurrent(observedAt: string): WeatherCurrent {
    return {
      observedAt,
      temperatureC: 28.5,
      humidityPercent: 82,
      precipitationMm: 12,
      rainfall24hMm: 30,
      windSpeedKmh: 45,
      windGustsKmh: 65,
      windDirectionDeg: 90,
      pressureHpa: 1010,
      weatherCode: '61',
    };
  }

  private emptyCurrent(observedAt: string): WeatherCurrent {
    return {
      observedAt,
      temperatureC: null,
      humidityPercent: null,
      precipitationMm: null,
      rainfall24hMm: null,
      windSpeedKmh: null,
      windGustsKmh: null,
      windDirectionDeg: null,
      pressureHpa: null,
      weatherCode: null,
    };
  }

  async getCurrent(_latitude: number, _longitude: number): Promise<WeatherCurrent> {
    this.currentCalls += 1;
    if (this.currentError) throw this.currentError;
    return this.missingData
      ? this.emptyCurrent(this.observedAt)
      : this.goodCurrent(this.observedAt);
  }

  async getCurrentBatch(communes: BatchCommuneInput[]): Promise<WeatherCurrentBatchItem[]> {
    this.currentBatchCalls += 1;
    if (this.currentError) throw this.currentError;
    if (this.invalidResponse) return null as unknown as WeatherCurrentBatchItem[];
    if (this.delayMs) await sleep(this.delayMs);
    const respond = this.respondIds;
    const list = respond ? communes.filter((c) => respond.has(c.id)) : communes;
    return list.map((c) => ({
      communeId: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      current: this.missingData
        ? this.emptyCurrent(this.observedAt)
        : this.goodCurrent(this.observedAt),
    }));
  }

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
    this.forecastCalls += 1;
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      latitude,
      longitude,
      current: this.goodCurrent(this.observedAt),
      hourly: {
        time: [],
        temperatureC: [],
        humidityPercent: [],
        precipitationMm: [],
        rainMm: [],
        windSpeedKmh: [],
        windDirectionDeg: [],
        surfacePressureHpa: [],
        weatherCode: [],
      },
    };
  }

  async getForecastDailyBatch(communes: BatchCommuneInput[]): Promise<WeatherForecastDailyItem[]> {
    this.forecastBatchCalls += 1;
    if (this.forecastError) throw this.forecastError;
    if (this.delayMs) await sleep(this.delayMs);
    const respond = this.respondIds;
    const list = respond ? communes.filter((c) => respond.has(c.id)) : communes;
    return list.map((c) => ({
      communeId: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      days: FORECAST_DAYS.map((day, i) => ({
        day,
        temperatureMinC: 20 + i,
        temperatureMaxC: 30 + i,
        relativeHumidityAvg: 80,
        precipitationSumMm: 25,
        windSpeedMaxKmh: 55,
        windGustsMaxKmh: 75,
        windDirectionDeg: 120,
        pressureAvgHpa: 1005,
        weatherCode: '80',
      })),
    }));
  }
}

let admin: { id: string; token: string };
let client: { id: string; token: string };

let communeIds: string[];
const marker = new Date();

const mock = new SyncMockProvider();

function makeEmail(role: string): string {
  return `wxs_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: 'ADMIN' | 'SUPER_ADMIN' | 'CLIENT'): Promise<{
  id: string;
  token: string;
}> {
  const email = makeEmail(role);
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: role,
    lastName: 'SyncTester',
    role,
  });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Passw0rd!' });
  return { id: user.id, token: login.body.data.accessToken };
}

async function countRuns(scope: string): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM weather_sync_runs
     WHERE scope = $1 AND source = 'OPEN_METEO' AND created_at >= $2`,
    [scope, marker.toISOString()],
  );
  return parseInt(r.rows[0].n, 10);
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  client = await createUserAndLogin('CLIENT');
  weatherService.setProvider(mock);

  const c = await db.query<{ id: string }>(
    `SELECT c.id
     FROM communes c
     JOIN districts d ON d.id = c.district_id
     WHERE d.normalized_name = 'MAROANTSETRA'
     ORDER BY c.name
     LIMIT 2`,
  );
  communeIds = c.rows.map((r) => r.id);
  expect(communeIds.length).toBeGreaterThanOrEqual(2);
});

afterAll(async () => {
  await db.query(`DELETE FROM weather_observations WHERE commune_id = ANY($1::uuid[])`, [
    communeIds,
  ]);
  await db.query(`DELETE FROM weather_forecasts WHERE commune_id = ANY($1::uuid[])`, [communeIds]);
  await db.query(`DELETE FROM weather_sync_runs WHERE created_at >= $1`, [marker.toISOString()]);
  await db.query(`DELETE FROM provider_errors WHERE occurred_at >= $1`, [marker.toISOString()]);
  await db.query(`DELETE FROM audit_logs WHERE user_id IN ($1, $2)`, [admin.id, client.id]);
  await db.query(`DELETE FROM user_sessions WHERE user_id IN ($1, $2)`, [admin.id, client.id]);
  await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [admin.id, client.id]);
  await db.pool.end();
});

describe('Synchronisation météo - authentification et rôles (HTTP)', () => {
  it('refuse un accès non authentifié', async () => {
    const run = await request(app).post('/api/v1/weather/sync/run').send({ scope: 'OBSERVATIONS' });
    expect(run.status).toBe(401);
    const monitoring = await request(app).get('/api/v1/weather/monitoring');
    expect(monitoring.status).toBe(401);
  });

  it('interdit le déclenchement à un CLIENT (403) mais autorise le monitoring', async () => {
    const run = await request(app)
      .post('/api/v1/weather/sync/run')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ scope: 'OBSERVATIONS' });
    expect(run.status).toBe(403);

    const monitoring = await request(app)
      .get('/api/v1/weather/monitoring')
      .set('Authorization', `Bearer ${client.token}`);
    expect(monitoring.status).toBe(200);
  });

  it('rejette un périmètre inconnu (422)', async () => {
    const res = await request(app)
      .post('/api/v1/weather/sync/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scope: 'INONDATIONS' });
    expect(res.status).toBe(422);
  });
});

describe('Synchronisation météo - succès', () => {
  it('synchronise les observations en un seul lot et stocke rafales et nature OBSERVE', async () => {
    mock.currentError = null;
    mock.respondIds = null;
    mock.currentBatchCalls = 0;
    mock.currentCalls = 0;

    const result = await weatherSyncService.trigger({
      scope: 'OBSERVATIONS',
      communeIds,
    });

    expect(result.started).toBe(true);
    expect(result.joinedExisting).toBe(false);
    expect(result.runs[0].status).toBe('SUCCESS');
    expect(mock.currentBatchCalls).toBe(1);
    expect(mock.currentCalls).toBe(0);

    const rows = await db.query<{ n: string; gust: string | null }>(
      `SELECT COUNT(*)::text AS n,
              MAX(wind_gusts_kmh)::text AS gust
       FROM weather_observations
       WHERE commune_id = ANY($1::uuid[]) AND observed_at = $2`,
      [communeIds, FIXED_STAMP],
    );
    expect(rows.rows[0].n).toBe(String(communeIds.length));
    expect(Number(rows.rows[0].gust)).toBe(65);

    const kinds = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_observations WHERE data_kind = 'OBSERVE' AND commune_id = ANY($1::uuid[])`,
      [communeIds],
    );
    expect(parseInt(kinds.rows[0].n, 10)).toBeGreaterThanOrEqual(communeIds.length);
  });

  it('synchronise les prévisions quotidiennes en batch (PREVU)', async () => {
    mock.forecastError = null;
    mock.forecastBatchCalls = 0;
    mock.forecastCalls = 0;

    const result = await weatherSyncService.trigger({ scope: 'FORECASTS', communeIds });
    expect(result.status).toBe('SUCCESS');
    expect(mock.forecastBatchCalls).toBe(1);
    expect(mock.forecastCalls).toBe(0);

    const rows = await db.query<{ n: string; gust: string | null }>(
      `SELECT COUNT(*)::text AS n, MAX(wind_gusts_max_kmh)::text AS gust
       FROM weather_forecasts
       WHERE commune_id = ANY($1::uuid[])`,
      [communeIds],
    );
    expect(rows.rows[0].n).toBe(String(communeIds.length * FORECAST_DAYS.length));
    expect(Number(rows.rows[0].gust)).toBe(75);

    const kinds = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_forecasts WHERE data_kind = 'PREVU' AND commune_id = ANY($1::uuid[])`,
      [communeIds],
    );
    expect(parseInt(kinds.rows[0].n, 10)).toBe(communeIds.length * FORECAST_DAYS.length);
  });
});

describe('Synchronisation météo - réponses fournisseur dégradées', () => {
  it('réponse fournisseur invalide : run FAILED, erreur journalisée, aucune donnée écrite', async () => {
    mock.currentError = null;
    mock.respondIds = null;
    mock.invalidResponse = true;
    mock.observedAt = distinctStamp(-30);

    const result = await weatherSyncService.trigger({
      scope: 'OBSERVATIONS',
      communeIds: [communeIds[0]],
    });
    expect(result.runs[0].status).toBe('FAILED');

    const errors = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM provider_errors
       WHERE provider = 'OPEN_METEO' AND operation = 'OBSERVATIONS_SYNC' AND occurred_at >= $1`,
      [marker.toISOString()],
    );
    expect(parseInt(errors.rows[0].n, 10)).toBeGreaterThanOrEqual(1);

    const rows = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_observations
       WHERE commune_id = $1 AND observed_at = $2`,
      [communeIds[0], mock.observedAt],
    );
    expect(rows.rows[0].n).toBe('0');

    mock.invalidResponse = false;
  });

  it('rate limit (429) : run FAILED, erreur fournisseur journalisée, aucune clé exposée', async () => {
    mock.currentError = AppError.tooManyRequests('Limite de requêtes Open-Meteo atteinte');
    const result = await weatherSyncService.trigger({
      scope: 'OBSERVATIONS',
      communeIds: [communeIds[0]],
    });
    expect(result.runs[0].status).toBe('FAILED');

    const errors = await db.query<{ status_code: number | null; message: string }>(
      `SELECT status_code, message FROM provider_errors
       WHERE provider = 'OPEN_METEO' AND operation = 'OBSERVATIONS_SYNC' AND occurred_at >= $1
       ORDER BY occurred_at DESC LIMIT 1`,
      [marker.toISOString()],
    );
    expect(errors.rows[0].status_code).toBe(429);
    const serialized = JSON.stringify({ result, dbError: errors.rows[0] });
    expect(serialized).not.toContain(env.JWT_ACCESS_SECRET);
    expect(serialized).not.toContain('GEMINI_API_KEY');
  });

  it('timeout (502) : run FAILED et erreur journalisée', async () => {
    mock.currentError = new AppError('Fournisseur météo Open-Meteo indisponible', 502, true);
    const result = await weatherSyncService.trigger({
      scope: 'OBSERVATIONS',
      communeIds: [communeIds[0]],
    });
    expect(result.runs[0].status).toBe('FAILED');

    const errors = await db.query<{ status_code: number | null }>(
      `SELECT status_code FROM provider_errors
       WHERE provider = 'OPEN_METEO' AND operation = 'OBSERVATIONS_SYNC' AND occurred_at >= $1
       ORDER BY occurred_at DESC LIMIT 1`,
      [marker.toISOString()],
    );
    expect(errors.rows[0].status_code).toBe(502);
  });

  it('données météo absentes : aucun enregistrement et run terminé sans planter', async () => {
    MockProviderMode('missing');
    mock.observedAt = distinctStamp(-10);
    const result = await weatherSyncService.trigger({
      scope: 'OBSERVATIONS',
      communeIds: [communeIds[0]],
    });
    expect(result.runs[0].status).toBe('FAILED');

    const rows = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_observations
       WHERE commune_id = $1 AND observed_at = $2`,
      [communeIds[0], mock.observedAt],
    );
    expect(rows.rows[0].n).toBe('0');
  });
});

describe('Synchronisation météo - dédoublonnage et concurrence', () => {
  it('ne stocke aucune donnée en double lors d une relance', async () => {
    MockProviderMode('normal');
    mock.respondIds = null;
    mock.observedAt = FIXED_STAMP;

    await weatherSyncService.trigger({ scope: 'OBSERVATIONS', communeIds });
    const second = await weatherSyncService.trigger({ scope: 'OBSERVATIONS', communeIds });
    expect(second.runs[0].status).toBe('SUCCESS');

    const rows = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_observations
       WHERE commune_id = ANY($1::uuid[]) AND observed_at = $2`,
      [communeIds, FIXED_STAMP],
    );
    expect(rows.rows[0].n).toBe(String(communeIds.length));
  });

  it('ne relance pas une exécution déjà en cours (job relancé) et ne crée qu un seul run', async () => {
    MockProviderMode('normal');
    mock.respondIds = null;
    mock.delayMs = 250;

    const before = await countRuns('OBSERVATIONS');

    const p1 = weatherSyncService.trigger({ scope: 'OBSERVATIONS', communeIds });
    await sleep(50);
    const second = await weatherSyncService.trigger({ scope: 'OBSERVATIONS', communeIds });

    expect(second.started).toBe(false);
    expect(second.joinedExisting).toBe(true);
    expect(second.status).toBe('RUNNING');
    expect(second.runs[0].runId).toBeTruthy();

    const first = await p1;
    expect(first.status).toBe('SUCCESS');

    const after = await countRuns('OBSERVATIONS');
    expect(after).toBe(before + 1);
    mock.delayMs = 0;
  });
});

describe('Synchronisation météo - monitoring et exposition', () => {
  it('expose la source, la dernière exécution et la fraîcheur sans aucune clé API', async () => {
    MockProviderMode('normal');
    const res = await request(app)
      .get('/api/v1/weather/monitoring')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.sources.length).toBeGreaterThan(0);
    const openMeteo = data.sources.find(
      (s: { providerType: string }) => s.providerType === 'OPEN_METEO',
    );
    expect(openMeteo).toBeDefined();
    expect(openMeteo.baseUrl).toContain('open-meteo');
    expect(openMeteo.keyConfigured).toBe(false);
    expect(['FRESH', 'STALE', 'NEVER']).toContain(data.sync.observations.status);
    expect(data.sync.forecasts.lastDataAt).toBeTruthy();
    expect(data.sync.forecasts.maxForecastDay).toBe(FORECAST_DAYS[FORECAST_DAYS.length - 1]);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(env.JWT_ACCESS_SECRET);
    expect(serialized.toLowerCase()).not.toContain('api_key');
    expect(serialized.toLowerCase()).not.toContain('bearer ');
  });

  it('déclenche par HTTP en un seul batch (jamais une requête par commune)', async () => {
    MockProviderMode('normal');
    mock.currentError = null;
    mock.respondIds = new Set(communeIds);
    mock.currentBatchCalls = 0;
    mock.forecastError = null;
    mock.forecastBatchCalls = 0;

    const res = await request(app)
      .post('/api/v1/weather/sync/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scope: 'OBSERVATIONS_AND_FORECASTS' });
    expect(res.status).toBe(200);
    expect(res.body.data.started).toBe(true);
    expect(res.body.data.runs.map((r: { scope: string }) => r.scope)).toEqual([
      'OBSERVATIONS',
      'FORECASTS',
    ]);
    expect(mock.currentBatchCalls).toBe(1);
    expect(mock.forecastBatchCalls).toBe(1);
    expect(mock.currentCalls).toBe(0);
    expect(mock.forecastCalls).toBe(0);

    const obs = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM weather_observations
       WHERE commune_id = ANY($1::uuid[]) AND observed_at = $2`,
      [communeIds, FIXED_STAMP],
    );
    expect(parseInt(obs.rows[0].n, 10)).toBeGreaterThanOrEqual(communeIds.length);
  });
});

function MockProviderMode(mode: 'normal' | 'missing'): void {
  mock.currentError = null;
  mock.forecastError = null;
  mock.delayMs = 0;
  mock.missingData = mode === 'missing';
  mock.invalidResponse = false;
}
