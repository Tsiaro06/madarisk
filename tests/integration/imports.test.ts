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
let importId = '';
let districtAdminCode: string;

const geoJsonPath = path.join(__dirname, '..', 'fixtures', 'districts.geojson');
const invalidGeoJsonPath = path.join(__dirname, '..', 'fixtures', 'invalid.geojson');
const csvPath = path.join(__dirname, '..', 'fixtures', 'districts.csv');
const jsonPath = path.join(__dirname, '..', 'fixtures', 'districts.json');
const badTxtPath = path.join(__dirname, '..', 'fixtures', 'bad.txt');

beforeAll(async () => {
  const email = `tch_imports_${Date.now()}@madarisk.test`;
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: 'Import',
    lastName: 'Tester',
    role: 'SUPER_ADMIN',
  });
  userId = user.id;

  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  accessToken = login.body.data.accessToken;

  const d = await db.query<{ adminCode: string }>(
    `SELECT admin_code AS "adminCode" FROM districts WHERE normalized_name = 'MAROANTSETRA' LIMIT 1`,
  );
  districtAdminCode = d.rows[0].adminCode;
});

afterAll(async () => {
  await db.query('DELETE FROM territory_matching WHERE source_record_id IN (SELECT id FROM source_records WHERE import_id IN (SELECT id FROM territory_imports WHERE imported_by = $1))', [userId]);
  await db.query('DELETE FROM source_records WHERE import_id IN (SELECT id FROM territory_imports WHERE imported_by = $1)', [userId]);
  await db.query('DELETE FROM territory_imports WHERE imported_by = $1', [userId]);
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  await db.pool.end();
});

async function uploadRejected(
  filePath: string,
  contentType: string,
  retries = 3,
): Promise<request.Response> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', filePath, { contentType });
      return res;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ECONNRESET' && attempt < retries - 1) continue;
      throw err;
    }
  }
  throw new Error('uploadRejected exhausted retries');
}

describe('Imports - accès', () => {
  it('refuse acces sans authentification', async () => {
    const res = await request(app).get('/api/v1/imports');
    expect(res.status).toBe(401);
  });
});

describe('Imports - GeoJSON', () => {
  it('importe une FeatureCollection valide', async () => {
    const res = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('territoryType', 'DISTRICT')
      .attach('file', geoJsonPath, { contentType: 'application/geo+json' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.importId).toBeDefined();
    expect(res.body.data.validRecords).toBe(1);
    expect(res.body.data.invalidRecords).toBe(0);
    importId = res.body.data.importId;
  });
});

describe('Imports - CSV & JSON', () => {
  it('importe un CSV valide', async () => {
    const res = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('territoryType', 'DISTRICT')
      .attach('file', csvPath, { contentType: 'text/csv' });
    expect(res.status).toBe(201);
    expect(res.body.data.validRecords).toBe(2);
  });

  it('importe un JSON tabulaire valide', async () => {
    const res = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('territoryType', 'DISTRICT')
      .attach('file', jsonPath, { contentType: 'application/json' });
    expect(res.status).toBe(201);
    expect(res.body.data.validRecords).toBe(1);
  });
});

describe('Imports - refus', () => {
  it('refuse un GeoJSON non FeatureCollection', async () => {
    const res = await uploadRejected(invalidGeoJsonPath, 'application/geo+json');
    expect(res.status).toBe(400);
  });

  it('refuse une extension non autorisee', async () => {
    const res = await uploadRejected(badTxtPath, 'text/plain');
    expect(res.status).toBe(400);
  });

  it('refuse import sans fichier', async () => {
    const res = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('territoryType', 'DISTRICT');
    expect(res.status).toBe(400);
  });
});

describe('Imports - consultation', () => {
  it('liste les imports', async () => {
    const res = await request(app)
      .get('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('detail dun import', async () => {
    const res = await request(app)
      .get(`/api/v1/imports/${importId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.import.id).toBe(importId);
    expect(res.body.data.import.status).toBe('TERMINE');
  });

  it('liste les erreurs dun import', async () => {
    const res = await request(app)
      .get(`/api/v1/imports/${importId}/errors`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('cree un import avec code administratif (code exact)', async () => {
    const content = JSON.stringify([{ nom: 'Maroantsetra', code: districtAdminCode }]);
    const tmpPath = path.join(__dirname, '..', 'fixtures', '_code_district.json');
    fs.writeFileSync(tmpPath, content, 'utf-8');
    const res = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('territoryType', 'DISTRICT')
      .attach('file', tmpPath, { contentType: 'application/json' });
    fs.unlinkSync(tmpPath);
    expect(res.status).toBe(201);
    expect(res.body.data.validRecords).toBe(1);
  });
});
