import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'ANALYSTE_SIG' | 'CLIENT';

let admin: { id: string; token: string };
let analyste: { id: string; token: string };
let client: { id: string; token: string };

let eventId: string;
let sampleCommuneId: string;

function makeEmail(role: string): string {
  return `reports_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
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

async function cleanupReportFiles(userIds: string[]): Promise<void> {
  const result = await db.query<{ file_path: string }>(
    `SELECT file_path FROM reports WHERE generated_by = ANY($1::uuid[])`,
    [userIds],
  );
  for (const row of result.rows) {
    if (!row.file_path) continue;
    try {
      await fs.unlink(path.resolve(process.cwd(), row.file_path));
    } catch {
      // fichier déjà supprimé ou inexistant
    }
  }
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  analyste = await createUserAndLogin('ANALYSTE_SIG');
  client = await createUserAndLogin('CLIENT');

  const created = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      eventCode: `CY-RP-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: 'Cyclone test report',
      type: 'CYCLONE',
      status: 'ACTIF',
      severity: 'ELEVEE',
      description: 'Événement de test pour les rapports',
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      expectedEndAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  eventId = created.body.data.id as string;

  const commune = await db.query<{ id: string }>(
    'SELECT id FROM communes ORDER BY name LIMIT 1',
  );
  sampleCommuneId = commune.rows[0].id;
});

afterAll(async () => {
  const userIds = [admin.id, analyste.id, client.id];
  await cleanupReportFiles(userIds);
  await db.query(
    `DELETE FROM reports WHERE generated_by = ANY($1::uuid[])`,
    [userIds],
  );
  await db.query(`DELETE FROM hazard_events WHERE created_by = ANY($1::uuid[])`, [userIds]);
  await db.query(
    `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );
  await db.query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  await db.pool.end();
});

describe('Reports - contrôle d accès', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get('/api/v1/reports');
    expect(res.status).toBe(401);
  });

  it('refuse l export CSV sans ressource valide (400)', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/csv')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'inconnu' });
    expect(res.status).toBe(422);
  });

  it('réserve dashboard, liste et PDF aux ADMIN / SUPER_ADMIN', async () => {
    for (const url of ['/api/v1/reports', '/api/v1/reports/dashboard']) {
      const res = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${client.token}`);
      expect(res.status).toBe(403);
    }
    const pdf = await request(app)
      .post('/api/v1/reports/export/pdf')
      .set('Authorization', `Bearer ${client.token}`)
      .send({});
    expect(pdf.status).toBe(403);
  });

  it('autorise tout rôle authentifié pour les exports CSV/GeoJSON', async () => {
    const csv = await request(app)
      .post('/api/v1/reports/export/csv')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ resourceType: 'communes' });
    expect(csv.status).toBe(200);

    const geojson = await request(app)
      .post('/api/v1/reports/export/geojson')
      .set('Authorization', `Bearer ${analyste.token}`)
      .send({ resourceType: 'communes', communeId: sampleCommuneId });
    expect(geojson.status).toBe(200);
  });
});

describe('Reports - export CSV', () => {
  it('exporte les communes en CSV UTF-8 avec BOM', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/csv')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'communes' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('export-communes.csv');
    expect(res.headers['x-report-id']).toBeDefined();
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('Code commune');
    expect(res.text).toContain('Commune');

    const commune = await db.query<{ name: string }>(
      'SELECT name FROM communes ORDER BY name LIMIT 1',
    );
    expect(res.text).toContain(commune.rows[0].name);

    const rowCount = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM communes',
    );
    const lines = res.text.trim().split('\n').length;
    expect(lines - 1).toBe(parseInt(rowCount.rows[0].count, 10));
  });

  it('refuse une plage de dates incohérente (422)', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/csv')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        resourceType: 'events',
        dateFrom: '2026-01-10',
        dateTo: '2026-01-01',
      });
    expect(res.status).toBe(422);
  });
});

describe('Reports - export GeoJSON', () => {
  it('exporte les communes en FeatureCollection', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/geojson')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'communes', communeId: sampleCommuneId });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('geo+json');
    expect(res.headers['content-disposition']).toContain('export-communes.geojson');
    expect(res.headers['x-report-id']).toBeDefined();

    const body = JSON.parse(res.text);
    expect(body.type).toBe('FeatureCollection');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features).toHaveLength(1);
    expect(body.features[0].type).toBe('Feature');
    expect(body.features[0].properties.communeName).toBeDefined();
  });

  it('exige eventId pour event-areas (422)', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/geojson')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'event-areas' });
    expect(res.status).toBe(422);
  });
});

describe('Reports - export PDF', () => {
  it('génère un PDF et l enregistre dans reports', async () => {
    const res = await request(app)
      .post('/api/v1/reports/export/pdf')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Rapport de test' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('rapport-synthetique.pdf');
    expect(res.headers['x-report-id']).toBeDefined();
    expect(res.body instanceof Buffer).toBe(true);
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const row = await db.query<{ format: string; file_path: string | null }>(
      `SELECT format, file_path FROM reports WHERE id = $1`,
      [res.headers['x-report-id'] as string],
    );
    expect(row.rows[0].format).toBe('PDF');
    expect(row.rows[0].file_path).not.toBeNull();
  });
});

describe('Reports - listing et téléchargement', () => {
  it('liste les rapports générés avec pagination', async () => {
    const res = await request(app)
      .get('/api/v1/reports?limit=10')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    const formats = new Set(res.body.data.map((r: { format: string }) => r.format));
    expect(formats.has('PDF')).toBe(true);
  });

  it('télécharge le fichier d un rapport', async () => {
    const exportRes = await request(app)
      .post('/api/v1/reports/export/csv')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'communes' });
    const reportId = exportRes.headers['x-report-id'] as string;

    const res = await request(app)
      .get(`/api/v1/reports/${reportId}/download`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.subarray(0, 3).toString()).toBe('\uFEFF');
  });

  it('renvoie 404 si le fichier du rapport est absent', async () => {
    const result = await db.query<{ id: string }>(
      `INSERT INTO reports
         (generated_by, title, report_type, format, file_path, parameters, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING id`,
      [
        admin.id,
        'Rapport orphelin',
        'PDF',
        'PDF',
        'uploads/reports/fichier-absent.pdf',
        JSON.stringify({ resourceType: 'pdf' }),
      ],
    );
    const orphanId = result.rows[0].id;

    const res = await request(app)
      .get(`/api/v1/reports/${orphanId}/download`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});

describe('Reports - rapport événement', () => {
  it('renvoie le résumé d un événement pour tout rôle', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/events/${eventId}`)
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.event).not.toBeNull();
    expect(data.event.name).toBe('Cyclone test report');
    expect(data.areas.type).toBe('FeatureCollection');
    expect(Array.isArray(data.exposedCommunes)).toBe(true);
    expect(typeof data.exposedPopulation).toBe('number');
    expect(typeof data.riskDistribution).toBe('object');
    expect(data.weather).toHaveProperty('available');
    expect(Array.isArray(data.alerts)).toBe(true);
  });
});