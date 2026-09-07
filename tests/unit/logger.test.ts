import { describe, it, expect } from 'vitest';
import { reqSerializer } from '../../src/config/logger';

function fakeReq(headers: Record<string, string | string[] | undefined>) {
  return {
    id: 'req-1',
    method: 'GET',
    url: '/api/v1/auth/me',
    query: {},
    params: {},
    headers,
    remoteAddress: '127.0.0.1',
    remotePort: 1234,
  } as never;
}

describe('Sérialisation des logs (réquisition)', () => {
  it('n\'expose jamais le header Authorization', () => {
    const out = reqSerializer(
      fakeReq({ Authorization: 'Bearer eyJhbGciOi...secret', host: 'localhost' }),
    ) as { headers: Record<string, unknown> };

    expect(out.headers).not.toHaveProperty('authorization');
    expect(out.headers).not.toHaveProperty('Authorization');
  });

  it('n\'expose pas cookie ni x-api-key', () => {
    const out = reqSerializer(
      fakeReq({ cookie: 'session=abc', 'x-api-key': 'kv-123', accept: '*/*' }),
    ) as { headers: Record<string, unknown> };

    expect(out.headers).not.toHaveProperty('cookie');
    expect(out.headers).not.toHaveProperty('x-api-key');
    expect(out.headers.accept).toBe('*/*');
  });

  it('conserve les métadonnées utiles', () => {
    const out = reqSerializer(fakeReq({ host: 'localhost' })) as {
      id: string;
      method: string;
      url: string;
      headers: Record<string, unknown>;
    };

    expect(out.id).toBe('req-1');
    expect(out.method).toBe('GET');
    expect(out.url).toBe('/api/v1/auth/me');
    expect(out.headers?.host).toBe('localhost');
  });
});