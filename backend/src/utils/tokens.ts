import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { UserRole, JwtAccessPayload, JwtRefreshPayload } from '../types/auth.types';

const ACCESS_SECRET = env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = env.JWT_REFRESH_SECRET;

function sign(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as SignOptions);
}

export const tokens = {
  generateAccessToken(userId: string, role: UserRole): string {
    const payload: JwtAccessPayload = { sub: userId, role, type: 'access' };
    return sign(payload, ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN);
  },

  generateRefreshToken(userId: string): { token: string; jti: string } {
    const jti = crypto.randomUUID();
    const payload: JwtRefreshPayload = { sub: userId, jti, type: 'refresh' };
    const token = sign(payload, REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN);
    return { token, jti };
  },

  verifyAccessToken(token: string): JwtAccessPayload {
    return jwt.verify(token, ACCESS_SECRET) as JwtAccessPayload;
  },

  verifyRefreshToken(token: string): JwtRefreshPayload {
    return jwt.verify(token, REFRESH_SECRET) as JwtRefreshPayload;
  },

  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },
};
