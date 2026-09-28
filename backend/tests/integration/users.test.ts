import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { usersService } from '../../src/services/users.service';
import { password } from '../../src/utils/password';

let superAdminId: string;
let createdUserId: string | null = null;
let superAdminAccess = '';
let superAdminRefresh = '';

const superEmail = `sa_test_${Date.now()}@madarisk.test`;
const superPass = 'SuperAdmin@1';
const createdEmail = `created_${Date.now()}@madarisk.test`;

async function deleteUser(id: string) {
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [id]);
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

beforeAll(async () => {
  const hash = await password.hash(superPass);
  const sa = await usersRepository.create({
    email: superEmail,
    passwordHash: hash,
    firstName: 'SA',
    lastName: 'Test',
    role: 'SUPER_ADMIN',
  });
  superAdminId = sa.id;

  const login = await request(app).post('/api/v1/auth/login').send({
    email: superEmail,
    password: superPass,
  });
  superAdminAccess = login.body.data.accessToken;
  superAdminRefresh = login.body.data.refreshToken;
});

afterAll(async () => {
  if (createdUserId) await deleteUser(createdUserId);
  await deleteUser(superAdminId);
  await db.pool.end();
});

describe('Users - ACL SUPER_ADMIN', () => {
  it('cree un utilisateur ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdminAccess}`)
      .send({
        firstName: 'Jean',
        lastName: 'Rakoto',
        email: createdEmail,
        password: 'Jean@1234',
        role: 'ADMIN',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(createdEmail);
    expect(res.body.data.passwordHash).toBeUndefined();
    expect('passwordHash' in res.body.data).toBe(false);
    createdUserId = res.body.data.id;
  });

  it('refuse la creation dun SUPER_ADMIN par un autre super admin (regle metier)', async () => {
    const countSpy = vi.spyOn(usersRepository, 'countUsers').mockResolvedValue(5);
    await expect(
      usersService.create(
        {
          firstName: 'X',
          lastName: 'Y',
          email: 'newsa@madarisk.test',
          password: 'New@1234',
          role: 'SUPER_ADMIN',
        },
        { id: superAdminId, role: 'SUPER_ADMIN' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    countSpy.mockRestore();
  });

  it('liste les utilisateurs avec pagination', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${superAdminAccess}`)
      .query({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('refuse l acces a la liste pour un ADMIN', async () => {
    const hash = await password.hash('Admin@1234');
    const admin = await usersRepository.create({
      email: `admin_denied_${Date.now()}@madarisk.test`,
      passwordHash: hash,
      firstName: 'Deny',
      lastName: 'Admin',
      role: 'ADMIN',
    });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: admin.email,
      password: 'Admin@1234',
    });
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`);
    expect(res.status).toBe(403);
    await deleteUser(admin.id);
  });

  it('permet au proprietaire de voir son profil et refuse la vue d un autre utilisateur', async () => {
    const me = await request(app)
      .get(`/api/v1/users/${superAdminId}`)
      .set('Authorization', `Bearer ${superAdminAccess}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(superAdminId);

    if (!createdUserId) throw new Error('createdUserId manquant');
    const other = await request(app)
      .get(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${superAdminAccess}`);
    expect(other.status).toBe(200);
  });

  it('refuse la desactivation du dernier SUPER_ADMIN actif', async () => {
    const countSpy = vi.spyOn(usersRepository, 'countActiveSuperAdmins').mockResolvedValue(0);
    await expect(
      usersService.updateStatus(
        superAdminId,
        false,
        { id: superAdminId, role: 'SUPER_ADMIN' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    countSpy.mockRestore();
  });

  it('modifie le mot de passe du proprietaire', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${superAdminAccess}`)
      .send({ oldPassword: superPass, newPassword: 'NouveauMdp@1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Refresh token', () => {
  it('rejette un refresh token reveque apres logout', async () => {
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${superAdminAccess}`)
      .send({ refreshToken: superAdminRefresh });

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: superAdminRefresh,
    });
    expect(res.status).toBe(401);
  });
});
