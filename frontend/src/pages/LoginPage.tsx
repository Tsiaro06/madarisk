import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CloudSun, Droplets, Eye, EyeOff, MapPinned, Shield, Wind } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ApiClientError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: MapPinned,
    title: 'Carte de crise',
    text: 'Suivez une situation en direct, pas à pas.',
  },
  {
    icon: CloudSun,
    title: 'Météo nationale',
    text: 'Pluie, vent et températures à portée de clic.',
  },
  {
    icon: Shield,
    title: 'Risques par commune',
    text: 'Niveaux calculés automatiquement.',
  },
] as const;

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
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 20);
    return () => window.clearTimeout(t);
  }, []);

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
    <div className="login-sky relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:py-14">
      {/* Orbes animés — ambiance ciel */}
      <div
        className="login-orb pointer-events-none -left-32 top-0 size-[28rem] bg-slate-300/40"
        aria-hidden
      />
      <div
        className="login-orb login-orb-alt pointer-events-none -right-24 bottom-[-4rem] size-[26rem] bg-brand/20"
        aria-hidden
      />
      <div
        className="login-orb pointer-events-none left-1/3 top-1/2 size-64 -translate-y-1/2 bg-slate-200/50"
        style={{ animationDuration: '26s' }}
        aria-hidden
      />

      {/* Motifs décoratifs flottants */}
      <CloudSun
        className="login-float pointer-events-none absolute right-[12%] top-[14%] size-10 text-brand/20"
        aria-hidden
      />
      <Droplets
        className="login-float pointer-events-none absolute bottom-[18%] left-[10%] size-8 text-brand/15"
        style={{ animationDelay: '1.2s' }}
        aria-hidden
      />
      <Wind
        className="login-float pointer-events-none absolute right-[22%] bottom-[28%] size-9 text-brand/15"
        style={{ animationDelay: '0.6s' }}
        aria-hidden
      />

      <div
        className={cn(
          'relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-700 md:grid-cols-[1.05fr_1fr]',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        {/* Panneau marque */}
        <aside className="login-panel-glow relative hidden flex-col justify-between overflow-hidden p-9 text-white md:flex lg:p-11">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.2), transparent 45%)',
            }}
            aria-hidden
          />
          <div className="relative">
            <span
              className="login-rise inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur-md"
              style={{ animationDelay: '120ms' }}
            >
              <CloudSun className="size-3.5" /> Plateforme météo & risques
            </span>
            <h1
              className="login-rise mt-7 font-display text-5xl font-semibold leading-[1.05] tracking-tight"
              style={{ animationDelay: '220ms' }}
            >
              MadaRisk
              <span className="block text-white/85">Map</span>
            </h1>
            <p
              className="login-rise mt-4 max-w-sm text-[15px] leading-relaxed text-white/80"
              style={{ animationDelay: '320ms' }}
            >
              Cartographiez la météo et les alertes pour Madagascar — une interface claire,
              même pour une première utilisation.
            </p>
          </div>

          <ul className="relative mt-10 space-y-3">
            {FEATURES.map((item, i) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.title}
                  className="login-rise flex items-start gap-3 rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm transition hover:bg-white/15"
                  style={{ animationDelay: `${420 + i * 100}ms` }}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-white/75">
                      {item.text}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Formulaire */}
        <div className="relative flex flex-col justify-center p-6 sm:p-9 lg:p-11">
          <div className="login-rise md:hidden" style={{ animationDelay: '80ms' }}>
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-brand font-display text-lg font-bold text-white">
              M
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold text-ink">MadaRisk Map</h2>
          </div>

          <p
            className="login-rise text-xs font-semibold uppercase tracking-[0.18em] text-brand"
            style={{ animationDelay: '140ms' }}
          >
            Accès sécurisé
          </p>
          <h2
            className="login-rise mt-2 hidden font-display text-3xl font-semibold text-ink md:block"
            style={{ animationDelay: '200ms' }}
          >
            Bon retour
          </h2>
          <p
            className="login-rise mt-2 text-sm text-muted"
            style={{ animationDelay: '260ms' }}
          >
            Connectez-vous pour ouvrir la carte et suivre la situation.
          </p>

          <div
            className="login-rise relative mt-6 grid grid-cols-2 rounded-2xl bg-brand-soft/80 p-1 text-sm"
            style={{ animationDelay: '320ms' }}
            role="tablist"
            aria-label="Mode d’accès"
          >
            <span
              className={cn(
                'absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out',
                mode === 'register' && 'translate-x-full',
              )}
              aria-hidden
            />
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={cn(
                'relative z-10 rounded-xl py-2.5 font-medium transition-colors',
                mode === 'login' ? 'text-ink' : 'text-muted hover:text-ink',
              )}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Connexion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={cn(
                'relative z-10 rounded-xl py-2.5 font-medium transition-colors',
                mode === 'register' ? 'text-ink' : 'text-muted hover:text-ink',
              )}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              1er SUPER_ADMIN
            </button>
          </div>

          {error ? (
            <div className="login-rise mt-4" key={error}>
              <AlertBanner tone="danger" title="Échec">
                {error}
                {retryAfter > 0 ? ` (${retryAfter}s)` : null}
              </AlertBanner>
            </div>
          ) : null}

          <form
            className="login-rise mt-5 space-y-3.5"
            style={{ animationDelay: '400ms' }}
            onSubmit={onSubmit}
            key={mode}
          >
            {mode === 'register' ? (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Prénom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="h-11 rounded-xl"
                />
                <Input
                  label="Nom"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="h-11 rounded-xl"
                />
              </div>
            ) : null}
            <Input
              label="E-mail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl"
              placeholder="vous@organisation.mg"
            />
            <div className="relative">
              <Input
                label="Mot de passe"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 rounded-xl pr-11"
              />
              <button
                type="button"
                className="absolute right-2.5 top-[2.125rem] rounded-lg p-1.5 text-muted transition hover:bg-brand-soft hover:text-brand-deep"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button
              type="submit"
              size="lg"
              className="group mt-1 w-full rounded-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(47,95,120,0.22)] active:translate-y-0"
              loading={loading}
              disabled={retryAfter > 0}
            >
              {retryAfter > 0
                ? `Attendre ${retryAfter}s`
                : mode === 'login'
                  ? 'Entrer dans MadaRisk'
                  : 'Créer le compte'}
              {!loading && retryAfter <= 0 ? (
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              ) : null}
            </Button>
          </form>

          <p
            className="login-rise mt-7 text-center text-xs text-muted"
            style={{ animationDelay: '520ms' }}
          >
            Accès réservé aux opérateurs autorisés.
          </p>
        </div>
      </div>
    </div>
  );
}
