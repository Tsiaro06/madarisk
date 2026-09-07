import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';
import { weatherService } from '../../src/services/weather.service';
import { WeatherProvider } from '../../src/types/weather.types';

let admin: { id: string; token: string };
let superAdmin: { id: string; token: string };
let client: { id: string; token: string };

let communeId: string;
let districtId: string;
let communeLon: number;
let communeLat: number;

let riskEventId: string;

const mockProvider: WeatherProvider = {
  getCurrent: async () => ({
    observedAt: new Date().toISOString(),
    temperatureC: 28.5,
    humidityPercent: 82,
    precipitationMm: 120,
    rainfall24hMm: 150,
    windSpeedKmh: 110,
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
      surfacePressureHpa: [980],
      weatherCode: [95],
    },
  }),
};

function makeEmail(role: string): string {
  return `al_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
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
  return { id: user.id, token: login.body.data.accessToken };
}

async function createEvent(token: string, startedAt?: string): Promise<string> {
  const body = {
    eventCode: `CY-AL-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Cyclone test alertes',
    type: 'CYCLONE',
    severity: 'ELEVEE',
    description: 'Événement de test pour les alertes',
    sourceName: 'Météo France',
    startedAt: startedAt ?? '2026-03-01T06:00:00.000Z',
    expectedEndAt: '2026-03-05T18:00:00.000Z',
  };
  const res = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body.data.id;
}

