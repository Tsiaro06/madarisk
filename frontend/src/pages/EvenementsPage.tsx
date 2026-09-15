import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Polygon } from 'geojson';
import { Plus, Radio } from 'lucide-react';
import { eventsApi } from '@/api';
import type { EventListItem, EventStatus, EventType, RiskLevel, RiskPhase, SeverityLevel } from '@/types';
import { ApiClientError } from '@/api/client';
import { createEventSchema } from '@/schemas/forms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Pagination } from '@/components/ui/Pagination';
import { PolygonDrawMap } from '@/components/maps/PolygonDrawMap';
import { RefreshDataButton } from '@/components/ui/RefreshDataButton';
import { AdministrativeInterventionPanel } from '@/components/admin/AdministrativeInterventionPanel';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { useCrisisStore } from '@/stores/crisisStore';
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
  const setActiveEventId = useCrisisStore((s) => s.setActiveEventId);
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

  const events = listQ.data?.data ?? [];
  const lastUpdate = events.reduce<EventListItem | null>(
    (latest, e) => (latest == null || e.updatedAt > latest.updatedAt ? e : latest),
    null,
  );
  const lastUpdatedAt = lastUpdate?.updatedAt ?? null;
  const lastSource = lastUpdate?.sourceName ?? null;

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
    onSuccess: (created) => {
      toast('Événement créé', 'success');
      setActiveEventId(created.id);
      setOpen(false);
      form.reset();
      setTrackPoints([]);
      setPolygonPoints([]);
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['events', 'options'] });
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
          <h1 className="font-display text-3xl text-ink">
            Événements détectés automatiquement
          </h1>
          <p className="text-sm text-muted">
            Suivez les aléas détectés, leurs zones d&apos;exposition et leur évolution.
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <Radio className="size-3.5 shrink-0 text-emerald-600" />
            <span className="font-medium text-ink">Surveillance automatique active</span>
            {lastUpdatedAt ? (
              <>
                <span>· Dernière mise à jour :</span>
                <span className="font-medium text-ink">{formatDate(lastUpdatedAt)}</span>
                {lastSource ? <span>· Source : {lastSource}</span> : null}
              </>
            ) : (
              <span>· Informations de synchronisation non disponibles.</span>
            )}
          </p>
        </div>
        <RefreshDataButton
          queryKey={['events']}
          onRefresh={() => void qc.refetchQueries({ queryKey: ['events'] })}
        />
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
        {listQ.isError ? (
          <AlertBanner tone="danger" title="Échec du chargement">
            Impossible de charger la liste des événements. Réessayez ou rechargez la page.
          </AlertBanner>
        ) : listQ.isLoading ? (
          <Spinner />
        ) : (listQ.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucun événement"
            description="Aucun aléa n'est détecté ou suivi pour le moment. Les événements sont générés automatiquement."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line bg-gray-50 text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Code</th>
                    <th className="px-3 py-2.5">Nom</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Sévérité</th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-3 py-2.5">Créé</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data?.data.map((ev) => (
                    <tr key={ev.id} className="border-b border-line transition hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs">{ev.eventCode}</td>
                      <td className="px-3 py-2.5">
                        <Link className="font-medium text-brand hover:underline" to={`/evenements/${ev.id}`}>
                          {ev.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{ev.type}</td>
                      <td className="px-3 py-2.5">{ev.severity}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={STATUS_TONE[ev.status]}>{ev.status}</Badge>
                      </td>
                      <td className="px-3 py-2.5">{formatDate(ev.createdAt)}</td>
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

      <AdministrativeInterventionPanel title="Événements">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Créer un événement exceptionnel
        </Button>
        <p className="text-xs text-muted">
          Création manuelle réservée aux exceptions (événement non détecté
          automatiquement). Le parcours standard repose sur la détection automatique.
        </p>
      </AdministrativeInterventionPanel>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Créer un événement exceptionnel"
        >
          <form
            onSubmit={form.handleSubmit((values) => createM.mutate(values))}
            className="w-full max-w-3xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 className="font-display text-xl">Créer un événement exceptionnel</h2>
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
