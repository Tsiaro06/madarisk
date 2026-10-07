import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { risksRepository } from '../../src/repositories/risks.repository';
import { password } from '../../src/utils/password';
import { weatherService } from '../../src/services/weather.service';
import { WeatherProvider } from '../../src/types/weather.types';
import {
  snapshotWeather,
  restoreWeather,
  withRestoredWeather,
  type WeatherSnapshot,
} from '../helpers/weather-snapshot';

let admin: { id: string; token: string };
let superAdmin: { id: string; token: string };
let client: { id: string; token: string };

let communeId: string;
let communeLon: number;
let communeLat: number;
let secondCommuneId: string;
let secondCommuneLon: number;
let secondCommuneLat: number;
let weatherSnapshot: WeatherSnapshot;

const mockProvider: WeatherProvider = {
  getCurrent: async () => ({
    observedAt: new Date().toISOString(),
    temperatureC: 28.5,
    humidityPercent: 82,
    precipitationMm: 120,
    rainfall24hMm: 150,
    windSpeedKmh: 110,
    windGustsKmh: 130,
    windDirectionDeg: 45,
    pressureHpa: 980,
    weatherCode: '95',
  }),
  getForecast: async (latitude: number, longitude: number) => ({
    generatedAt: new Date().toISOString(),
    timezone: 'UTC',
    latitude,
    longitude,
    current: {
      observedAt: new Date().toISOString(),
      temperatureC: 28.5,
      humidityPercent: 82,
      precipitationMm: 120,
      rainfall24hMm: 150,
      windSpeedKmh: 110,
      windGustsKmh: 130,
      windDirectionDeg: 45,
      pressureHpa: 980,
      weatherCode: '95',
    },
    hourly: {
      time: [new Date().toISOString()],
      temperatureC: [28.5],
      humidityPercent: [82],
      precipitationMm: [120],
      rainMm: [150],
      windSpeedKmh: [110],
      windDirectionDeg: [45],
      pressureHpa: [980],
      weatherCode: [95],
    },
  }),
};

function makeEmail(role: string): string {
  return `wx_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
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
    lastName: 'Tester',
    role,
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  if (login.status !== 200) {
    console.log(`[debug] login ${role} status=${login.status} body=${JSON.stringify(login.body)}`);
  }
  return { id: user.id, token: login.body.data.accessToken };
}

async function createEvent(token: string): Promise<string> {
  const body = {
    eventCode: `CY-WX-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Cyclone test risques',
    type: 'CYCLONE',
    severity: 'MODEREE',
    description: 'Événement de test pour les risques',
    sourceName: 'Météo France',
    startedAt: '2026-03-01T06:00:00.000Z',
    expectedEndAt: '2026-03-05T18:00:00.000Z',
  };
  const res = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body.data.id;
}

