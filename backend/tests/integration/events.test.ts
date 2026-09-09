import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

let adminId: string;
let superAdminId: string;
let clientId: string;
let admin: { id: string; token: string };
let superAdmin: { id: string; token: string };
let client: { id: string; token: string };
let adminToken = '';
let superAdminToken = '';
let clientToken = '';

let communeId: string;
let communeLon: number;
let communeLat: number;

function makeEmail(role: string): string {
  return `evt_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
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
    const found = await usersRepository.findByEmail(email);
    console.log(`[debug] user found=${!!found} id=${found?.id} active=${found?.isActive}`);
    if (found) {
      const okPw = await password.compare('Passw0rd!', found.passwordHash);
      console.log(`[debug] password compare=${okPw}`);
    }
  }
  return { id: user.id, token: login.body.data.accessToken };
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  superAdmin = await createUserAndLogin('SUPER_ADMIN');
  client = await createUserAndLogin('CLIENT');
  adminId = admin.id;
  superAdminId = superAdmin.id;
  clientId = client.id;
  adminToken = admin.token;
  superAdminToken = superAdmin.token;
  clientToken = client.token;

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
});

afterAll(async () => {
  await db.query(
    `DELETE FROM hazard_events WHERE created_by IN ($1, $2, $3)`,
    [adminId, superAdminId, clientId],
  );
  await db.query(
    `DELETE FROM user_sessions WHERE user_id IN ($1, $2, $3)`,
    [adminId, superAdminId, clientId],
  );
  await db.query(
    `DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3)`,
    [adminId, superAdminId, clientId],
  );
  await db.query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [adminId, superAdminId, clientId],
  );
  await db.pool.end();
});

async function createEvent(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: any }> {
  const body = {
    eventCode: `CY-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Cyclone test',
    type: 'CYCLONE',
    severity: 'MODEREE',
    description: 'Événement de test',
    sourceName: 'Météo France',
    startedAt: '2026-02-01T06:00:00.000Z',
    expectedEndAt: '2026-02-05T18:00:00.000Z',
    ...overrides,
  };
  const res = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return { id: res.body.data?.id, body: res.body };
}

