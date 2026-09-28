import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';
import { exposureRepository } from '../../src/repositories/exposure.repository';
import { automaticAlertService } from '../../src/services/automatic-alerts.service';

let admin: { id: string; token: string };
let superAdmin: { id: string; token: string };
let client: { id: string; token: string };

let communeId: string;

const MS_DAY = 24 * 60 * 60 * 1000;
const testEventStartAt = new Date(Date.now() + MS_DAY).toISOString();
const testEventEndAt = new Date(Date.now() + 4 * MS_DAY).toISOString();

const createdEventIds: string[] = [];
const createdAlertIds: string[] = [];

function makeEmail(role: string): string {
  return `aa_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
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

interface CreateEventBody {
  eventCode: string;
  name: string;
  type: string;
  status: string;
  severity: string;
  description: string;
  sourceName: string;
  startedAt: string;
  expectedEndAt: string;
}

function makeEventBody(status: string): CreateEventBody {
  return {
    eventCode: `EV-TEST-AUTO-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Cyclone test alertes automatiques',
    type: 'CYCLONE',
    status,
    severity: 'ELEVEE',
    description: 'Événement de test pour les alertes automatiques',
    sourceName: 'Météo France',
    startedAt: testEventStartAt,
    expectedEndAt: testEventEndAt,
  };
}

async function createEvent(status: string, token: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send(makeEventBody(status));
  expect(res.status).toBe(201);
  const id = res.body.data.id as string;
  createdEventIds.push(id);
  return id;
}

async function updateEventStatus(token: string, eventId: string, status: string): Promise<void> {
  const res = await request(app)
    .patch(`/api/v1/events/${eventId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
  expect(res.status).toBe(200);
}

async function detachDetectionCommune(eventId: string): Promise<void> {
  await db.query(`DELETE FROM event_detection_communes WHERE event_id = $1`, [eventId]);
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  superAdmin = await createUserAndLogin('SUPER_ADMIN');
  client = await createUserAndLogin('CLIENT');

  const c = await db.query<{ id: string }>(
    `SELECT c.id
     FROM communes c
     JOIN districts d ON d.id = c.district_id
     WHERE d.normalized_name = 'MAROANTSETRA'
     ORDER BY c.name
     LIMIT 1`,
  );
  communeId = c.rows[0].id;
});

afterAll(async () => {
  if (createdAlertIds.length > 0) {
    await db.query(`DELETE FROM alert_updates WHERE alert_id = ANY($1::uuid[])`, [createdAlertIds]);
    await db.query(`DELETE FROM alerts WHERE id = ANY($1::uuid[])`, [createdAlertIds]);
  }
  for (const eventId of createdEventIds) {
    await detachDetectionCommune(eventId);
  }
  await db.query(
    `DELETE FROM hazard_events WHERE id = ANY($1::uuid[])`,
    [createdEventIds.length ? createdEventIds : [null]],
  );
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

describe('Alertes automatiques - accès et validation', () => {
  it('refuse un accès non authentifié sur /alerts/automatic (401)', async () => {
    const res = await request(app).get('/api/v1/alerts/automatic');
    expect(res.status).toBe(401);
  });

  it('interdit la génération à un CLIENT (403)', async () => {
    const eventId = await createEvent('PREVISION', admin.token);
    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ eventId });
    expect(res.status).toBe(403);
  });

  it('rejette un eventId invalide (422)', async () => {
    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId: 'nimporte-quoi' });
    expect(res.status).toBe(422);
  });
});

describe('Alertes automatiques - prévision dangereuse', () => {
  let eventId: string;
  let alertId: string;

  it('crée une alerte de vigilance liée à un événement PREVISION', async () => {
    eventId = await createEvent('PREVISION', admin.token);
    await exposureRepository.upsertDetectionCommunes(eventId, [
      { communeId, metric: 'wind_speed', value: 120, threshold: 100 },
    ]);

    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.basis).toBe('PREVISION');
    expect(res.body.data.autoPublish).toBe(false);

    const list = await request(app)
      .get(`/api/v1/alerts/automatic?eventId=${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    const alert = list.body.data[0];
    alertId = alert.id;
    createdAlertIds.push(alertId);

    expect(alert.isAutomatic).toBe(true);
    expect(alert.basis).toBe('PREVISION');
    expect(alert.status).toBe('BROUILLON');
    expect(alert.type).toBe('CYCLONE');
    expect(alert.communeId).toBe(communeId);
    expect(alert.regionId).toBeNull();
    expect(alert.updateCount).toBe(0);
    expect(alert.publishedAt).toBeNull();
    expect(alert.source).toBe('Météo France');
    expect(alert.validFrom).toBe(testEventStartAt);
    expect(alert.expiresAt).toBe(testEventEndAt);
    expect(alert.title).toMatch(/^Prévision Cyclone/);
    expect(alert.message).toContain('Météo France');
    expect(alert.message).toContain('Période');
    expect(alert.message).toContain('suivez les consignes');
    expect(alert.message).toContain('Alerte à valider avant publication');
    expect(alert.message).not.toContain('va toucher');
  });

  it('le client ne voit pas l alerte de vigilance non publiée (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/alerts/${alertId}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(404);
  });

  it('historique : une entrée CREATED pour la création', async () => {
    const res = await request(app)
      .get(`/api/v1/alerts/${alertId}/history`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].kind).toBe('CREATED');
    expect(res.body.data[0].toStatus).toBe('BROUILLON');
    expect(res.body.data[0].trigger).toBe('MANUAL');
    expect(res.body.data[0].newTitle).toBeTruthy();
  });
});