async function prepareEventWithExposure(
  token: string,
  point?: { latitude: number; longitude: number },
): Promise<string> {
  const lat = point?.latitude ?? communeLat;
  const lon = point?.longitude ?? communeLon;
  const eventId = await createEvent(token);

  const track = {
    observedAt: '2026-03-01T06:00:00.000Z',
    trackType: 'OBSERVEE',
    latitude: lat,
    longitude: lon,
    windSpeedKmh: 120,
    gustSpeedKmh: 150,
    pressureHpa: 960,
  };
  await request(app)
    .post(`/api/v1/events/${eventId}/tracks`)
    .set('Authorization', `Bearer ${token}`)
    .send(track);
  await request(app)
    .post(`/api/v1/events/${eventId}/tracks`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...track, observedAt: '2026-03-01T12:00:00.000Z', latitude: lat + 0.05 });

  const areaRes = await request(app)
    .post(`/api/v1/events/${eventId}/areas/calculate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 150 });
  const areaId = areaRes.body.data.areaId;

  const expRes = await request(app)
    .post(`/api/v1/events/${eventId}/exposure/calculate?areaId=${areaId}`)
    .set('Authorization', `Bearer ${token}`);
  if (expRes.status !== 200) {
    console.log(`[debug] exposure status=${expRes.status} body=${JSON.stringify(expRes.body)}`);
  }
  return eventId;
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  superAdmin = await createUserAndLogin('SUPER_ADMIN');
  client = await createUserAndLogin('CLIENT');

  weatherService.setProvider(mockProvider);

  const c = await db.query<{ id: string; lon: number; lat: number }>(
    `SELECT
       c.id,
       ST_X(c.centroid) AS lon,
       ST_Y(c.centroid) AS lat
     FROM communes c
     JOIN districts d ON d.id = c.district_id
     WHERE d.normalized_name = 'MAROANTSETRA'
     ORDER BY c.name
     LIMIT 1`,
  );
  communeId = c.rows[0].id;
  communeLon = c.rows[0].lon;
  communeLat = c.rows[0].lat;

  const c2 = await db.query<{ id: string; lon: number; lat: number }>(
    `SELECT
       c.id,
       ST_X(c.centroid) AS lon,
       ST_Y(c.centroid) AS lat
     FROM communes c
     WHERE ST_Y(c.centroid) <
       ST_Y((SELECT centroid FROM communes WHERE id = $1)) - 2
     ORDER BY ST_Y(c.centroid) DESC
     LIMIT 1`,
    [communeId],
  );
  secondCommuneId = c2.rows[0].id;
  secondCommuneLon = c2.rows[0].lon;
  secondCommuneLat = c2.rows[0].lat;
  // La base de test est celle du dev : on sauvegarde pour ne pas laisser ces
  // communes sans observations après la suite.
  weatherSnapshot = await snapshotWeather([communeId, secondCommuneId]);
});

afterAll(async () => {
  await restoreWeather(weatherSnapshot);
  await db.query(`DELETE FROM risk_assessments WHERE commune_id = ANY($1::uuid[])`, [
    [communeId, secondCommuneId],
  ]);
  await db.query(`DELETE FROM risk_configurations WHERE name LIKE 'wx-%'`);
  // Les brouillons « Risque extrême détecté » créés par le recalcul doivent
  // partir avant les événements : alerts.event_id est ON DELETE SET NULL.
  await db.query(
    `DELETE FROM alerts WHERE event_id IN (
      SELECT id FROM hazard_events WHERE created_by IN ($1, $2, $3))`,
    [admin.id, superAdmin.id, client.id],
  );
  await db.query(`DELETE FROM hazard_events WHERE created_by IN ($1, $2, $3)`, [
    admin.id,
    superAdmin.id,
    client.id,
  ]);
  await db.query(`DELETE FROM user_sessions WHERE user_id IN ($1, $2, $3)`, [
    admin.id,
    superAdmin.id,
    client.id,
  ]);
  await db.query(`DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3)`, [
    admin.id,
    superAdmin.id,
    client.id,
  ]);
  await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [
    admin.id,
    superAdmin.id,
    client.id,
  ]);
  await db.pool.end();
});

describe('Météo - authentification et rôles', () => {
  it('refuse un accès non authentifié', async () => {
    const res = await request(app).get('/api/v1/weather/map-layer');
    expect(res.status).toBe(401);

    const post = await request(app)
      .post('/api/v1/weather/refresh/communes')
      .send({ confirmAll: true });
    expect(post.status).toBe(401);
  });

  it('interdit le rafraîchissement à un CLIENT (403)', async () => {
    const res = await request(app)
      .post('/api/v1/weather/refresh/communes')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ communeIds: [communeId] });
    expect(res.status).toBe(403);
  });

  it('interdit l’ingestion DGM à un CLIENT (403)', async () => {
    const res = await request(app)
      .post('/api/v1/weather/ingest/dgm-maproom')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(403);
  });

  it('rejette un refresh sans filtre ni confirmAll (422)', async () => {
    const res = await request(app)
      .post('/api/v1/weather/refresh/communes')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('Météo - endpoints données', () => {
  it('rafraîchit les observations d une commune', async () => {
    const res = await request(app)
      .post('/api/v1/weather/refresh/communes')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ communeIds: [communeId] });
    // Un refresh ciblé reste synchrone : `background: false` signale que le
    // bilan est déjà dans la réponse, là où un run national répond 202 avec un
    // identifiant à suivre.
    expect(res.status).toBe(200);
    expect(res.body.data.background).toBe(false);
    expect(res.body.data.state.status).toBe('SUCCESS');
    const result = res.body.data.state.result;
    expect(result.totalTargeted).toBe(1);
    expect(result.totalSaved).toBe(1);
    expect(result.totalFailed).toBe(0);
  });

  it('renvoie la dernière observation avec les valeurs Open-Meteo', async () => {
    const res = await request(app)
      .get(`/api/v1/weather/communes/${communeId}/latest`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.communeId).toBe(communeId);
    expect(res.body.data.precipitationMm).toBe(120);
    expect(res.body.data.rainfall24hMm).toBe(150);
    expect(res.body.data.windSpeedKmh).toBe(110);
    expect(res.body.data.weatherCode).toBe('95');
  });

  it('renvoie une prévision horaire', async () => {
    const res = await request(app)
      .get(`/api/v1/weather/communes/${communeId}/forecast`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.hourly.time)).toBe(true);
    expect(res.body.data.hourly.time.length).toBeGreaterThan(0);
    expect(res.body.data.current.temperatureC).toBe(28.5);
  });

  it('renvoie un historique paginé', async () => {
    // La base de test est celle du dev : la commune porte déjà des observations
    // réelles (ingestion DGM, runs Open-Meteo), et un nouveau run en ajoute à
    // chaque exécution. On ne peut donc pas figer un nombre de lignes : ce
    // second rafraîchissement garantit au moins deux observations, et le test
    // vérifie l'enveloppe de pagination et le tri antichronologique.
    const refresh = await request(app)
      .post('/api/v1/weather/refresh/communes')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ communeIds: [communeId] });
    expect(refresh.status).toBe(200);

    const first = await request(app)
      .get(`/api/v1/weather/communes/${communeId}/history?limit=1&page=1`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(first.status).toBe(200);
    expect(Array.isArray(first.body.data)).toBe(true);
    expect(first.body.data.length).toBe(1);
    expect(first.body.meta.page).toBe(1);
    expect(first.body.meta.limit).toBe(1);
    expect(first.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(first.body.meta.totalPages).toBe(first.body.meta.total);
    // Le plus récent d'abord, avec les valeurs du fournisseur simulé.
    expect(first.body.data[0].windSpeedKmh).toBe(110);

    const second = await request(app)
      .get(`/api/v1/weather/communes/${communeId}/history?limit=1&page=2`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.length).toBe(1);
    expect(second.body.meta.total).toBe(first.body.meta.total);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(second.body.data[0].observedAt < first.body.data[0].observedAt).toBe(true);
  });

  it('renvoie une couche cartographique en GeoJSON', async () => {
    const res = await request(app)
      .get('/api/v1/weather/map-layer')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    expect(res.body.data.features.length).toBeGreaterThan(0);
    const mine = res.body.data.features.find(
      (f: { properties: { communeId: string } }) => f.properties.communeId === communeId,
    );
    expect(mine).toBeDefined();
    expect(mine.geometry.type).toBe('Point');
  });

  it('accepte metric, date et hour et retourne meta.latestObservationAt', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/weather/map-layer?metric=precipitation&date=${yesterday}&hour=8`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    expect(typeof res.body.meta.latestObservationAt).toBe('string');
    expect(new Date(res.body.meta.latestObservationAt)).toBeInstanceOf(Date);
  });

  it('rejette une métrique inconnue (422)', async () => {
    const res = await request(app)
      .get('/api/v1/weather/map-layer?metric=pluie')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(422);
  });

  it('rejette hour sans date (422)', async () => {
    const res = await request(app)
      .get('/api/v1/weather/map-layer?hour=12')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(422);
  });
});

