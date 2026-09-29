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

/**
 * Écran d'accueil par rôle, utilisé après une connexion réussie.
 *
 * La carte de crise (`/`) est aujourd'hui le point d'entrée des quatre rôles :
 * elle s'adapte aux droits (création d'événement, rafraîchissement météo,
 * export… pour `ADMIN`/`SUPER_ADMIN`, lecture seule sinon). La table reste
 * centralisée ici pour qu'un tableau de bord dédié soit ajoutable sans
 * toucher à la page de connexion.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: '/',
  ADMIN: '/',
  ANALYSTE_SIG: '/',
  CLIENT: '/',
};

/**
 * Chemin de redirection après connexion.
 *
 * La destination mémorisée par `RequireAuth` (propagation vers `/login`) passe
 * en priorité, puis l'accueil du rôle. Seuls les chemins internes absolus sont
 * acceptés : une valeur `//evil.example` injectée dans le state de navigation
 * ne doit jamais produire une redirection externe.
 */
export function resolvePostLoginPath(role: UserRole | undefined, from?: unknown): string {
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from;
  }
  return (role && ROLE_HOME[role]) || '/';
}
