import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('Documentation interactive (Swagger UI)', () => {
  it('GET /api/docs/ sert la documentation (200, HTML, titre Swagger UI)', async () => {
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
    expect(res.text).toContain('MadaRisk Map - API Docs');
  });

  it('GET /api/docs (sans slash) redirige vers /api/docs/ (301)', async () => {
    const res = await request(app).get('/api/docs');

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/api/docs/');
  });

  it('GET /api-docs (alias) sert la documentation (suivi de redirection)', async () => {
    const res = await request(app).get('/api-docs').redirects(1);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('GET /api/docs/swagger.json sert la spécification OpenAPI complète', async () => {
    const res = await request(app).get('/api/docs/swagger.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('MadaRisk Map - API Backend');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(50);
  });
});