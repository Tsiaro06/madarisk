import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'ANALYSTE_SIG' | 'CLIENT';

let adminId: string;
let analysteId: string;
let scopedEventId: string;

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
  scopedEventId = created.body.data.id;
});

afterAll(async () => {
  await db.query(`DELETE FROM hazard_events WHERE created_by IN ($1, $2, $3)`, [
    adminId,
    analysteId,
    client.id,
  ]);
  await db.query(`DELETE FROM user_sessions WHERE user_id IN ($1, $2, $3)`, [
    adminId,
    analysteId,
    client.id,
  ]);
  await db.query(`DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3)`, [
    adminId,
    analysteId,
    client.id,
  ]);
  await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, analysteId, client.id]);
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
    // exposedPopulation vaut null quand aucune population n'est connue : un
    // COALESCE(... , 0) masquerait cette absence de donnee derriere un « 0 hab. »
    // affiche aux decisionnaires comme une exposition reelle.
    expect(
      data.exposedPopulation === null || typeof data.exposedPopulation === 'number',
    ).toBe(true);
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

describe('Dashboard - population exposée', () => {
  const POPULATION_A = 12_000;
  const POPULATION_B = 8_500;

  let communeA: string;
  let communeB: string;
  let savedA: number | null;
  let savedB: number | null;

  beforeAll(async () => {
    const communes = await db.query<{ id: string; population: number | null }>(
      'SELECT id, population FROM communes ORDER BY id LIMIT 2',
    );
    communeA = communes.rows[0].id;
    communeB = communes.rows[1].id;
    savedA = communes.rows[0].population;
    savedB = communes.rows[1].population;
  });

  afterAll(async () => {
    await db.query('DELETE FROM exposed_communes WHERE event_id = $1', [scopedEventId]);
    await db.query('UPDATE communes SET population = $2 WHERE id = $1', [communeA, savedA]);
    await db.query('UPDATE communes SET population = $2 WHERE id = $1', [communeB, savedB]);
  });

  async function setExposedPopulations(a: number | null, b: number | null): Promise<void> {
    await db.query('DELETE FROM exposed_communes WHERE event_id = $1', [scopedEventId]);
    for (const [communeId, population] of [
      [communeA, a],
      [communeB, b],
    ] as const) {
      await db.query(
        `INSERT INTO exposed_communes (event_id, commune_id, is_inside_influence_area, exposed_population)
         VALUES ($1, $2, true, $3)`,
        [scopedEventId, communeId, population],
      );
    }
  }

  async function summaryPopulation(): Promise<number | null> {
    const res = await request(app)
      .get(`/api/v1/dashboard/summary?eventId=${scopedEventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    return res.body.data.exposedPopulation as number | null;
  }

  it('somme les populations exposées des communes de l\'événement', async () => {
    await db.query('UPDATE communes SET population = $2 WHERE id = $1', [communeA, POPULATION_A]);
    await db.query('UPDATE communes SET population = $2 WHERE id = $1', [communeB, POPULATION_B]);
    await setExposedPopulations(POPULATION_A, POPULATION_B);

    expect(await summaryPopulation()).toBe(POPULATION_A + POPULATION_B);
  });

  it('renvoie null, et non 0, quand aucune population n\'est connue', async () => {
    await setExposedPopulations(null, null);

    // Régression : un COALESCE(SUM(...), 0) ici renvoyait 0, ce qui affiche
    // « 0 hab. » aux décisionnaires alors que la donnée est simplement absente.
    expect(await summaryPopulation()).toBeNull();
  });

  it('distingue un total réellement nul d\'une population inconnue', async () => {
    await setExposedPopulations(0, 0);

    // 0 est une valeur exploitable : elle doit rester 0 et non devenir null.
    expect(await summaryPopulation()).toBe(0);
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
    const sum = data.FAIBLE + data.MODERE + data.ELEVE + data.EXTREME + data.SANS_RISQUE;
    expect(sum).toBeGreaterThan(0);
  });

  it('renvoie la chronologie des événements filtrée', async () => {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await request(app)
      .get(
        `/api/v1/dashboard/events-timeline?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
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

describe('Dashboard - scoping par événement', () => {
  it('résumé filtré : seuls les indicateurs de l événement sont comptés', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/summary?eventId=${scopedEventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.activeEvents).toBe(1);
    expect(data.forecastEvents).toBe(0);
    expect(typeof data.extremeRiskCommunes).toBe('number');
    expect(
      data.exposedPopulation === null || typeof data.exposedPopulation === 'number',
    ).toBe(true);
    expect(Array.isArray(data.latestAlerts)).toBe(true);
    expect(Array.isArray(data.priorityCommunes)).toBe(true);
  });

  it('répartition filtrée : SANS_RISQUE nul et niveaux bornés par l événement', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/risk-distribution?eventId=${scopedEventId}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    for (const key of ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME', 'SANS_RISQUE']) {
      expect(typeof data[key]).toBe('number');
    }
    expect(data.SANS_RISQUE).toBe(0);
  });

  it('chronologie filtrée : volume d évaluations de l événement', async () => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await request(app)
      .get(
        `/api/v1/dashboard/events-timeline?eventId=${scopedEventId}&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
