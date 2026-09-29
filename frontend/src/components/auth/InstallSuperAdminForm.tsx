import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Rocket } from 'lucide-react';
import { registerSchema } from '@/schemas/forms';
import { useInstallSuperAdmin, type InstallSuperAdminValues } from '@/hooks/useLogin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useToast } from '@/components/ui/Toast';
import { PasswordInput } from '@/components/auth/PasswordInput';

interface InstallSuperAdminFormProps {
  /** Compte créé : retour au formulaire de connexion. */
  onDone: () => void;
  /** Annulation : fermeture du mode installation. */
  onCancel: () => void;
}

/**
 * Installation initiale — création du tout premier compte (SUPER_ADMIN).
 *
 * Écran secondaire, peu visible : `POST /auth/register` renvoie `403` dès
 * qu'un utilisateur existe, ce mode ne sert qu'au démarrage de la plateforme.
 */
export function InstallSuperAdminForm({ onDone, onCancel }: InstallSuperAdminFormProps) {
  const { toast } = useToast();
  const { submit, isPending, failure, clearFailure } = useInstallSuperAdmin(() => {
    toast('Compte SUPER_ADMIN créé. Vous pouvez vous connecter.', 'success');
    onDone();
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InstallSuperAdminValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onSubmit',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit((values) => submit(values));

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onCancel}
        className="mb-4 inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted transition hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Retour à la connexion
      </button>

      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">
        Installation initiale
      </p>
      <h1 className="mt-2 font-sans text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
        Créer le premier compte
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Disponible tant qu’aucun utilisateur n’existe. Il fera office de super administrateur :
        il pourra ensuite inviter les opérateurs.
      </p>

      {failure ? (
        <div className="mt-6">
          <AlertBanner tone="danger" title="Création impossible">{failure}</AlertBanner>
        </div>
      ) : null}

      <form
        noValidate
        aria-busy={isPending}
        className="mt-6 space-y-4"
        onSubmit={onSubmit}
        onChange={clearFailure}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                id="install-firstname"
                label="Prénom"
                autoComplete="given-name"
                disabled={isPending}
                className="h-11 rounded-xl"
                {...field}
                error={errors.firstName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <Input
                id="install-lastname"
                label="Nom"
                autoComplete="family-name"
                disabled={isPending}
                className="h-11 rounded-xl"
                {...field}
                error={errors.lastName?.message}
              />
            )}
          />
        </div>

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              id="install-email"
              label="Adresse e-mail"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="admin@organisation.mg"
              disabled={isPending}
              className="h-11 rounded-xl"
              {...field}
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordInput
              id="install-password"
              label="Mot de passe"
              autoComplete="new-password"
              disabled={isPending}
              {...field}
              error={errors.password?.message}
            />
          )}
        />

        <ul className="space-y-0.5 text-xs text-muted">
          <li>· Au moins 8 caractères</li>
          <li>· Une majuscule, une minuscule, un chiffre et un caractère spécial</li>
        </ul>

        <Button type="submit" size="lg" loading={isPending} className="w-full rounded-xl">
          {isPending ? 'Création…' : 'Créer le compte'}
          {!isPending ? <Rocket className="size-4" aria-hidden="true" /> : null}
        </Button>
      </form>
    </div>
  );
}