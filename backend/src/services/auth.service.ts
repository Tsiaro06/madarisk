import { AppError } from '../utils/app-error';
import { password } from '../utils/password';
import { tokens } from '../utils/tokens';
import { usersRepository } from '../repositories/users.repository';
import { env } from '../config/env';
import { AuthTokens, SanitizedUser } from '../types/auth.types';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function parseExpiresIn(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return amount * 1000;
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

function clientInfo(req: RequestContext) {
  const ua = req.headers?.['user-agent'];
  return {
    ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}

export const authService = {
  async register(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }, req: RequestContext): Promise<{ user: SanitizedUser }> {
    const userCount = await usersRepository.countUsers();

    if (userCount > 0) {
      throw AppError.forbidden('Inscription non autorisée : seul un SUPER_ADMIN peut créer des utilisateurs');
    }

    const existing = await usersRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('Un compte avec cet email existe déjà');
    }

    const passwordHash = await password.hash(input.password);
    const user = await usersRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'SUPER_ADMIN',
    });

    const info = clientInfo(req);
    await usersRepository.writeAudit({
      userId: user.id,
      action: 'USER_REGISTER',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress: info.ipAddress,
    });

    return { user: usersRepository.sanitizeUser(user) };
  },

  async login(
    input: { email: string; password: string },
    req: RequestContext,
  ): Promise<AuthTokens & { user: SanitizedUser }> {
    const user = await usersRepository.findByEmail(input.email);
    if (!user) {
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw AppError.forbidden('Compte désactivé');
    }

    const valid = await password.compare(input.password, user.passwordHash);
    if (!valid) {
      const info = clientInfo(req);
      await usersRepository.writeAudit({
        userId: user.id,
        action: 'USER_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: info.ipAddress,
      });
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    await usersRepository.updateLastLogin(user.id);

    const { token: refreshToken } = tokens.generateRefreshToken(user.id);
    const refreshTokenHash = tokens.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN));
    const info = clientInfo(req);

    await usersRepository.createSession({
      userId: user.id,
      refreshTokenHash,
      expiresAt,
      ipAddress: info.ipAddress,
      userAgent: info.userAgent,
    });

    await usersRepository.writeAudit({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: info.ipAddress,
    });

    const accessToken = tokens.generateAccessToken(user.id, user.role);

    return {
      accessToken,
      refreshToken,
      user: usersRepository.sanitizeUser(user),
    };
  },

  async refresh(
    refreshToken: string,
    req: RequestContext,
  ): Promise<AuthTokens & { user: SanitizedUser }> {
    let payload;
    try {
      payload = tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Refresh token invalide ou expiré');
    }

    if (payload.type !== 'refresh') {
      throw AppError.unauthorized('Token invalide');
    }

    const refreshTokenHash = tokens.hashRefreshToken(refreshToken);
    const session = await usersRepository.findActiveSessionByHash(refreshTokenHash);
    if (!session) {
      throw AppError.unauthorized('Session invalide');
    }

    const user = await usersRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('Utilisateur introuvable ou désactivé');
    }

    await usersRepository.revokeSession(session.id);

    const { token: newRefreshToken } = tokens.generateRefreshToken(user.id);
    const expiresAt = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN));
    const info = clientInfo(req);

    await usersRepository.createSession({
      userId: user.id,
      refreshTokenHash: tokens.hashRefreshToken(newRefreshToken),
      expiresAt,
      ipAddress: info.ipAddress,
      userAgent: info.userAgent,
    });

    const accessToken = tokens.generateAccessToken(user.id, user.role);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: usersRepository.sanitizeUser(user),
    };
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const refreshTokenHash = tokens.hashRefreshToken(refreshToken);
    const session = await usersRepository.findActiveSessionByHash(refreshTokenHash);
    if (session) {
      await usersRepository.revokeSession(session.id);
    }
  },
};
