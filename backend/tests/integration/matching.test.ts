import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

let userId: string;
let accessToken = '';
let districtIdA: string;
let districtIdB: string;
let districtAdminCode: string;

let codeImportId = '';
let nameImportId = '';
let aliasImportId = '';
let codeMatchingId = '';
let sourceRecordId = '';

async function createImport(payload: Array<Record<string, unknown>>): Promise<string> {
  const tmpPath = path.join(__dirname, '..', 'fixtures', '_dynamic_district.json');
  fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf-8');
  const create = await request(app)
    .post('/api/v1/imports')
    .set('Authorization', `Bearer ${accessToken}`)
    .field('territoryType', 'DISTRICT')
    .attach('file', tmpPath, { contentType: 'application/json' });
  fs.unlinkSync(tmpPath);
  expect(create.status).toBe(201);
  return create.body.data.importId;
}

async function runMatching(importId: string): Promise<request.Response> {
  const run = await request(app)
    .post(`/api/v1/matching/run/${importId}`)
    .set('Authorization', `Bearer ${accessToken}`);
  expect(run.status).toBe(200);
  return run;
}

async function createImportAndRun(payload: Array<Record<string, unknown>>): Promise<string> {
  const id = await createImport(payload);
  await runMatching(id);
  return id;
}

beforeAll(async () => {
  const email = `tch_matching_${Date.now()}@madarisk.test`;
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: 'Matching',
    lastName: 'Tester',
    role: 'SUPER_ADMIN',
  });
  userId = user.id;

  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  accessToken = login.body.data.accessToken;

  const d = await db.query<{ id: string; adminCode: string }>(
    `SELECT id, admin_code AS "adminCode" FROM districts WHERE normalized_name = 'MAROANTSETRA' LIMIT 1`,
  );
  districtIdA = d.rows[0].id;
  districtAdminCode = d.rows[0].adminCode;

  const d2 = await db.query<{ id: string }>(
    `SELECT id FROM districts WHERE normalized_name <> 'MAROANTSETRA' ORDER BY normalized_name LIMIT 1`,
  );
  districtIdB = d2.rows[0].id;

  codeImportId = await createImportAndRun([{ nom: 'Maroantsetra', code: districtAdminCode }]);
  nameImportId = await createImportAndRun([{ nom: 'Maroantsetra' }]);
});

afterAll(async () => {
  await db.query('DELETE FROM territory_aliases WHERE district_id = $1 OR district_id = $2', [districtIdA, districtIdB]);
  await db.query('DELETE FROM territory_matching WHERE source_record_id IN (SELECT id FROM source_records WHERE import_id IN (SELECT id FROM territory_imports WHERE imported_by = $1))', [userId]);
  await db.query('DELETE FROM source_records WHERE import_id IN (SELECT id FROM territory_imports WHERE imported_by = $1)', [userId]);
  await db.query('DELETE FROM territory_imports WHERE imported_by = $1', [userId]);
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  await db.pool.end();
});

describe('Matching - accès', () => {
  it('refuse acces sans authentification', async () => {
    const res = await request(app).get('/api/v1/matching');
    expect(res.status).toBe(401);
  });
});

describe('Matching - méthodes', () => {
  it('match code administratif exact (100)', async () => {
    const res = await request(app)
      .get('/api/v1/matching')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ importId: codeImportId });
    expect(res.status).toBe(200);
    const item = res.body.data.find((m: { sourceCode: string }) => m.sourceCode === districtAdminCode);
    expect(item).toBeDefined();
    expect(item.matchMethod).toBe('CODE_ADMINISTRATIF');
    expect(item.confidenceScore).toBe(100);
    expect(item.status).toBe('EN_ATTENTE');
    expect(item.districtId).toBe(districtIdA);
    codeMatchingId = item.id;
  });

  it('match nom normalise (98)', async () => {
    const res = await request(app)
      .get('/api/v1/matching')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ importId: nameImportId });
    expect(res.status).toBe(200);
    const item = res.body.data.find(
      (m: { matchMethod: string }) => m.matchMethod === 'NOM_NORMALISE',
    );
    expect(item).toBeDefined();
    expect(item.confidenceScore).toBe(98);
    expect(item.districtId).toBe(districtIdA);
  });

  it('match via alias (96)', async () => {
    await db.query(
      `INSERT INTO territory_aliases (territory_type, district_id, alias, normalized_alias)
       VALUES ('DISTRICT', $1, 'MAROANTSE', $2)`,
      [districtIdA, 'MAROANTSE'],
    );
    aliasImportId = await createImportAndRun([{ nom: 'Maroantsé' }]);
    const res = await request(app)
      .get('/api/v1/matching')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ importId: aliasImportId });
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item.matchMethod).toBe('ALIAS');
    expect(item.confidenceScore).toBe(96);
    expect(item.districtId).toBe(districtIdA);
  });

  it('detecte une ambiguite (plusieurs candidats)', async () => {
    await db.query(
      `INSERT INTO territory_aliases (territory_type, district_id, alias, normalized_alias)
       VALUES ('DISTRICT', $1, 'DUPDUP', 'DUPDUP'), ('DISTRICT', $2, 'DUPDUP', 'DUPDUP')`,
      [districtIdA, districtIdB],
    );
    const id = await createImport([{ nom: 'Dupdup' }]);
    const run = await runMatching(id);
    expect(run.body.data.ambiguous).toBeGreaterThanOrEqual(1);
    expect(run.body.data.proposed).toBe(0);
  });
});

describe('Matching - décisions', () => {
  it('valide une correspondance', async () => {
    const res = await request(app)
      .post(`/api/v1/matching/${codeMatchingId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDE');
  });

  it('rejette une correspondance sans note renvoie 422', async () => {
    const res = await request(app)
      .post(`/api/v1/matching/${codeMatchingId}/reject`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(422);
  });

  it('rejette une correspondance avec note', async () => {
    const res = await request(app)
      .post(`/api/v1/matching/${codeMatchingId}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Donnée à vérifier' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJETE');
  });

  it('creer une liaison manuelle (MANUEL/100/VALIDE)', async () => {
    const src = await db.query<{ id: string }>(
      `SELECT id FROM source_records WHERE import_id = $1 ORDER BY created_at LIMIT 1`,
      [nameImportId],
    );
    sourceRecordId = src.rows[0].id;
    const res = await request(app)
      .post('/api/v1/matching/manual-link')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sourceRecordId, targetType: 'DISTRICT', districtId: districtIdA });
    expect(res.status).toBe(201);
    const listed = await request(app)
      .get('/api/v1/matching')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ status: 'VALIDE' });
    const linked = listed.body.data.find(
      (m: { matchMethod: string; sourceRecordId: string }) =>
        m.matchMethod === 'MANUEL' && m.sourceRecordId === sourceRecordId,
    );
    expect(linked).toBeDefined();
    expect(linked.confidenceScore).toBe(100);
  });
});

describe('Matching - statistiques', () => {
  it('retourne les statistiques', async () => {
    const res = await request(app)
      .get('/api/v1/matching/statistics')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.byStatus)).toBe(true);
    expect(Array.isArray(res.body.data.byMethod)).toBe(true);
  });
});
