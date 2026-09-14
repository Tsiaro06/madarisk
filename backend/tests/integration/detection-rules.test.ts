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
let activeRuleId: string;
let inactiveRuleId: string;

function makeEmail(suffix: string): string {
  return `det_${suffix}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: 'SUPER_ADMIN'): Promise<{ id: string; token: string }> {
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
  await db.query('DELETE FROM hazard_detection_rules WHERE id IN ($1, $2)', [
    activeRuleId,
    inactiveRuleId,
  ]);
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