import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Clock3, KeyRound, Shield, UserRound } from 'lucide-react';
import { authApi, usersApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS } from '@/lib/roles';
import { formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

type Tab = 'identite' | 'securite';

export function ProfilePage() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<Tab>('identite');

  const [firstName, setFirstName] = useState(() => user?.firstName ?? '');
  const [lastName, setLastName] = useState(() => user?.lastName ?? '');
  const [email, setEmail] = useState(() => user?.email ?? '');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const profileMut = useMutation({
    mutationFn: () =>
      usersApi.update(user!.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      }),
    onSuccess: (updated) => {
      setUser(updated);
      toast('Profil mis à jour', 'success');
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error');
    },
  });

  const passwordMut = useMutation({
    mutationFn: () => authApi.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      toast('Mot de passe mis à jour', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error');
    },
  });

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  const onSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    profileMut.mutate();
  };

  const onSavePassword = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast('Les mots de passe ne correspondent pas', 'error');
      return;
    }
    passwordMut.mutate();
  };

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-8 h-56 rounded-[2rem] bg-[radial-gradient(ellipse_at_top_left,rgba(61,122,154,0.14),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(196,146,42,0.08),transparent_45%)]"
      />

      <div className="relative space-y-6 animate-[login-rise_0.45s_ease-out]">
        {/* Bandeau identité */}
        <section className="overflow-hidden rounded-2xl border border-line/80 bg-surface/90 shadow-[0_8px_30px_-18px_rgba(47,95,120,0.35)] backdrop-blur-sm">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" aria-hidden />
              <div className="relative grid size-24 place-items-center rounded-2xl bg-gradient-to-br from-brand-deep to-[#4a8eae] font-display text-3xl font-semibold tracking-wide text-white shadow-inner sm:size-28 sm:text-4xl">
                {initials || <UserRound className="size-10 opacity-90" />}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep/70">
                Compte personnel
              </p>
              <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]">
                {user.firstName} {user.lastName}
              </h2>
              <p className="mt-1 truncate text-sm text-muted">{user.email}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-deep">
                  <Shield className="size-3.5" />
                  {ROLE_LABELS[user.role]}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
                    user.isActive
                      ? 'bg-risk-faible/15 text-risk-faible'
                      : 'bg-risk-extreme/15 text-risk-extreme',
                  )}
                >
                  {user.isActive ? 'Compte actif' : 'Compte inactif'}
                </span>
              </div>
            </div>

            <dl className="grid shrink-0 gap-3 border-t border-line pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 className="size-3.5" /> Dernière connexion
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{formatDate(user.lastLoginAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Membre depuis</dt>
                <dd className="mt-0.5 font-medium text-ink">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Onglets + formulaire */}
        <section className="rounded-2xl border border-line/80 bg-surface shadow-[0_8px_30px_-20px_rgba(15,23,42,0.25)]">
          <div className="flex gap-1 border-b border-line px-3 pt-3 sm:px-5">
            <TabButton
              active={tab === 'identite'}
              icon={UserRound}
              label="Identité"
              onClick={() => setTab('identite')}
            />
            <TabButton
              active={tab === 'securite'}
              icon={KeyRound}
              label="Mot de passe"
              onClick={() => setTab('securite')}
            />
          </div>

          {tab === 'identite' ? (
            <form key="identite" className="animate-[login-fade_0.3s_ease-out] p-6 sm:p-8" onSubmit={onSaveProfile}>
              <div className="mb-6 max-w-lg">
                <h3 className="font-display text-xl font-semibold text-ink">Informations personnelles</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Ces informations apparaissent dans la plateforme et pour les échanges
                  internes de la salle de crise.
                </p>
              </div>

              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <Input
                  label="Prénom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
                <Input
                  label="Nom"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Adresse e-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-sm font-medium text-ink">Rôle</p>
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-line bg-canvas/80 px-3 text-sm text-muted">
                    <Shield className="size-4 text-brand-deep" />
                    <span className="text-ink">{ROLE_LABELS[user.role]}</span>
                    <span className="ml-auto text-xs">Modifiable uniquement par un super administrateur</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
                <p className="text-xs text-muted">Les changements prennent effet immédiatement.</p>
                <Button type="submit" loading={profileMut.isPending}>
                  Enregistrer
                </Button>
              </div>
            </form>
          ) : (
            <form key="securite" className="animate-[login-fade_0.3s_ease-out] p-6 sm:p-8" onSubmit={onSavePassword}>
              <div className="mb-6 max-w-lg">
                <h3 className="font-display text-xl font-semibold text-ink">Sécurité du compte</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Choisissez un mot de passe solide. Les sessions déjà ouvertes restent
                  actives jusqu’à déconnexion.
                </p>
              </div>

              <div className="grid max-w-md gap-5">
                <Input
                  label="Mot de passe actuel"
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
                <Input
                  label="Nouveau mot de passe"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirmer le nouveau mot de passe"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
                <ul className="space-y-1 text-xs text-muted">
                  <li>· Au moins 8 caractères</li>
                  <li>· Une majuscule, une minuscule, un chiffre et un caractère spécial</li>
                </ul>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
                <p className="text-xs text-muted">Utilisez un mot de passe unique à MadaRisk.</p>
                <Button type="submit" loading={passwordMut.isPending}>
                  Mettre à jour
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition',
        active ? 'text-brand-deep' : 'text-muted hover:text-ink',
      )}
    >
      <Icon className="size-4" />
      {label}
      {active ? (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" aria-hidden />
      ) : null}
    </button>
  );
}
