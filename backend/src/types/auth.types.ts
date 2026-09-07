export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ANALYSTE_SIG' | 'CLIENT';

export const USER_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'ANALYSTE_SIG', 'CLIENT'];

export interface User {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface SanitizedUser {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtAccessPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface AuthRequestUser {
  id: string;
  role: UserRole;
}

export interface UsersListResult {
  users: SanitizedUser[];
  page: number;
  limit: number;
  total: number;
}
