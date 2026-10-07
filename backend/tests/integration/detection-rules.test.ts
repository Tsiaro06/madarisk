import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

interface RuleRow {
  id: string;
}

let superAdmin: { id: string; token: string };
let client: { id: string; token: string };
let activeRuleId: string;
let inactiveRuleId: string;
const createdRuleIds: string[] = [];

function makeEmail(suffix: string): string {
  return `det_${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@madarisk.test`;
}

async function createUserAndLogin(
  role: 'SUPER_ADMIN' | 'CLIENT',
): Promise<{ id: string; token: string }> {
  const email = makeEmail(role.toLowerCase());
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
  superAdmin = await createUserAndLogin('SUPER_ADMIN');
  client = await createUserAndLogin('CLIENT');

  const activeInsert = await db.query<RuleRow>(
    `INSERT INTO hazard_detection_rules
      (hazard_type, metric, operator, threshold, duration_minutes,
       aggregation_window_minutes, forecast_horizon_hours, severity_rules, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
     RETURNING id`,
    [
      'VENT_VIOLENT',
      'wind_speed_10m',
      'GE',
      80,
      60,
      60,
      0,
      JSON.stringify([{ level: 'ELEVEE', min: 80 }]),
      superAdmin.id,
    ],
  );
  activeRuleId = activeInsert.rows[0].id;

  const inactiveInsert = await db.query<RuleRow>(
    `INSERT INTO hazard_detection_rules
      (hazard_type, metric, operator, threshold, is_active, created_by)
     VALUES ($1, $2, $3, $4, false, $5)
     RETURNING id`,
    ['INONDATION', 'precipitation', 'GT', 120, superAdmin.id],
  );
  inactiveRuleId = inactiveInsert.rows[0].id;
});

afterAll(async () => {
  const ids = [activeRuleId, inactiveRuleId, ...createdRuleIds].filter(Boolean);
  if (ids.length > 0) {
    await db.query('DELETE FROM hazard_detection_rules WHERE id = ANY($1::uuid[])', [ids]);
  }
  await db.query('DELETE FROM audit_logs WHERE user_id IN ($1, $2)', [superAdmin.id, client.id]);
  await db.query('DELETE FROM users WHERE id IN ($1, $2)', [superAdmin.id, client.id]);
});

