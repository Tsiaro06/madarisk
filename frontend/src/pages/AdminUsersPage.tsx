import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api';
import { ApiClientError } from '@/api/client';
import type { UserRole } from '@/lib/roles';
import { ROLE_LABELS } from '@/lib/roles';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'ANALYSTE_SIG', 'CLIENT'];

export function AdminUsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'CLIENT' as UserRole,
  });

  const listQ = useQuery({
    queryKey: ['users', page],
    queryFn: () => usersApi.list({ page, limit: 15 }),
  });

  const createM = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      toast('Utilisateur créé', 'success');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const statusM = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersApi.setStatus(id, isActive),
    onSuccess: () => {
      toast('Statut mis à jour', 'success');
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    createM.mutate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Administration</h1>
          <p className="text-sm text-muted">Gestion des utilisateurs (SUPER_ADMIN)</p>
        </div>
        <Button onClick={() => setOpen(true)}>Nouvel utilisateur</Button>
      </div>

      <Card>
        {listQ.isLoading ? (
          <Spinner />
        ) : (listQ.data?.data.length ?? 0) === 0 ? (
          <EmptyState title="Aucun utilisateur" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-brand/10 text-muted">
                  <tr>
                    <th className="px-2 py-2">Nom</th>
                    <th className="px-2 py-2">E-mail</th>
                    <th className="px-2 py-2">Rôle</th>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Dernière connexion</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {listQ.data?.data.map((u) => (
                    <tr key={u.id} className="border-b border-brand/5">
                      <td className="px-2 py-2 font-medium">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="px-2 py-2">{u.email}</td>
                      <td className="px-2 py-2">{ROLE_LABELS[u.role]}</td>
                      <td className="px-2 py-2">
                        <Badge tone={u.isActive ? 'success' : 'neutral'}>
                          {u.isActive ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">{formatDate(u.lastLoginAt)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={statusM.isPending}
                          onClick={() => statusM.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          {u.isActive ? 'Désactiver' : 'Activer'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={listQ.data?.meta?.page ?? page}
              totalPages={listQ.data?.meta?.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={onCreate} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="font-display text-xl">Nouvel utilisateur</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prénom"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
              <Input
                label="Nom"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input
              label="Mot de passe"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
            />
            <Select
              label="Rôle"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={createM.isPending}>
                Créer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
