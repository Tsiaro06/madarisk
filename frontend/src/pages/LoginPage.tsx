import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ApiClientError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useToast } from '@/components/ui/Toast';

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = window.setInterval(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [retryAfter]);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from || '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (retryAfter > 0) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast('Connexion réussie', 'success');
        navigate('/', { replace: true });
      } else {
        await register({ firstName, lastName, email, password });
        toast('Compte SUPER_ADMIN créé. Vous pouvez vous connecter.', 'success');
        setMode('login');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 429) {
          const wait = err.retryAfter && err.retryAfter > 0 ? err.retryAfter : 60;
          setRetryAfter(wait);
          setError(`Trop de tentatives. Réessayez dans ${wait}s.`);
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur inattendue');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(10,107,110,0.25),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(196,92,38,0.18),transparent_40%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-brand/15 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Salle de crise</p>
        <h1 className="mt-2 font-display text-3xl text-ink">MadaRisk Map</h1>
        <p className="mt-2 text-sm text-muted">
          Accès sécurisé au poste de cartographie des risques.
        </p>

        <div className="mt-6 flex rounded-xl bg-brand-soft p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 font-medium ${mode === 'login' ? 'bg-white shadow text-ink' : 'text-muted'}`}
            onClick={() => setMode('login')}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 font-medium ${mode === 'register' ? 'bg-white shadow text-ink' : 'text-muted'}`}
            onClick={() => setMode('register')}
          >
            1er SUPER_ADMIN
          </button>
        </div>

        {error ? (
          <AlertBanner tone="danger" className="mt-4" title="Échec">
            {error}
            {retryAfter > 0 ? ` (${retryAfter}s)` : null}
          </AlertBanner>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          {mode === 'register' ? (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          ) : null}
          <Input
            label="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <Button type="submit" className="w-full" loading={loading} disabled={retryAfter > 0}>
            {retryAfter > 0
              ? `Attendre ${retryAfter}s`
              : mode === 'login'
                ? 'Se connecter'
                : 'Créer le compte'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Accès réservé aux opérateurs autorisés.{' '}
          <Link to="/" className="text-brand underline-offset-2 hover:underline">
            Retour
          </Link>
        </p>
      </div>
    </div>
  );
}
