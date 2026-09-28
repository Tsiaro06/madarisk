import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

let userId: string;
let accessToken = '';
let districtId: string;
let communeId: string;

function validGeoJson(g: unknown): boolean {
  if (!g || typeof g !== 'object') return false;
  const obj = g as { type?: string };
  return typeof obj.type === 'string' && !!obj.type;
}

beforeAll(async () => {
  const email = `tch_phase5_${Date.now()}@madarisk.test`;
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: 'Territory',
    lastName: 'Tester',
    role: 'ADMIN',
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
  districtId = d.rows[0].id;

  const c = await db.query<{ id: string }>(
    `SELECT c.id FROM communes c WHERE c.district_id = $1 ORDER BY c.name LIMIT 1`,
    [districtId],
  );
  communeId = c.rows[0].id;
});

afterAll(async () => {
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  await db.pool.end();
});

describe('Territoires - accès', () => {
  it('refuse l acces sans authentification', async () => {
    const res = await request(app).get('/api/v1/territories/districts');
    expect(res.status).toBe(401);
  });
});

describe('Territoires - districts', () => {
  it('liste les districts paginée', async () => {
    const res = await request(app)
      .get('/api/v1/territories/districts')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ page: 1, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].adminCode).toBeDefined();
    expect(res.body.data[0].name).toBeDefined();
  });

  it('le detail dun district contient le centroid GeoJSON et totalCommunes', async () => {
    const res = await request(app)
      .get(`/api/v1/territories/districts/${districtId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(districtId);
    expect(validGeoJson(res.body.data.centroid)).toBe(true);
    expect(typeof res.body.data.totalCommunes).toBe('number');
    expect(res.body.data.totalCommunes).toBeGreaterThan(0);
  });
});

describe('Territoires - communes', () => {
  it('liste les communes filtrée par district', async () => {
    const res = await request(app)
      .get('/api/v1/territories/communes')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ districtId, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((c: { districtId: string }) => c.districtId === districtId)).toBe(true);
    expect(res.body.data[0].districtName).toBe('Maroantsetra');
  });

  it('le detail d une commune contient la propriete district', async () => {
    const res = await request(app)
      .get(`/api/v1/territories/communes/${communeId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.commune.id).toBe(communeId);
    expect(res.body.data.district).toBeDefined();
    expect(res.body.data.district.id).toBe(districtId);
    expect(res.body.data.district.name).toBe('Maroantsetra');
  });

  it('geometrie GeoJSON valide avec includeGeometry', async () => {
    const res = await request(app)
      .get('/api/v1/territories/communes')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ districtId, limit: 1, includeGeometry: true });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(validGeoJson(res.body.data[0].geometry)).toBe(true);
  });

  it('retourne 404 pour une commune introuvable', async () => {
    const res = await request(app)
      .get('/api/v1/territories/communes/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Territoires - recherche', () => {
  it('recherche Maroantsetra dans districts et communes', async () => {
    const res = await request(app)
      .get('/api/v1/territories/search')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ q: 'Maroantsetra' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const hasDistrict = res.body.data.some(
      (r: { type: string; name: string }) => r.type === 'district' && r.name === 'Maroantsetra',
    );
    expect(hasDistrict).toBe(true);

    const communeWithDistrict = res.body.data.find(
      (r: { type: string; district: unknown }) => r.type === 'commune' && !!r.district,
    );
    expect(communeWithDistrict).toBeDefined();
    expect(communeWithDistrict.district.name).toBe('Maroantsetra');
  });

  it('refuse une recherche de moins de 2 caracteres', async () => {
    const res = await request(app)
      .get('/api/v1/territories/search')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ q: 'a' });
    expect(res.status).toBe(422);
  });
});

describe('Territoires - map GeoJSON', () => {
  it('retourne une FeatureCollection de districts valide', async () => {
    const res = await request(app)
      .get('/api/v1/territories/map/districts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.data.features)).toBe(true);
    expect(res.body.data.features.length).toBeGreaterThan(0);
    const feature = res.body.data.features.find(
      (f: { properties: { district: string } }) => f.properties.district === 'Maroantsetra',
    );
    expect(feature).toBeDefined();
    expect(feature.type).toBe('Feature');
    expect(validGeoJson(feature.geometry)).toBe(true);
    expect(feature.properties.districtId).toBe(districtId);
    expect(typeof feature.properties.totalCommunes).toBe('number');
  });

  it('retourne une FeatureCollection de communes valide', async () => {
    const res = await request(app)
      .get('/api/v1/territories/map/communes')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ districtId });
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.data.features)).toBe(true);
    expect(res.body.data.features.length).toBeGreaterThan(0);
    const feature = res.body.data.features[0];
    expect(feature.type).toBe('Feature');
    expect(validGeoJson(feature.geometry)).toBe(true);
    expect(feature.properties.communeId).toBeDefined();
    expect(feature.properties.district).toBe('Maroantsetra');
    expect(typeof feature.properties.riskLevel).not.toBe('undefined');
  });
});
