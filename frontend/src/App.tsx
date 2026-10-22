import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { AppRouter } from '@/routes/AppRouter';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { RealtimeListener } from '@/lib/realtime';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthBootstrap({ children }: { children: ReactNode }) {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped) {
    return (
      <SkeletonGroup
        label="Démarrage de MadaRisk…"
        className="flex min-h-screen items-center justify-center p-6"
      >
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </SkeletonGroup>
    );
  }

  return (
    <>
      {children}
      <RealtimeListener />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthBootstrap>
          <AppRouter />
        </AuthBootstrap>
      </ToastProvider>
    </QueryClientProvider>
  );
}
