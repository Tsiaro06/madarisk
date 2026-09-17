import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';

/**
 * En environnement de test (mode normal, DEMO_MODE=false), les routes de
 * démonstration doivent être indiscernables de routes inexistantes.
 */
describe('Routes /api/v1/demo/* hors mode démonstration', () => {
  it('GET /api/v1/demo/scenario répond 404', async () => {
    const res = await request(app).get('/api/v1/demo/scenario');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/demo/step répond 404', async () => {
    const res = await request(app).post('/api/v1/demo/step').send({ step: 'ACTIF' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/demo/reset répond 404', async () => {
    const res = await request(app).post('/api/v1/demo/reset');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

afterAll(async () => {
  await db.pool.end();
});
