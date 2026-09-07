import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';

describe('GET /health', () => {
  it('retourne 200 avec le bon format', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('API MadaRisk Map opérationnelle.');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.environment).toBeDefined();
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe('GET /api/v1/system/database-status', () => {
  it('retourne 200 avec le rapport de diagnostic', async () => {
    const res = await request(app).get('/api/v1/system/database-status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.databaseConnected).toBe(true);
    expect(res.body.data.postgresVersion).toBeDefined();
    expect(res.body.data.postgisVersion).toBeDefined();
    expect(typeof res.body.data.postgisEnabled).toBe('boolean');
    expect(typeof res.body.data.districtsTableExists).toBe('boolean');
    expect(typeof res.body.data.communesTableExists).toBe('boolean');
    expect(typeof res.body.data.districtsCount).toBe('number');
    expect(typeof res.body.data.communesCount).toBe('number');
  });
});

afterAll(async () => {
  await db.pool.end();
});
