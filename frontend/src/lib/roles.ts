export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ANALYSTE_SIG' | 'CLIENT';

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  ANALYSTE_SIG: 'Analyste SIG',
  CLIENT: 'Client',
};

export function hasRole(userRole: UserRole | undefined, allowed: UserRole[]) {
  if (!userRole) return false;
  return allowed.includes(userRole);
}

export function canManageUsers(role?: UserRole) {
  return role === 'SUPER_ADMIN';
}

export function canManageOps(role?: UserRole) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function canManageImports(role?: UserRole) {
  return role === 'SUPER_ADMIN' || role === 'ANALYSTE_SIG';
}

export function canManageRiskConfig(role?: UserRole) {
  return role === 'SUPER_ADMIN';
}