async function prepareEventWithExposure(token: string): Promise<string> {
  const eventId = await createEvent(token);

  await request(app)
    .post('/api/v1/weather/refresh/communes')
    .set('Authorization', `Bearer ${token}`)
    .send({ communeIds: [communeId] });

  const track = {
    observedAt: '2026-03-01T06:00:00.000Z',
    trackType: 'OBSERVEE',
    latitude: communeLat,
    longitude: communeLon,
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
    .send({ ...track, observedAt: '2026-03-01T12:00:00.000Z', latitude: communeLat + 0.05 });

  const areaRes = await request(app)
    .post(`/api/v1/events/${eventId}/areas/calculate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 150 });
  const areaId = areaRes.body.data.areaId;

  await request(app)
    .post(`/api/v1/events/${eventId}/exposure/calculate?areaId=${areaId}`)
    .set('Authorization', `Bearer ${token}`);

  return eventId;
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  superAdmin = await createUserAndLogin('SUPER_ADMIN');
  client = await createUserAndLogin('CLIENT');

  weatherService.setProvider(mockProvider);

  const c = await db.query<{ id: string; districtId: string; lon: number; lat: number }>(
    `SELECT
       c.id,
       c.district_id AS "districtId",
       ST_X(c.centroid) AS lon,
       ST_Y(c.centroid) AS lat
     FROM communes c
     JOIN districts d ON d.id = c.district_id
     WHERE d.normalized_name = 'MAROANTSETRA'
     ORDER BY c.name
     LIMIT 1`,
  );
  communeId = c.rows[0].id;
  districtId = c.rows[0].districtId;
  communeLon = c.rows[0].lon;
  communeLat = c.rows[0].lat;
});

afterAll(async () => {
  if (riskEventId) {
    await db.query(`DELETE FROM alerts WHERE event_id = $1`, [riskEventId]);
  }
  await db.query(
    `DELETE FROM hazard_events WHERE created_by IN ($1, $2, $3)`,
    [admin.id, superAdmin.id, client.id],
  );
  await db.query(`DELETE FROM weather_observations WHERE commune_id = $1`, [communeId]);
  await db.query(
    `DELETE FROM user_sessions WHERE user_id IN ($1, $2, $3)`,
    [admin.id, superAdmin.id, client.id],
  );
  await db.query(
    `DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3)`,
    [admin.id, superAdmin.id, client.id],
  );
  await db.query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [admin.id, superAdmin.id, client.id],
  );
  await db.pool.end();
});

describe('Alertes - contrôle d accès', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(401);

    const post = await request(app).post('/api/v1/alerts').send({});
    expect(post.status).toBe(401);
  });

  it('interdit la création à un CLIENT (403)', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        type: 'CYCLONE',
        severity: 'ELEVEE',
        title: 'Alerte interdite',
        message: 'Ne doit pas être créée',
        districtId,
      });
    expect(res.status).toBe(403);
  });

  it('rejette une création sans cible (422)', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        type: 'CYCLONE',
        severity: 'ELEVEE',
        title: 'Alerte sans cible',
        message: 'Doit être rejetée',
      });
    expect(res.status).toBe(422);
  });
});

describe('Alertes - cycle de vie', () => {
  let alertId: string;

  it('crée une alerte en BROUILLON', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        districtId,
        type: 'CYCLONE',
        severity: 'EXTREME',
        title: 'Cyclone imminent',
        message: 'Un cyclone approche du district.',
        expiresAt: '2026-12-31T23:59:59.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('BROUILLON');
    expect(res.body.data.title).toBe('Cyclone imminent');
    expect(res.body.data.districtId).toBe(districtId);
    expect(res.body.data.publishedAt).toBeNull();
    alertId = res.body.data.id;
  });

  it('CLIENT ne voit pas le brouillon', async () => {
    const list = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${client.token}`);
    expect(list.status).toBe(200);
    const found = list.body.data.find((a: { id: string }) => a.id === alertId);
    expect(found).toBeUndefined();

    const detail = await request(app)
      .get(`/api/v1/alerts/${alertId}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(detail.status).toBe(404);
  });

  it('ADMIN modifie un brouillon', async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Cyclone imminent renforcé' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Cyclone imminent renforcé');
    expect(res.body.data.status).toBe('BROUILLON');
  });

  it('publie l alerte', async () => {
    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLIEE');
    expect(res.body.data.publishedAt).toBeTruthy();
  });

  it('refuse une modification après publication', async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Ne doit pas passer' });
    expect(res.status).toBe(400);
  });

  it('CLIENT voit désormais l alerte publiée', async () => {
    const list = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${client.token}`);
    expect(list.status).toBe(200);
    const found = list.body.data.find((a: { id: string }) => a.id === alertId);
    expect(found).toBeDefined();
    expect(found.status).toBe('PUBLIEE');

    const detail = await request(app)
      .get(`/api/v1/alerts/${alertId}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(detail.status).toBe(200);
  });

  it('archive l alerte', async () => {
    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/archive`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVEE');
  });

  it('CLIENT ne voit plus une alerte archivée', async () => {
    const list = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${client.token}`);
    expect(list.status).toBe(200);
    const found = list.body.data.find((a: { id: string }) => a.id === alertId);
    expect(found).toBeUndefined();

    const adminList = await request(app)
      .get('/api/v1/alerts?status=ARCHIVEE')
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(adminList.status).toBe(200);
    const archived = adminList.body.data.find((a: { id: string }) => a.id === alertId);
    expect(archived).toBeDefined();
  });

  it('refuse de publier une alerte archivée', async () => {
    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });
});

describe('Alertes - génération depuis un risque extrême', () => {
  let draftId: string;

  it('crée un brouillon après recalcul de risque extrême', async () => {
    riskEventId = await prepareEventWithExposure(admin.token);

    const recalc = await request(app)
      .post(`/api/v1/events/${riskEventId}/risks/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ phase: 'PENDANT' });
    expect(recalc.status).toBe(200);
    expect(recalc.body.data.totalCommunes).toBeGreaterThan(0);

    const first = await request(app)
      .get(`/api/v1/alerts?eventId=${riskEventId}&communeId=${communeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.length).toBeGreaterThan(0);
    const draft = first.body.data.find((a: { type: string; status: string }) => a.status === 'BROUILLON');
    expect(draft).toBeDefined();
    expect(draft.type).toBe('URGENCE');
    draftId = draft.id;
  });

  it('ne crée pas de doublon lors d un second recalcul', async () => {
    await request(app)
      .post(`/api/v1/events/${riskEventId}/risks/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ phase: 'PENDANT' })
      .expect(200);

    const again = await request(app)
      .get(`/api/v1/alerts?eventId=${riskEventId}&communeId=${communeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    const drafts = again.body.data.filter(
      (a: { type: string; status: string }) => a.status === 'BROUILLON',
    );
    expect(drafts.some((a: { id: string }) => a.id === draftId)).toBe(true);
    expect(drafts.length).toBe(1);
  });
});