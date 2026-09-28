import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/lib/roles';
import { hasRole } from '@/lib/roles';

interface RequireRoleProps {
  roles: UserRole[];
}

export function RequireRole({ roles }: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);

  if (!hasRole(user?.role, roles)) {
    return <Navigate to="/interdit" replace />;
  }

  return <Outlet />;
}
