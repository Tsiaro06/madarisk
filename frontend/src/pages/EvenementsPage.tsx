import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Polygon } from 'geojson';
import { eventsApi } from '@/api';
import type { EventStatus, EventType, RiskLevel, RiskPhase, SeverityLevel } from '@/types';
import { ApiClientError } from '@/api/client';
import { createEventSchema } from '@/schemas/forms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { PolygonDrawMap } from '@/components/maps/PolygonDrawMap';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import type { z } from 'zod';

const STATUS_TONE: Record<EventStatus, 'neutral' | 'info' | 'warning' | 'danger' | 'success'> = {
  BROUILLON: 'neutral',
  PREVISION: 'info',
  ACTIF: 'danger',
  SUIVI: 'warning',
  CLOTURE: 'success',
};

const EVENT_TYPES: EventType[] = [
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'AUTRE',
];

const SEVERITIES: SeverityLevel[] = ['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME'];
const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];
const LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

type CreateEventForm = z.infer<typeof createEventSchema>;

export function EvenementsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [trackPoints, setTrackPoints] = useState<[number, number][]>([]);
  const [trackType, setTrackType] = useState('PREVUE');
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polyForm, setPolyForm] = useState<{ phase: RiskPhase; riskLevel: RiskLevel }>({
    phase: 'PENDANT',
    riskLevel: 'ELEVE',
  });

  const form = useForm<CreateEventForm>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      eventCode: '',
      name: '',
      type: 'CYCLONE',
      severity: 'ELEVEE',
      status: 'BROUILLON',
      description: '',
    },
  });

  const listQ = useQuery({
    queryKey: ['events', page, status],
    queryFn: () => eventsApi.list({ page, limit: 12, status: status || undefined }),
  });

  const createM = useMutation({
    mutationFn: async (body: CreateEventForm) => {
      const created = await eventsApi.create(body);
      for (const [lat, lng] of trackPoints) {
        await eventsApi.addTrack(created.id, {
          trackType,
          latitude: lat,
          longitude: lng,
          observedAt: new Date().toISOString(),
        });
      }
      if (polygonPoints.length >= 3) {
        const ring: Polygon['coordinates'][number] = [
          ...polygonPoints.map(([lat, lng]) => [lng, lat] as [number, number]),
          [polygonPoints[0][1], polygonPoints[0][0]],
        ];
        await eventsApi.createPolygonArea(created.id, {
          phase: polyForm.phase,
          riskLevel: polyForm.riskLevel,
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }
      return created;
    },
    onSuccess: () => {
      toast('Événement créé', 'success');
      setOpen(false);
      form.reset();
      setTrackPoints([]);
      setPolygonPoints([]);
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur de création';
      toast(msg, 'error');
      if (err instanceof ApiClientError && err.errors) {
        for (const e of err.errors) {
          if (e.field) form.setError(e.field as keyof CreateEventForm, { message: e.message });
        }
      }
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Événements</h1>
          <p className="text-sm text-muted">Suivi opérationnel des crises</p>
        </div>
        {canManageOps(role) ? (
          <Button onClick={() => setOpen(true)}>Nouvel événement</Button>
        ) : null}
      </div>

      <div className="max-w-xs">
        <Select
          label="Statut"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Tous"
          options={(Object.keys(STATUS_TONE) as EventStatus[]).map((s) => ({
            value: s,
            label: s,
          }))}
        />
      </div>

      <Card>
        {listQ.isLoading ? (
          <Spinner />
        ) : (listQ.data?.data.length ?? 0) === 0 ? (
          <EmptyState title="Aucun événement" description="Créez un événement pour démarrer le suivi." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-brand/10 text-muted">
                  <tr>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Nom</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Sévérité</th>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Créé</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data?.data.map((ev) => (
                    <tr key={ev.id} className="border-b border-brand/5 hover:bg-brand-soft/40">
                      <td className="px-2 py-2 font-mono text-xs">{ev.eventCode}</td>
                      <td className="px-2 py-2">
                        <Link className="font-medium text-brand hover:underline" to={`/evenements/${ev.id}`}>
                          {ev.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{ev.type}</td>
                      <td className="px-2 py-2">{ev.severity}</td>
                      <td className="px-2 py-2">
                        <Badge tone={STATUS_TONE[ev.status]}>{ev.status}</Badge>
                      </td>
                      <td className="px-2 py-2">{formatDate(ev.createdAt)}</td>
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
          <form
            onSubmit={form.handleSubmit((values) => createM.mutate(values))}
            className="w-full max-w-3xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 className="font-display text-xl">Nouvel événement</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Code" {...form.register('eventCode')} error={form.formState.errors.eventCode?.message} />
              <Input label="Nom" {...form.register('name')} error={form.formState.errors.name?.message} />
              <Select
                label="Type"
                {...form.register('type')}
                options={EVENT_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <Select
                label="Sévérité"
                {...form.register('severity')}
                options={SEVERITIES.map((t) => ({ value: t, label: t }))}
              />
              <Select
                label="Statut"
                {...form.register('status')}
                options={(Object.keys(STATUS_TONE) as EventStatus[]).map((s) => ({
                  value: s,
                  label: s,
                }))}
              />
              <Input label="Description" {...form.register('description')} />
            </div>

            {form.watch('type') === 'CYCLONE' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">Points de trajectoire (cyclone)</p>
                <PolygonDrawMap
                  variant="track"
                  points={trackPoints}
                  onChange={setTrackPoints}
                  height={240}
                />
                <div className="flex gap-2">
                  <Select
                    label="Type"
                    value={trackType}
                    onChange={(e) => setTrackType(e.target.value)}
                    options={[
                      { value: 'OBSERVEE', label: 'OBSERVEE' },
                      { value: 'PREVUE', label: 'PREVUE' },
                    ]}
                  />
                  <div className="flex flex-1 items-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      disabled={trackPoints.length === 0}
                      onClick={() => setTrackPoints((p) => p.slice(0, -1))}
                    >
                      Annuler le point
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={trackPoints.length === 0}
                      onClick={() => setTrackPoints([])}
                    >
                      Effacer
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Limites de districts affichées pour repérage (facultatif).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">Zone polygonale (dessin)</p>
                <Select
                  label="Phase"
                  value={polyForm.phase}
                  onChange={(e) => setPolyForm((p) => ({ ...p, phase: e.target.value as RiskPhase }))}
                  options={PHASES.map((p) => ({ value: p, label: p }))}
                />
                <Select
                  label="Niveau"
                  value={polyForm.riskLevel}
                  onChange={(e) =>
                    setPolyForm((p) => ({ ...p, riskLevel: e.target.value as RiskLevel }))
                  }
                  options={LEVELS.map((p) => ({ value: p, label: p }))}
                />
                <PolygonDrawMap
                  variant="polygon"
                  points={polygonPoints}
                  onChange={setPolygonPoints}
                  height={240}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={polygonPoints.length === 0}
                    onClick={() => setPolygonPoints((p) => p.slice(0, -1))}
                  >
                    Annuler le point
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={polygonPoints.length === 0}
                    onClick={() => setPolygonPoints([])}
                  >
                    Effacer
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  ≥ 3 points pour définir la zone (facultatif). Limites de districts affichées pour
                  repérage.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
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
