import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { resolvePostLoginPath } from '@/lib/roles';
import { useToast } from '@/components/ui/Toast';
import { BrandLogo } from '@/components/auth/BrandLogo';
import { LoginPanel } from '@/components/auth/LoginPanel';
import { LoginForm } from '@/components/auth/LoginForm';
import { InstallSuperAdminForm } from '@/components/auth/InstallSuperAdminForm';
import type { SanitizedUser } from '@/types';

type Mode = 'login' | 'install';

/**
 * Page de connexion — écran partagé :
 *   - panneau visuel bleu nuit + illustration cartographique à gauche (`lg+`) ;
 *   - formulaire sur carte arrondie à droite (les champs restent utilisables
 *     au clavier et au tactile, sans débordement horizontal).
 */
export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('login');

  // Visiteur déjà authentifié : retour vers la page d'origine (écrite par
  // `RequireAuth`), sinon vers l'accueil du rôle.
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={resolvePostLoginPath(user.role, from)} replace />;
  }

  const handleSuccess = (authenticated: SanitizedUser) => {
    toast('Connexion réussie', 'success');
    const from = (location.state as { from?: string } | null)?.from;
    navigate(resolvePostLoginPath(authenticated.role, from), { replace: true });
  };

  return (
    <main className="login-fade min-h-dvh bg-canvas lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:overflow-hidden">
      <LoginPanel />

      <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:overflow-y-auto lg:rounded-l-[2.5rem] lg:shadow-[-18px_0_50px_-30px_rgba(10,26,40,0.5)]">
        <div className="flex w-full max-w-md flex-col sm:max-w-lg">
          <div className="mb-8 lg:hidden">
            <BrandLogo className="h-14" />
          </div>

          <div className="w-full rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_50px_-30px_rgba(10,26,40,0.4)] sm:p-9">
            {mode === 'install' ? (
              <InstallSuperAdminForm
                onDone={() => setMode('login')}
                onCancel={() => setMode('login')}
              />
            ) : (
              <LoginForm
                onSuccess={handleSuccess}
                onSwitchToInstall={() => setMode('install')}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}