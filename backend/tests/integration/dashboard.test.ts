import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'ANALYSTE_SIG' | 'CLIENT';

let adminId: string;
let analysteId: string;

let admin: { id: string; token: string };
let analyste: { id: string; token: string };
let client: { id: string; token: string };

let timelineEventStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

function makeEmail(role: string): string {
  return `db_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: Role): Promise<{ id: string; token: string }> {
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

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  analyste = await createUserAndLogin('ANALYSTE_SIG');
  client = await createUserAndLogin('CLIENT');
  adminId = admin.id;
  analysteId = analyste.id;

  const body = {
    eventCode: `CY-DB-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Cyclone test dashboard',
    type: 'CYCLONE',
    status: 'ACTIF',
    severity: 'ELEVEE',
    description: 'Événement de test pour le tableau de bord',
    startedAt: timelineEventStart.toISOString(),
    expectedEndAt: new Date(Date.now() - 86400000).toISOString(),
  };
  const created = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${admin.token}`)
    .send(body);
  void created;
});

afterAll(async () => {
  await db.query(
    `DELETE FROM hazard_events WHERE created_by IN ($1, $2, $3)`,
    [adminId, analysteId, client.id],
  );
  await db.query(
    `DELETE FROM user_sessions WHERE user_id IN ($1, $2, $3)`,
    [adminId, analysteId, client.id],
  );
  await db.query(
    `DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3)`,
    [adminId, analysteId, client.id],
  );
  await db.query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [adminId, analysteId, client.id],
  );
  await db.pool.end();
});

describe('Dashboard - contrôle d accès', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);

    const dist = await request(app).get('/api/v1/dashboard/risk-distribution');
    expect(dist.status).toBe(401);
  });

  it('autorise tout rôle authentifié', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
  });
});

describe('Dashboard - summary', () => {
  it('renvoie un résumé complet', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(typeof data.activeEvents).toBe('number');
    expect(typeof data.forecastEvents).toBe('number');
    expect(typeof data.activeAlerts).toBe('number');
    expect(typeof data.totalDistricts).toBe('number');
    expect(typeof data.totalCommunes).toBe('number');
    expect(typeof data.extremeRiskCommunes).toBe('number');
    expect(typeof data.highRiskCommunes).toBe('number');
    expect(typeof data.exposedPopulation).toBe('number');
    expect(Array.isArray(data.latestAlerts)).toBe(true);
    expect(Array.isArray(data.priorityCommunes)).toBe(true);
    expect(data.lastUpdatedAt === null || typeof data.lastUpdatedAt === 'string').toBe(true);
    expect(data.pendingMatchings).toBeUndefined();
  });

  it('expose pendingMatchings pour ANALYSTE_SIG', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${analyste.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.pendingMatchings).toBe('number');
  });
});

describe('Dashboard - endpoints spécifiques', () => {
  it('renvoie la répartition des communes par niveau', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/risk-distribution')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    for (const key of ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME', 'SANS_RISQUE']) {
      expect(typeof data[key]).toBe('number');
    }
    const sum =
      data.FAIBLE + data.MODERE + data.ELEVE + data.EXTREME + data.SANS_RISQUE;
    expect(sum).toBeGreaterThan(0);
  });

  it('renvoie la chronologie des événements filtrée', async () => {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await request(app)
      .get(`/api/v1/dashboard/events-timeline?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const dateKey = timelineEventStart.toISOString().slice(0, 10);
    const day = res.body.data.find((e: { date: string }) => e.date === dateKey);
    expect(day).toBeDefined();
    expect(day.total).toBeGreaterThanOrEqual(1);
  });

  it('renvoie les communes prioritaires triées par score décroissant', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/priority-communes?limit=5')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const scores: number[] = res.body.data.map((r: { riskScore: number }) => r.riskScore);
    if (scores.length > 1) {
      expect(scores[0]).toBe(Math.max(...scores));
    }
  });
});