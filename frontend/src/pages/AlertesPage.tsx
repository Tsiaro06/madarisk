import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi } from '@/api';
import type { AlertStatus, AlertType, SeverityLevel } from '@/types';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';

const ALERT_TYPES: AlertType[] = [
  'CYCLONE',
  'INONDATION',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'SECHERESSE',
  'INFORMATION',
  'URGENCE',
];
const SEVERITIES: SeverityLevel[] = ['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME'];
const STATUSES: AlertStatus[] = ['BROUILLON', 'PUBLIEE', 'ARCHIVEE', 'EXPIREE'];

function statusTone(s: AlertStatus) {
  if (s === 'PUBLIEE') return 'danger' as const;
  if (s === 'BROUILLON') return 'neutral' as const;
  if (s === 'ARCHIVEE') return 'info' as const;
  return 'warning' as const;
}

export function AlertesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'URGENCE' as AlertType,
    severity: 'ELEVEE' as SeverityLevel,
    eventId: '',
    districtId: '',
    communeId: '',
  });

  const listQ = useQuery({
    queryKey: ['alerts', page, status, type],
    queryFn: () =>
      alertsApi.list({
        page,
        limit: 12,
        status: status || undefined,
        type: type || undefined,
      }),
  });

  const createM = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        message: form.message,
        type: form.type,
        severity: form.severity,
        eventId: form.eventId || undefined,
        districtId: form.districtId || undefined,
        communeId: form.communeId || undefined,
      };
      const targets = [body.eventId, body.districtId, body.communeId].filter(Boolean);
      if (targets.length === 0) {
        throw new ApiClientError('Précisez au moins une cible (événement, district ou commune)', 422);
      }
      if (body.districtId && body.communeId) {
        throw new ApiClientError('Impossible de cibler à la fois un district et une commune', 422);
      }
      return alertsApi.create(body);
    },
    onSuccess: () => {
      toast('Alerte créée', 'success');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
    },
  });

  const publishM = useMutation({
    mutationFn: (id: string) => alertsApi.publish(id),
    onSuccess: () => {
      toast('Alerte publiée', 'success');
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur publication';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const archiveM = useMutation({
    mutationFn: (id: string) => alertsApi.archive(id),
    onSuccess: () => {
      toast('Alerte archivée', 'success');
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur archivage';
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
          <h1 className="font-display text-3xl text-ink">Alertes</h1>
          <p className="text-sm text-muted">Diffusion et suivi des messages d&apos;urgence</p>
        </div>
        {canManageOps(role) ? <Button onClick={() => setOpen(true)}>Nouvelle alerte</Button> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
        <Select
          label="Statut"
          value={status}
          placeholder="Tous"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Type"
          value={type}
          placeholder="Tous"
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          options={ALERT_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </div>

      <Card>
        {listQ.isLoading ? (
          <Spinner />
        ) : (listQ.data?.data.length ?? 0) === 0 ? (
          <EmptyState title="Aucune alerte" />
        ) : (
          <>
            <ul className="space-y-3">
              {listQ.data?.data.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-brand/10 bg-brand-soft/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-ink">{a.title}</h3>
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        <Badge tone="warning">{a.severity}</Badge>
                        <Badge tone="brand">{a.type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">{a.message}</p>
                      <p className="mt-2 text-xs text-muted">
                        {a.communeName || a.districtName || 'Territoire non précisé'} ·{' '}
                        {formatDate(a.publishedAt || a.createdAt)}
                      </p>
                    </div>
                    {canManageOps(role) ? (
                      <div className="flex gap-2">
                        {a.status === 'BROUILLON' ? (
                          <Button
                            size="sm"
                            loading={publishM.isPending}
                            onClick={() => publishM.mutate(a.id)}
                          >
                            Publier
                          </Button>
                        ) : null}
                        {a.status !== 'ARCHIVEE' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={archiveM.isPending}
                            onClick={() => archiveM.mutate(a.id)}
                          >
                            Archiver
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
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
            <h2 className="font-display text-xl">Nouvelle alerte</h2>
            <Input
              label="Titre"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              label="Message"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              required
            />
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AlertType }))}
              options={ALERT_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <Select
              label="Sévérité"
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as SeverityLevel }))}
              options={SEVERITIES.map((t) => ({ value: t, label: t }))}
            />
            <p className="text-xs text-muted">
              Cible : renseignez un événement et/ou un territoire (district OU commune).
            </p>
            <Input
              label="eventId (UUID)"
              value={form.eventId}
              onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}
              placeholder="optionnel"
            />
            <Input
              label="districtId (UUID)"
              value={form.districtId}
              onChange={(e) => setForm((f) => ({ ...f, districtId: e.target.value }))}
              placeholder="optionnel"
            />
            <Input
              label="communeId (UUID)"
              value={form.communeId}
              onChange={(e) => setForm((f) => ({ ...f, communeId: e.target.value }))}
              placeholder="optionnel"
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
