import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn, ShieldQuestion, UserPlus } from 'lucide-react';
import { loginSchema } from '@/schemas/forms';
import { useLogin, type LoginValues } from '@/hooks/useLogin';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { PasswordInput } from '@/components/auth/PasswordInput';
import type { SanitizedUser } from '@/types';

/** Seule l'adresse e-mail est mémorisée : le mot de passe n'est jamais persisté. */
const REMEMBER_KEY = 'madarisk_remembered_email';

function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistRememberedEmail(email: string, remember: boolean): void {
  try {
    if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : on ignore, la connexion reste possible.
  }
}

interface LoginFormProps {
  /** Appelé après une authentification réussie ; reçoit l'utilisateur connecté. */
  onSuccess: (user: SanitizedUser) => void;
  /** Bascule vers le mode « installation initiale » (premier compte SUPER_ADMIN). */
  onSwitchToInstall: () => void;
}

export function LoginForm({ onSuccess, onSwitchToInstall }: LoginFormProps) {
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => readRememberedEmail().length > 0);

  const { submit, isPending, failure, fieldErrors, retryAfter, clearFailure } =
    useLogin(onSuccess);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    defaultValues: { email: readRememberedEmail(), password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    persistRememberedEmail(values.email.trim(), rememberMe);
    submit(values);
  });

  return (
    <div className="w-full">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">
        Accès sécurisé
      </p>
      <h1 className="mt-2 font-sans text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
        Bienvenue sur MadaRisk
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Connectez-vous pour accéder à votre espace de gestion des risques.
      </p>

      {failure ? (
        <div className="mt-6">
          <AlertBanner tone="danger" title="Connexion impossible">
            {failure.message}
          </AlertBanner>
        </div>
      ) : null}

      <form
        noValidate
        aria-busy={isPending}
        className="mt-6 space-y-4"
        onSubmit={onSubmit}
        onChange={clearFailure}
      >
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              id="login-email"
              label="Adresse e-mail"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="vous@organisation.mg"
              disabled={isPending}
              className="h-11 rounded-xl"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
              error={fieldErrors.email ?? errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordInput
              id="login-password"
              label="Mot de passe"
              autoComplete="current-password"
              placeholder="Votre mot de passe"
              disabled={isPending}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
              error={fieldErrors.password ?? errors.password?.message}
            />
          )}
        />

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pt-1">
          <Checkbox
            name="rememberMe"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={isPending}
            label="Se souvenir de moi"
            description="Mémorise l’adresse e-mail sur cet appareil."
          />

          <button
            type="button"
            aria-expanded={helpOpen}
            aria-controls={helpId}
            onClick={() => setHelpOpen((open) => !open)}
            className="shrink-0 rounded text-sm font-medium text-brand-deep underline underline-offset-4 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
          >
            Mot de passe oublié ?
          </button>
        </div>

        {helpOpen ? (
          <p
            id={helpId}
            role="status"
            className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3.5 py-3 text-xs leading-relaxed text-muted"
          >
            <ShieldQuestion className="mt-px size-4 shrink-0 text-brand-deep" aria-hidden="true" />
            <span>
              La réinitialisation des mots de passe est gérée par un administrateur de la
              plateforme. Contactez-le depuis votre espace de crise pour obtenir un accès
              provisoire.
            </span>
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          disabled={retryAfter > 0}
          className="w-full rounded-xl"
        >
          {retryAfter > 0
            ? `Attendre ${retryAfter}s`
            : isPending
              ? 'Connexion…'
              : 'Se connecter'}
          {!isPending && retryAfter <= 0 ? (
            <LogIn className="size-4" aria-hidden="true" />
          ) : null}
        </Button>
      </form>

      <div className="mt-7 space-y-3 border-t border-line pt-5 text-center">
        <p className="text-xs text-muted">
          Vous n’avez pas encore de compte ?{' '}
          <span className="font-medium text-ink">Contactez l’administrateur</span> pour obtenir
          un accès.
        </p>
        <button
          type="button"
          onClick={onSwitchToInstall}
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted underline underline-offset-4 transition hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
        >
          <UserPlus className="size-3.5" aria-hidden="true" />
          Installation initiale — créer le premier compte
        </button>
      </div>
    </div>
  );
}