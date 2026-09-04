import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { authService } from '../../src/services/auth.service';
import { usersService } from '../../src/services/users.service';
import { password } from '../../src/utils/password';

let testUserId: string | null = null;
const testEmail = `test_${Date.now()}@madarisk.test`;
const testPassword = 'Test@1234';

const reqCtx = () => ({ ip: '127.0.0.1', headers: { 'user-agent': 'vitest' } });

beforeAll(async () => {
  const hash = await password.hash(testPassword);
  const user = await usersRepository.create({
    email: testEmail,
    passwordHash: hash,
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
  });
  testUserId = user.id;
});

afterAll(async () => {
  if (testUserId) {
    await db.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM audit_logs WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  }
  await db.pool.end();
});

describe('Service: creation du premier SUPER_ADMIN', () => {
  it('cree un SUPER_ADMIN quand users est vide', async () => {
    const countSpy = vi.spyOn(usersRepository, 'countUsers').mockResolvedValue(0);
    const emailSpy = vi.spyOn(usersRepository, 'findByEmail').mockResolvedValue(null);
    const createSpy = vi.spyOn(usersRepository, 'create').mockResolvedValue({
      id: 'premier-id',
      organizationId: null,
      firstName: 'Premier',
      lastName: 'Admin',
      email: 'premier@madarisk.test',
      passwordHash: 'hash',
      role: 'SUPER_ADMIN',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const auditSpy = vi.spyOn(usersRepository, 'writeAudit').mockResolvedValue();

    const result = await authService.register(
      { firstName: 'Premier', lastName: 'Admin', email: 'premier@madarisk.test', password: 'Admin@1234' },
      reqCtx(),
    );

    expect(result.user.role).toBe('SUPER_ADMIN');
    expect(result.user.passwordHash).toBeUndefined();
    expect(createSpy).toHaveBeenCalledTimes(1);

    countSpy.mockRestore();
    emailSpy.mockRestore();
    createSpy.mockRestore();
    auditSpy.mockRestore();
  });

  it('refuse un register quand un utilisateur existe deja', async () => {
    const countSpy = vi.spyOn(usersRepository, 'countUsers').mockResolvedValue(1);

    await expect(
      authService.register(
        { firstName: 'X', lastName: 'Y', email: 'x@madarisk.test', password: 'Admin@1234' },
        reqCtx(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    countSpy.mockRestore();
  });
});

describe('Service: securite creation SUPER_ADMIN', () => {
  it('refuse la creation de SUPER_ADMIN par un non-SUPER_ADMIN', async () => {
    await expect(
      usersService.create(
        {
          firstName: 'T',
          lastName: 'T',
          email: 'z@madarisk.test',
          password: 'Test@1234',
          role: 'SUPER_ADMIN',
        },
        { id: 'some-id', role: 'ADMIN' },
        reqCtx(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuse la desactivation du dernier SUPER_ADMIN actif', async () => {
    const spy = vi
      .spyOn(usersRepository, 'findById')
      .mockResolvedValue({
        id: 'sa-id',
        organizationId: null,
        firstName: 'SA',
        lastName: 'A',
        email: 'sa@madarisk.test',
        passwordHash: 'hash',
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    const countSpy = vi.spyOn(usersRepository, 'countActiveSuperAdmins').mockResolvedValue(0);

    await expect(
      usersService.updateStatus('sa-id', false, { id: 'actor-id', role: 'SUPER_ADMIN' }, reqCtx()),
    ).rejects.toMatchObject({ statusCode: 409 });

    spy.mockRestore();
    countSpy.mockRestore();
  });
});

describe('Auth HTTP', () => {
  let accessToken = '';
  let refreshToken = '';

  it('login valide retourne des tokens', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: testEmail,
      password: testPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('login invalide retourne 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: testEmail,
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
  });

  it('refresh token fait la rotation', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('me retourne le profil avec un token valide', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(testEmail);
  });

  it('acces sans token retourne 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('admin ne peut pas acceder a la liste users (SUPER_ADMIN only)', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('logout revoque la session', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);
  });
});