describe('GET /api/v1/detection-rules', () => {
  it('retourne 401 sans jeton', async () => {
    const res = await request(app).get('/api/v1/detection-rules');
    expect(res.status).toBe(401);
  });

  it('renvoie uniquement les règles actives par défaut (inactives ignorées)', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const rules = res.body.data as Array<{ id: string; isActive: boolean }>;
    const active = rules.find((r) => r.id === activeRuleId);
    const inactive = rules.find((r) => r.id === inactiveRuleId);

    expect(active).toBeDefined();
    expect(active?.isActive).toBe(true);
    expect(inactive).toBeUndefined();
  });

  it('filtre par type d’aléa', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules?hazardType=VENT_VIOLENT')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(200);
    const rules = res.body.data as Array<{ id: string; hazardType: string }>;
    expect(rules.every((r) => r.hazardType === 'VENT_VIOLENT')).toBe(true);
    expect(rules.some((r) => r.id === activeRuleId)).toBe(true);
    expect(rules.some((r) => r.id === inactiveRuleId)).toBe(false);
  });

  it('permet de lister les règles inactives avec isActive=false (SUPER_ADMIN)', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules?isActive=false')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(200);
    const rules = res.body.data as Array<{ id: string; isActive: boolean }>;
    const inactive = rules.find((r) => r.id === inactiveRuleId);
    expect(inactive).toBeDefined();
    expect(inactive?.isActive).toBe(false);
    expect(rules.every((r) => r.isActive === false)).toBe(true);
  });

  it('rejette un hazardType inconnu en 422', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules?hazardType=TSUNAMI')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/detection-rules/:id', () => {
  it('retourne la règle active demandée', async () => {
    const res = await request(app)
      .get(`/api/v1/detection-rules/${activeRuleId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(activeRuleId);
    expect(res.body.data.hazardType).toBe('VENT_VIOLENT');
    expect(res.body.data.operator).toBe('GE');
    expect(res.body.data.threshold).toBe(80);
    expect(Array.isArray(res.body.data.severityRules)).toBe(true);
  });

  it('retourne 404 pour une règle inexistante', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(404);
  });

  it('retourne 422 pour un id non-uuid', async () => {
    const res = await request(app)
      .get('/api/v1/detection-rules/abc')
      .set('Authorization', `Bearer ${superAdmin.token}`);

    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/detection-rules', () => {
  const validBody = {
    hazardType: 'FORTE_PLUIE',
    metric: 'rainfall_24h_mm',
    operator: 'GT',
    threshold: 120,
    durationMinutes: 0,
    forecastHorizonHours: 0,
    severityRules: [{ level: 'ELEVEE', min: 75 }],
  };

  it('retourne 401 sans jeton', async () => {
    const res = await request(app).post('/api/v1/detection-rules').send(validBody);
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un CLIENT', async () => {
    const res = await request(app)
      .post('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${client.token}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('rejette un opérateur BETWEEN sans thresholdMax en 422', async () => {
    const res = await request(app)
      .post('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ ...validBody, operator: 'BETWEEN', thresholdMax: undefined });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('crée une règle (SUPER_ADMIN) et la retrouve en base', async () => {
    const res = await request(app)
      .post('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const rule = res.body.data;
    createdRuleIds.push(rule.id);
    expect(rule.hazardType).toBe('FORTE_PLUIE');
    expect(rule.metric).toBe('rainfall_24h_mm');
    expect(rule.operator).toBe('GT');
    expect(rule.threshold).toBe(120);
    expect(rule.isActive).toBe(true);
    expect(rule.createdBy).toBe(superAdmin.id);
    expect(rule.severityRules).toEqual([{ level: 'ELEVEE', min: 75 }]);

    const fetched = await request(app)
      .get(`/api/v1/detection-rules/${rule.id}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.threshold).toBe(120);
  });
});

describe('PATCH /api/v1/detection-rules/:id', () => {
  it('met à jour le seuil et l’activité d’une règle', async () => {
    const create = await request(app)
      .post('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        hazardType: 'VENT_VIOLENT',
        metric: 'wind',
        operator: 'GT',
        threshold: 90,
      });
    expect(create.status).toBe(201);
    const ruleId = create.body.data.id as string;
    createdRuleIds.push(ruleId);

    const res = await request(app)
      .patch(`/api/v1/detection-rules/${ruleId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ threshold: 70, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.threshold).toBe(70);
    expect(res.body.data.isActive).toBe(false);
  });

  it('retourne 404 pour une règle inexistante', async () => {
    const res = await request(app)
      .patch('/api/v1/detection-rules/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ threshold: 10 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/detection-rules/:id', () => {
  it('supprime une règle puis retourne 404 à la lecture', async () => {
    const create = await request(app)
      .post('/api/v1/detection-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        hazardType: 'SECHERESSE',
        metric: 'temperature',
        operator: 'GE',
        threshold: 40,
      });
    expect(create.status).toBe(201);
    const ruleId = create.body.data.id as string;

    const del = await request(app)
      .delete(`/api/v1/detection-rules/${ruleId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(del.status).toBe(204);

    const fetched = await request(app)
      .get(`/api/v1/detection-rules/${ruleId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(fetched.status).toBe(404);
  });

  it('retourne 404 pour une règle déjà absente', async () => {
    const res = await request(app)
      .delete('/api/v1/detection-rules/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(404);
  });
});

describe('Intégrité des tables existantes', () => {
  it("les données territoriales existantes restent intactes", async () => {
    const regions = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM regions');
    const districts = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM districts',
    );
    const communes = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM communes',
    );

    expect(parseInt(regions.rows[0].count, 10)).toBeGreaterThan(0);
    expect(parseInt(districts.rows[0].count, 10)).toBeGreaterThan(0);
    expect(parseInt(communes.rows[0].count, 10)).toBeGreaterThan(0);
  });
});