describe('Alertes automatiques - observation confirmée (mise à jour sans doublon)', () => {
  let eventId: string;
  let alertId: string;

  it('remplace la prévision par une alerte actuelle lors du passage en ACTIF', async () => {
    eventId = await createEvent('PREVISION', admin.token);
    await exposureRepository.upsertDetectionCommunes(eventId, [
      { communeId, metric: 'wind_speed', value: 120, threshold: 100 },
    ]);

    const first = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(first.body.data.created).toBe(1);
    alertId = first.body.data.alerts[0].id;
    createdAlertIds.push(alertId);

    await updateEventStatus(admin.token, eventId, 'ACTIF');

    const second = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.updated).toBe(1);
    expect(second.body.data.basis).toBe('OBSERVATION');
    expect(second.body.data.alerts[0].id).toBe(alertId);

    const list = await request(app)
      .get(`/api/v1/alerts?eventId=${eventId}&communeId=${communeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    const automatic = list.body.data.filter(
      (a: { isAutomatic: boolean }) => a.isAutomatic === true,
    );
    expect(automatic.length).toBe(1);
    expect(automatic[0].id).toBe(alertId);
    expect(automatic[0].basis).toBe('OBSERVATION');
    expect(automatic[0].title).toMatch(/^Cyclone en cours/);
    expect(automatic[0].title).not.toContain('Prévision');
    expect(automatic[0].updateCount).toBe(1);
    expect(automatic[0].message).toContain('observation');
  });

  it('historique : deux entrées (CREATED puis UPDATED), valeurs anciennes conservées', async () => {
    const res = await request(app)
      .get(`/api/v1/alerts/${alertId}/history`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].kind).toBe('CREATED');
    expect(res.body.data[1].kind).toBe('UPDATED');
    expect(res.body.data[1].oldBasis).toBe('PREVISION');
    expect(res.body.data[1].newBasis).toBe('OBSERVATION');
    expect(res.body.data[1].oldTitle).toContain('Prévision');
    expect(res.body.data[1].newTitle).toContain('en cours');
    expect(res.body.data[1].trigger).toBe('MANUAL');
  });

  it('une génération identique ne réécrit pas (unchanged) et n ajoute pas d historique', async () => {
    const before = await request(app)
      .get(`/api/v1/alerts/${alertId}/history`)
      .set('Authorization', `Bearer ${admin.token}`);

    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.unchanged).toBe(1);

    const after = await request(app)
      .get(`/api/v1/alerts/${alertId}/history`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(after.body.data.length).toBe(before.body.data.length);
  });
});

describe('Alertes automatiques - ciblage et repli', () => {
  it('repli sur alerte événement globale sans donnée territoriale', async () => {
    const eventId = await createEvent('PREVISION', admin.token);

    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    const alert = res.body.data.alerts[0];
    createdAlertIds.push(alert.id);
    expect(alert.communeId).toBeNull();
    expect(alert.districtId).toBeNull();
    expect(alert.regionId).toBeNull();
    expect(alert.eventId).toBe(eventId);
    expect(alert.title).toContain('Cyclone test alertes automatiques');

    const again = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(again.body.data.created).toBe(0);
    expect(again.body.data.unchanged).toBe(1);
  });

  it('ne génère rien pour un événement CLOTURE', async () => {
    const eventId = await createEvent('CLOTURE', admin.token);

    const res = await request(app)
      .post('/api/v1/alerts/automatic/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ eventId });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.updated).toBe(0);
  });
});

describe('Alertes automatiques - politique de publication', () => {
  it('avec autoPublish, l alerte est directement PUBLIEE', async () => {
    const eventId = await createEvent('PREVISION', admin.token);
    await exposureRepository.upsertDetectionCommunes(eventId, [
      { communeId, metric: 'wind_speed', value: 120, threshold: 100 },
    ]);

    const result = await automaticAlertService.generateForEvent({
      eventId,
      trigger: 'MANUAL',
      autoPublish: true,
    });
    expect(result.autoPublish).toBe(true);
    expect(result.created).toBe(1);
    const alert = result.alerts[0];
    createdAlertIds.push(alert.id);
    expect(alert.status).toBe('PUBLIEE');
    expect(alert.publishedAt).toBeTruthy();

    const clientList = await request(app)
      .get('/api/v1/alerts/automatic')
      .set('Authorization', `Bearer ${client.token}`);
    expect(clientList.status).toBe(200);
    const found = clientList.body.data.find((a: { id: string }) => a.id === alert.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('PUBLIEE');
  });

  it('un événement CLOTURE ne produit aucune alerte (service)', async () => {
    const eventId = await createEvent('CLOTURE', admin.token);

    const result = await automaticAlertService.generateForEvent({
      eventId,
      trigger: 'MANUAL',
    });
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});