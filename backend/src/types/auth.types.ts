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

/**
 * Acteur d'une opération métier : un utilisateur authentifié, ou le système
 * pour les exécutions planifiées. `id` est volontairement nullable car
 * `audit_logs.user_id` référence `users(id)` : un acteur système n'a pas de
 * ligne dans `users` et son audit est donc attribué à NULL.
 */
export interface ActorRef {
  id: string | null;
  role: UserRole;
}

export const SYSTEM_ACTOR: ActorRef = { id: null, role: 'SUPER_ADMIN' };

export interface UsersListResult {
  users: SanitizedUser[];
  page: number;
  limit: number;
  total: number;
}