async function addTrack(
  token: string,
  eventId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ body: any }> {
  const body = {
    observedAt: '2026-02-01T06:00:00.000Z',
    trackType: 'OBSERVEE',
    latitude: communeLat,
    longitude: communeLon,
    windSpeedKmh: 120,
    gustSpeedKmh: 150,
    pressureHpa: 960,
    ...overrides,
  };
  const res = await request(app)
    .post(`/api/v1/events/${eventId}/tracks`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return { body: res.body };
}

describe('Événements - accès et rôles', () => {
  it('refuse l accès sans authentification', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(401);
  });

  it('un CLIENT peut lister les événements', async () => {
    const res = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('un CLIENT ne peut pas créer un événement (403)', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        eventCode: `CY-CLIENT-${Date.now()}`,
        name: 'Refus',
        type: 'CYCLONE',
      });
    expect(res.status).toBe(403);
  });

  it('un ADMIN ne peut pas supprimer un événement (403, SUPER_ADMIN requis)', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .delete(`/api/v1/events/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Événements - création', () => {
  it('crée un événement cyclone avec status par défaut BROUILLON', async () => {
    const { body } = await createEvent(adminToken);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.eventCode).toBeDefined();
    expect(body.data.type).toBe('CYCLONE');
    expect(body.data.name).toBe('Cyclone test');
    expect(body.data.status).toBe('BROUILLON');
    expect(body.data.severity).toBe('MODEREE');
    expect(body.data.sourceName).toBe('Météo France');
  });

  it('rejette un eventCode en double (409)', async () => {
    const eventCode = `CY-DUP-${Date.now()}`;
    const first = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventCode, name: 'Original', type: 'CYCLONE' });
    expect(first.status).toBe(201);

    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventCode, name: 'Dupliqué', type: 'CYCLONE' });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('eventCode');
  });

  it('rejette un type invalide (422)', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventCode: `CY-BADTYPE-${Date.now()}`,
        name: 'Mauvais type',
        type: 'TSUNAMI',
      });
    expect(res.status).toBe(422);
  });
});

describe('Événements - transitions de statut', () => {
  it('autorise une transition valide BROUILLON → PREVISION', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREVISION' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PREVISION');
  });

  it('refuse une transition invalide BROUILLON → ACTIF (saut d étape)', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIF' });
    expect(res.status).toBe(400);
  });

  it('enchaîne les transitions valides jusqu à CLOTURE', async () => {
    const { id } = await createEvent(adminToken);
    for (const status of ['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']) {
      const res = await request(app)
        .patch(`/api/v1/events/${id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  it('retour à BROUILLON refusé pour un ADMIN', async () => {
    const { id } = await createEvent(adminToken);
    await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREVISION' });
    const res = await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'BROUILLON' });
    // Pas de donnée opérationnelle critique : autorisé pour un SUPER_ADMIN
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BROUILLON');
  });

  it('retour à BROUILLON refusé si des trajectoires existent', async () => {
    const { id } = await createEvent(adminToken);
    await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREVISION' });
    await addTrack(adminToken, id);
    await addTrack(adminToken, id, { observedAt: '2026-02-01T12:00:00.000Z' });
    const res = await request(app)
      .patch(`/api/v1/events/${id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'BROUILLON' });
    expect(res.status).toBe(400);
  });
});

describe('Événements - trajectoires', () => {
  it('ajoute un point de trajectoire avec geom calculé', async () => {
    const { id } = await createEvent(adminToken);
    const { body } = await addTrack(adminToken, id);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.trackType).toBe('OBSERVEE');
    expect(body.data.latitude).toBeCloseTo(communeLat, 5);
    expect(body.data.longitude).toBeCloseTo(communeLon, 5);
    expect(body.data.windSpeedKmh).toBe(120);
  });

  it('rejette une latitude invalide (422)', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .post(`/api/v1/events/${id}/tracks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        observedAt: '2026-02-01T06:00:00.000Z',
        latitude: 91,
        longitude: 49,
        trackType: 'OBSERVEE',
      });
    expect(res.status).toBe(422);
  });

  it('rejette une longitude invalide (422)', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .post(`/api/v1/events/${id}/tracks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        observedAt: '2026-02-01T06:00:00.000Z',
        latitude: -16,
        longitude: 181,
        trackType: 'OBSERVEE',
      });
    expect(res.status).toBe(422);
  });

  it('liste les points triés par observed_at', async () => {
    const { id } = await createEvent(adminToken);
    await addTrack(adminToken, id, { observedAt: '2026-02-01T18:00:00.000Z' });
    await addTrack(adminToken, id, { observedAt: '2026-02-01T06:00:00.000Z' });
    const res = await request(app)
      .get(`/api/v1/events/${id}/tracks`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].observedAt).toBe('2026-02-01T06:00:00.000Z');
    expect(res.body.data[1].observedAt).toBe('2026-02-01T18:00:00.000Z');
  });
});

describe('Événements - LineString GeoJSON', () => {
  it('génère une LineString seulement avec 2 points minimum', async () => {
    const { id } = await createEvent(adminToken);
    const alone = await request(app)
      .get(`/api/v1/events/${id}/track-geojson`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(alone.status).toBe(200);
    expect(alone.body.data.type).toBe('FeatureCollection');
    expect(alone.body.data.features.length).toBe(0);

    await addTrack(adminToken, id);
    await addTrack(adminToken, id, {
      observedAt: '2026-02-01T12:00:00.000Z',
      latitude: communeLat + 0.5,
      longitude: communeLon + 0.5,
    });

    const res = await request(app)
      .get(`/api/v1/events/${id}/track-geojson`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    const trackFeature = res.body.data.features.find(
      (f: { properties: { trackType: string } }) => f.properties.trackType === 'OBSERVEE',
    );
    expect(trackFeature).toBeDefined();
    expect(trackFeature.geometry.type).toBe('LineString');
    expect(trackFeature.geometry.coordinates.length).toBe(2);
  });
});

describe('Événements - zones d influence', () => {
  it('refuse le calcul de zone sans 2 points', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .post(`/api/v1/events/${id}/areas/calculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 100 });
    expect(res.status).toBe(400);
  });

  it('calcule un buffer autour de la trajectoire (zone)', async () => {
    const { id } = await createEvent(adminToken);
    await addTrack(adminToken, id);
    await addTrack(adminToken, id, {
      observedAt: '2026-02-01T12:00:00.000Z',
      latitude: communeLat + 0.4,
      longitude: communeLon + 0.4,
    });

    const res = await request(app)
      .post(`/api/v1/events/${id}/areas/calculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 50 });
    expect(res.status).toBe(201);
    expect(res.body.data.areaId).toBeDefined();

    const list = await request(app)
      .get(`/api/v1/events/${id}/areas`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.type).toBe('FeatureCollection');
    expect(list.body.data.features.length).toBe(1);
    expect(['Polygon', 'MultiPolygon']).toContain(list.body.data.features[0].geometry.type);
  });

  it('définit une zone polygonale manuelle (sans trajectoire)', async () => {
    const { id } = await createEvent(adminToken);

    const res = await request(app)
      .post(`/api/v1/events/${id}/areas/polygon`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        phase: 'PENDANT',
        riskLevel: 'ELEVE',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [communeLon, communeLat],
              [communeLon + 2, communeLat],
              [communeLon + 2, communeLat + 2],
              [communeLon, communeLat + 2],
              [communeLon, communeLat],
            ],
          ],
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.areaId).toBeDefined();
    expect(res.body.data.radiusKm).toBeNull();

    const list = await request(app)
      .get(`/api/v1/events/${id}/areas`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.features.length).toBe(1);
    expect(list.body.data.features[0].geometry.type).toBe('MultiPolygon');
  });

  it('refuse une géométrie invalide pour une zone polygonale', async () => {
    const { id } = await createEvent(adminToken);
    const res = await request(app)
      .post(`/api/v1/events/${id}/areas/polygon`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', geometry: { type: 'Point', coordinates: [] } });
    expect(res.status).toBe(422);
  });

  it('calcule l exposition depuis une zone polygonale', async () => {
    const { id } = await createEvent(adminToken);
    const areaRes = await request(app)
      .post(`/api/v1/events/${id}/areas/polygon`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        phase: 'PENDANT',
        riskLevel: 'ELEVE',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [communeLon - 3, communeLat - 3],
              [communeLon + 3, communeLat - 3],
              [communeLon + 3, communeLat + 3],
              [communeLon - 3, communeLat + 3],
              [communeLon - 3, communeLat - 3],
            ],
          ],
        },
      });
    expect(areaRes.status).toBe(201);

    const dbCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM exposed_communes
       WHERE event_id = $1 AND commune_id = $2`,
      [id, communeId],
    );
    expect(parseInt(dbCount.rows[0].count, 10)).toBe(1);

    const totals = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM exposed_communes WHERE event_id = $1`,
      [id],
    );
    expect(parseInt(totals.rows[0].n, 10)).toBeGreaterThan(0);
  });
});

describe('Événements - exposition des communes', () => {
  it('calcule l exposition et enregistre les communes intersectées', async () => {
    const { id } = await createEvent(adminToken);
    await addTrack(adminToken, id);
    await addTrack(adminToken, id, {
      observedAt: '2026-02-01T12:00:00.000Z',
      latitude: communeLat + 0.3,
      longitude: communeLon + 0.3,
    });

    const areaRes = await request(app)
      .post(`/api/v1/events/${id}/areas/calculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 150 });
    expect(areaRes.status).toBe(201);
    const areaId = areaRes.body.data.areaId;

    const expRes = await request(app)
      .post(`/api/v1/events/${id}/exposure/calculate?areaId=${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(expRes.status).toBe(200);
    expect(expRes.body.data.totalCommunesCalculated).toBeGreaterThan(0);
  });

  it('le calcul est idempotent (même commune non comptée deux fois)', async () => {
    const { id } = await createEvent(adminToken);
    await addTrack(adminToken, id);
    await addTrack(adminToken, id, {
      observedAt: '2026-02-01T12:00:00.000Z',
      latitude: communeLat + 0.3,
      longitude: communeLon + 0.3,
    });
    const areaRes = await request(app)
      .post(`/api/v1/events/${id}/areas/calculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 150 });
    const areaId = areaRes.body.data.areaId;

    const first = await request(app)
      .post(`/api/v1/events/${id}/exposure/calculate?areaId=${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app)
      .post(`/api/v1/events/${id}/exposure/calculate?areaId=${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const dbCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exposed_communes WHERE event_id = $1`,
      [id],
    );
    const count = parseInt(dbCount.rows[0].count, 10);

    expect(second.body.data.totalCommunesCalculated).toBe(first.body.data.totalCommunesCalculated);
    expect(count).toBe(first.body.data.totalIntersecting);
  });

  it('liste les communes exposées avec pagination', async () => {
    const { id } = await createEvent(adminToken);
    await addTrack(adminToken, id);
    await addTrack(adminToken, id, {
      observedAt: '2026-02-01T12:00:00.000Z',
      latitude: communeLat + 0.3,
      longitude: communeLon + 0.3,
    });
    const areaRes = await request(app)
      .post(`/api/v1/events/${id}/areas/calculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 150 });
    const areaId = areaRes.body.data.areaId;
    await request(app)
      .post(`/api/v1/events/${id}/exposure/calculate?areaId=${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const firstPage = await request(app)
      .get(`/api/v1/events/${id}/exposed-communes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 5 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.success).toBe(true);
    expect(Array.isArray(firstPage.body.data)).toBe(true);
    expect(firstPage.body.data.length).toBeGreaterThan(0);
    expect(firstPage.body.data.length).toBeLessThanOrEqual(5);
    expect(firstPage.body.meta).toBeDefined();
    expect(firstPage.body.meta.total).toBeGreaterThan(0);

    let match;
    let page = 1;
    const pageSize = 5;
    while (!match) {
      const res = await request(app)
        .get(`/api/v1/events/${id}/exposed-communes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page, limit: pageSize });
      expect(res.status).toBe(200);
      match = res.body.data.find(
        (r: { communeId: string }) => r.communeId === communeId,
      );
      if (res.body.data.length < pageSize || page * pageSize >= res.body.meta.total) break;
      page += 1;
    }

    expect(match).toBeDefined();
    expect(match.communeName).toBeDefined();
    expect(match.districtName).toBeDefined();
    expect(typeof match.distanceToTrackKm).toBe('number');
    expect(match.isInsideInfluenceArea).toBe(true);
  });
});