describe('Risques - recalcul lié à un événement', () => {
  let eventId: string;
  let communeRisk: number;

  it('recalcule les risques exposant scores, niveau et explication', async () => {
    eventId = await prepareEventWithExposure(admin.token);

    const res = await request(app)
      .post(`/api/v1/events/${eventId}/risks/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ phase: 'PENDANT' });
    expect(res.status).toBe(200);
    expect(res.body.data.phase).toBe('PENDANT');
    expect(res.body.data.totalCommunes).toBeGreaterThan(0);

    const mine = res.body.data.assessments.find(
      (a: { communeId: string }) => a.communeId === communeId,
    );
    expect(mine).toBeDefined();
    communeRisk = mine.riskScore;

    expect(mine.factors.rainScore).toBe(100);
    expect(mine.factors.windScore).toBe(100);
    expect(mine.factors.proximityScore).toBe(100);
    expect(mine.riskScore).toBeGreaterThanOrEqual(80);
    expect(mine.riskLevel).toBe('EXTREME');
    expect(mine.displayLevel).toBe('EXTRÊME');
    expect(mine.color).toBe('#DC2626');
    expect(Array.isArray(mine.explanation)).toBe(true);
    expect(mine.explanation.length).toBeGreaterThan(0);
    expect(mine.explanation.join(' ')).toContain('seuil critique');
    expect(mine.assessedAt).toBeDefined();
  });

  it('expose la dernière évaluation de la commune', async () => {
    const res = await request(app)
      .get(`/api/v1/risks/communes/${communeId}?latest=true`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.riskScore).toBe(communeRisk);
    expect(res.body.data.riskLevel).toBe('EXTREME');
    expect(res.body.data.displayLevel).toBe('EXTRÊME');
    expect(res.body.data.color).toBe('#DC2626');
    expect(res.body.data.factors).toBeDefined();
    expect(res.body.data.explanation).toBeDefined();
  });

  it('fournit un historique paginé des évaluations', async () => {
    const res = await request(app)
      .get(`/api/v1/risks/communes/${communeId}?latest=false`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('calcule une couche cartographique enrichie avec présentation', async () => {
    const res = await request(app)
      .get(`/api/v1/risks/map-layer?eventId=${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    const mine = res.body.data.features.find(
      (f: { properties: { communeId: string } }) => f.properties.communeId === communeId,
    );
    expect(mine).toBeDefined();
    expect(mine.type).toBe('Feature');
    expect(typeof mine.properties.riskScore).toBe('number');
    expect(mine.properties.displayLevel).toBeDefined();
    expect(mine.properties.color).toBeDefined();
    expect(Array.isArray(mine.properties.explanation)).toBe(true);
    expect(['Polygon', 'MultiPolygon']).toContain(mine.geometry.type);
  });

  it('classe les communes par priorité décroissante', async () => {
    const res = await request(app)
      .get(`/api/v1/risks/priority-communes?eventId=${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const scores: number[] = res.body.data.map((r: { riskScore: number }) => r.riskScore);
    expect(scores[0]).toBe(Math.max(...scores));
    expect(res.body.data[0].displayLevel).toBeDefined();
    expect(res.body.data[0].color).toBeDefined();
  });

  it('rejette un recalcul sans phase', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/risks/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('Risques - recalcul automatique', () => {
  it('recalcule automatiquement les risques dès la création de la zone', async () => {
    const eventId = await prepareEventWithExposure(admin.token);

    const res = await request(app)
      .get(`/api/v1/risks/communes/${communeId}?latest=true&eventId=${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.eventId).toBe(eventId);
    expect(res.body.data.phase).toBe('PENDANT');
    expect(typeof res.body.data.riskScore).toBe('number');
    expect(res.body.data.factors).toBeDefined();
  });

  it('recalcule automatiquement les risques quand la sévérité change', async () => {
    const eventId = await prepareEventWithExposure(admin.token);
    const before = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM risk_assessments WHERE event_id = $1`,
      [eventId],
    );

    const res = await request(app)
      .patch(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ severity: 'EXTREME' });
    expect(res.status).toBe(200);
    expect(res.body.data.severity).toBe('EXTREME');

    const after = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM risk_assessments WHERE event_id = $1`,
      [eventId],
    );
    expect(parseInt(after.rows[0].n, 10)).toBeGreaterThan(parseInt(before.rows[0].n, 10));
  });
});

describe('Risques - couche carto scopée par événement', () => {
  it('chaque événement n expose que ses propres communes : changer d événement fait disparaître les communes du précédent', async () => {
    const eventA = await prepareEventWithExposure(admin.token);
    const eventB = await prepareEventWithExposure(admin.token, {
      latitude: secondCommuneLat,
      longitude: secondCommuneLon,
    });

    const resA = await request(app)
      .get(`/api/v1/risks/map-layer?eventId=${eventA}`)
      .set('Authorization', `Bearer ${admin.token}`);
    const resB = await request(app)
      .get(`/api/v1/risks/map-layer?eventId=${eventB}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const idsA = resA.body.data.features.map(
      (f: { properties: { communeId: string } }) => f.properties.communeId,
    );
    const idsB = resB.body.data.features.map(
      (f: { properties: { communeId: string } }) => f.properties.communeId,
    );

    expect(idsA).toContain(communeId);
    expect(idsB).toContain(secondCommuneId);
    expect(idsA).not.toContain(secondCommuneId);
    expect(idsB).not.toContain(communeId);
  });
});

describe('Risques - recalcul sans événement et configurations', () => {
  it('recalcule par communes sans événement avec proximité neutre', async () => {
    const res = await request(app)
      .post('/api/v1/risks/recalculate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ phase: 'APRES', communeIds: [communeId] });
    expect(res.status).toBe(200);
    expect(res.body.data.totalCommunes).toBe(1);
    const mine = res.body.data.assessments[0];
    expect(mine.communeId).toBe(communeId);
    expect(mine.phase).toBe('APRES');
    expect(mine.factors.proximityScore).toBe(50);
  });

  it('rejette un recalcul sans filtre (422)', async () => {
    const res = await request(app)
      .post('/api/v1/risks/recalculate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ phase: 'PENDANT' });
    expect(res.status).toBe(422);
  });

  it('liste les configurations pour tout utilisateur authentifié', async () => {
    const res = await request(app)
      .get('/api/v1/risk-configurations')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].rainWeight).toBeDefined();
    const detail = await request(app)
      .get(`/api/v1/risk-configurations/${res.body.data[0].id}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(res.body.data[0].id);
  });

  it('refuse la création de configuration à un ADMIN (403)', async () => {
    const res = await request(app)
      .post('/api/v1/risk-configurations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `wx-admin-${Date.now()}`,
        rainWeight: 0.3,
        windWeight: 0.25,
        proximityWeight: 0.2,
        vulnerabilityWeight: 0.15,
        exposureWeight: 0.1,
      });
    expect(res.status).toBe(403);
  });

  it('rejette des poids dont la somme diffère de 1 (422)', async () => {
    const res = await request(app)
      .post('/api/v1/risk-configurations')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        name: `wx-invalid-${Date.now()}`,
        rainWeight: 0.8,
        windWeight: 0.1,
        proximityWeight: 0.1,
        vulnerabilityWeight: 0.1,
        exposureWeight: 0.1,
      });
    expect(res.status).toBe(422);
  });

  it('crée puis met à jour une configuration (SUPER_ADMIN)', async () => {
    const created = await request(app)
      .post('/api/v1/risk-configurations')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        name: `wx-config-${Date.now()}`,
        rainWeight: 0.4,
        windWeight: 0.2,
        proximityWeight: 0.2,
        vulnerabilityWeight: 0.1,
        exposureWeight: 0.1,
        lowThreshold: 10,
        moderateThreshold: 30,
        highThreshold: 55,
        extremeThreshold: 80,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.isActive).toBe(true);
    const configId = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/v1/risk-configurations/${configId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ name: `wx-config-renamed-${Date.now()}`, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);
  });

  /**
   * Non-régression : la requête de contexte de risque ne doit jamais retenir une
   * ligne DGM, même datée dans le futur.
   *
   * La DGM publie un cumul de pluie DÉCENAL horodaté à la fin de la décade, donc
   * jusqu'à 9 jours dans le futur (du 11 au 20, `lastCompletedDekadEnd` renvoie
   * le 20 du mois). Sans tri de source, cette ligne plus récente écrasait
   * Open-Meteo pour les 1579 communes, et `scoreRain` lisait le cumul sur 10 jours
   * via `rainfall24hMm ?? precipitationMm` comme une pluie sur 24 h.
   *
   * On reproduit exactement cette situation : une ligne Open-Meteo « riche » et
   * ancienne, et une ligne DGM sans indicateur réel mais datée dans le futur.
   */
  it("getRiskContexts n'attribue jamais à precipitation_mm un cumul décennal", async () => {
    const sourceId = await db.query<{ open_meteo: string; dgm: string }>(
      `SELECT
         (SELECT id FROM weather_sources WHERE provider_type = 'OPEN_METEO' LIMIT 1) AS open_meteo,
         (SELECT id FROM weather_sources WHERE provider_type = 'DGM_MAPROOM' LIMIT 1) AS dgm`,
    );
    const sources = sourceId.rows[0];
    expect(sources?.dgm, 'la source DGM doit exister pour ce test').toBeTruthy();
    if (!sources?.dgm) return;

    // Commune dédiée : toutes les communes ont déjà au moins une observation
    // dans ce jeu de données. On crée donc une observation DGM temporairement
    // « la plus récente » sur une commune existante, et on s'assure qu'elle est
    // écartée par le tri (lignes riches > DGM > récence).
    //
    // `ORDER BY admin_code LIMIT 1` tombe sur une vraie commune (Faratsiho), pas
    // sur une ligne de test : le nettoyage passe donc par le helper de
    // sauvegarde/restauration. Un `DELETE FROM weather_observations WHERE
    // commune_id = $1` paraîtrait correct -- cette commune n'est pas impliquée
    // dans les assertions -- mais il effacerait aussi sa vraie observation, et
    // cette commune n'en a qu'une. La commune disparaissait alors de la carte
    // jusqu'au prochain run, pour une raison sans rapport avec le test.
    const target = await db.query<{ id: string; longitude: string; latitude: string }>(
      `SELECT id,
              ST_X(centroid)::text AS longitude,
              ST_Y(centroid)::text AS latitude
       FROM communes
       ORDER BY admin_code
       LIMIT 1`,
    );
    const commune = target.rows[0];
    expect(commune).toBeTruthy();
    if (!commune) return;
    const isolatedId = commune.id;
    const isoLat = Number(commune.latitude);
    const isoLon = Number(commune.longitude);

    await withRestoredWeather([isolatedId], async () => {
      // Une ligne DGM datée dans le futur, sans aucun indicateur réel : c'est
      // exactement ce qu'écrit le job DGM entre le 11 et le 20 du mois.
      const futureDekad = new Date(Date.now() + 9 * 24 * 3_600_000).toISOString();
      await db.query(
        `INSERT INTO weather_observations
           (commune_id, weather_source_id, data_kind, observed_at,
            latitude, longitude, geom, precipitation_mm, raw_data)
         VALUES ($1, $2, 'OBSERVE', $3, $4::numeric, $5::numeric,
                 ST_SetSRID(ST_MakePoint($5::float8, $4::float8), 4326), 104.9, $6)`,
        [
          isolatedId,
          sources.dgm,
          futureDekad,
          isoLat,
          isoLon,
          JSON.stringify({ provider: 'dgm-maproom' }),
        ],
      );

      // Une ligne Open-Meteo « riche », datée de maintenant pour être plus récente
      // que l'ingestion réelle du jour, mais de 9 jours avant la ligne DGM.
      const openMeteoAt = new Date().toISOString();
      await db.query(
        `INSERT INTO weather_observations
           (commune_id, weather_source_id, data_kind, observed_at,
            latitude, longitude, geom,
            temperature_c, humidity_percent, wind_speed_kmh, precipitation_mm, rainfall_24h_mm)
         VALUES ($1, $2, 'OBSERVE', $3, $4::numeric, $5::numeric,
                 ST_SetSRID(ST_MakePoint($5::float8, $4::float8), 4326),
                 27.5, 80, 45, 2, 2)`,
        [isolatedId, sources.open_meteo, openMeteoAt, isoLat, isoLon],
      );

      const contexts = await risksRepository.getRiskContexts({ communeIds: [isolatedId] });
      const context = contexts.find((c) => c.communeId === isolatedId);

      expect(context).toBeDefined();
      // La ligne DGM est plus récente ET sans indicateur : elle doit être écartée.
      expect(context?.precipitationMm).toBe(2);
      expect(context?.rainfall24hMm).toBe(2);
      expect(context?.windSpeedKmh).toBe(45);
    });
  });
});
