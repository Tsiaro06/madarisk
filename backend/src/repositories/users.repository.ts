import { db } from '../config/database';
import { User, UserWithPassword, SanitizedUser, Session, UserRole } from '../types/auth.types';

interface UserRow {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapUser(row: UserRow): UserWithPassword {
  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sanitizeUser(user: UserWithPassword | User): SanitizedUser {
  const base: SanitizedUser = {
    id: user.id,
    organizationId: user.organizationId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  return base;
}

const USER_SELECT = `
  id, organization_id, first_name, last_name, email, password_hash,
  role::text AS role, is_active, last_login_at, created_at, updated_at
`;

export const usersRepository = {
  sanitizeUser,

  async countUsers(): Promise<number> {
    const result = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM users');
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const result = await db.query<UserRow>(`SELECT ${USER_SELECT} FROM users WHERE email = $1`, [
      email,
    ]);
    if (!result.rows[0]) return null;
    return mapUser(result.rows[0]);
  },

  async findById(id: string): Promise<UserWithPassword | null> {
    const result = await db.query<UserRow>(`SELECT ${USER_SELECT} FROM users WHERE id = $1`, [id]);
    if (!result.rows[0]) return null;
    return mapUser(result.rows[0]);
  },

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId?: string | null;
  }): Promise<UserWithPassword> {
    const result = await db.query<UserRow>(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_SELECT}`,
      [
        data.email,
        data.passwordHash,
        data.firstName,
        data.lastName,
        data.role,
        data.organizationId ?? null,
      ],
    );
    return mapUser(result.rows[0]);
  },

  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: UserRole;
    },
  ): Promise<UserWithPassword | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.firstName !== undefined) {
      sets.push(`first_name = $${idx++}`);
      values.push(data.firstName);
    }
    if (data.lastName !== undefined) {
      sets.push(`last_name = $${idx++}`);
      values.push(data.lastName);
    }
    if (data.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(data.email);
    }
    if (data.role !== undefined) {
      sets.push(`role = $${idx++}`);
      values.push(data.role);
    }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await db.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING ${USER_SELECT}`,
      values,
    );
    if (!result.rows[0]) return null;
    return mapUser(result.rows[0]);
  },

  async updateStatus(id: string, isActive: boolean): Promise<UserWithPassword | null> {
    const result = await db.query<UserRow>(
      `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING ${USER_SELECT}`,
      [isActive, id],
    );
    if (!result.rows[0]) return null;
    return mapUser(result.rows[0]);
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  },

  async updateLastLogin(id: string): Promise<void> {
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  },

  async countActiveSuperAdmins(excludeId?: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users
       WHERE role = 'SUPER_ADMIN' AND is_active = true AND ($1::uuid IS NULL OR id <> $1::uuid)`,
      [excludeId ?? null],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  async list(params: {
    page: number;
    limit: number;
    role?: UserRole;
    isActive?: boolean;
    search?: string;
  }): Promise<{ rows: UserWithPassword[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.role) {
      conditions.push(`role = $${idx++}`);
      values.push(params.role);
    }
    if (params.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(params.isActive);
    }
    if (params.search) {
      conditions.push(
        `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const offset = (params.page - 1) * params.limit;
    values.push(params.limit, offset);
    const result = await db.query<UserRow>(
      `SELECT ${USER_SELECT} FROM users ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values,
    );

    return { rows: result.rows.map(mapUser), total };
  },

  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<Session> {
    const result = await db.query<{
      id: string;
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      ip_address: string | null;
      user_agent: string | null;
      revoked_at: string | null;
      created_at: string;
    }>(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, refresh_token_hash, expires_at, ip_address, user_agent, revoked_at, created_at`,
      [
        data.userId,
        data.refreshTokenHash,
        data.expiresAt,
        data.ipAddress ?? null,
        data.userAgent ?? null,
      ],
    );
    const r = result.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      refreshTokenHash: r.refresh_token_hash,
      expiresAt: r.expires_at,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    };
  },

  async findActiveSessionByHash(refreshTokenHash: string): Promise<Session | null> {
    const result = await db.query<{
      id: string;
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      ip_address: string | null;
      user_agent: string | null;
      revoked_at: string | null;
      created_at: string;
    }>(
      `SELECT id, user_id, refresh_token_hash, expires_at, ip_address, user_agent, revoked_at, created_at
       FROM user_sessions
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [refreshTokenHash],
    );
    if (!result.rows[0]) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      refreshTokenHash: r.refresh_token_hash,
      expiresAt: r.expires_at,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    };
  },

  async revokeSession(sessionId: string): Promise<void> {
    await db.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  },

  async writeAudit(data: {
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string | null;
  }): Promise<void> {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.userId ?? null,
        data.action,
        data.entityType ?? null,
        data.entityId ?? null,
        data.oldValue !== undefined ? JSON.stringify(data.oldValue) : null,
        data.newValue !== undefined ? JSON.stringify(data.newValue) : null,
        data.ipAddress ?? null,
      ],
    );
  },
};
