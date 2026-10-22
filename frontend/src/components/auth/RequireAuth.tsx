import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';

export function RequireAuth() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!bootstrapped) {
    return (
      <SkeletonGroup
        label="Initialisation…"
        className="flex min-h-screen items-center justify-center p-6"
      >
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </SkeletonGroup>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
