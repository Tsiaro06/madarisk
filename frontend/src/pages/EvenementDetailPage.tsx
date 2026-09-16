import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FeatureCollection, Polygon } from 'geojson';
import type { z } from 'zod';
import { eventsApi, risksApi } from '@/api';
import type { EventListItem, EventStatus, ExposedCommuneRow, RiskLevel, RiskPhase } from '@/types';
import { RISK_LABELS } from '@/types';
import { ApiClientError } from '@/api/client';
import { calculateAreaSchema } from '@/schemas/forms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { PolygonDrawMap } from '@/components/maps/PolygonDrawMap';
import { useToast } from '@/components/ui/Toast';
import { Check, Trash2, XCircle } from 'lucide-react';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useCrisisStore } from '@/stores/crisisStore';
import { useActiveEvent } from '@/stores/activeEvent';
import { EventChronologieTab } from '@/components/events/EventChronologieTab';
import { EventBilanTab } from '@/components/events/EventBilanTab';
import { AdministrativeInterventionPanel } from '@/components/admin/AdministrativeInterventionPanel';
import { AdministrativeActionConfirmDialog } from '@/components/ui/AdministrativeActionConfirmDialog';

const STATUSES: EventStatus[] = ['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'];
const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];
const LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

function tone(level: RiskLevel) {
  if (level === 'EXTREME') return 'danger' as const;
  if (level === 'ELEVE') return 'warning' as const;
  if (level === 'MODERE') return 'info' as const;
  return 'success' as const;
}

type AreaForm = z.infer<typeof calculateAreaSchema>;

function WorkflowStep({
  step,
  label,
  note,
  done,
  locked,
  current = false,
}: {
  step: number;
  label: string;
  note: string;
  done: boolean;
  locked: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition',
        done
          ? 'border-emerald-300 bg-emerald-50'
          : locked
            ? 'border-line bg-canvas'
            : current
              ? 'border-brand bg-brand-soft ring-2 ring-brand/15'
              : 'border-brand/40 bg-brand-soft/40',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done
            ? 'bg-emerald-600 text-white'
            : locked
              ? 'bg-slate-200 text-slate-500'
              : 'bg-brand text-white',
        )}
      >
        {done ? <Check className="size-3.5" /> : step}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-sm font-medium',
            locked && !done ? 'text-muted' : current ? 'text-brand-deep' : 'text-ink',
          )}
        >
          {label}
        </p>
        <p className="truncate text-xs text-muted">{note}</p>
      </div>
    </div>
  );
}

export function EvenementDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const setActiveEventId = useCrisisStore((s) => s.setActiveEventId);
  const { activeEventId } = useActiveEvent();
  const [trackPoint, setTrackPoint] = useState({ lat: '', lng: '', trackType: 'PREVUE' });
  const [activeTab, setActiveTab] = useState<'operations' | 'chronologie' | 'bilan'>('operations');
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [exposedPhase, setExposedPhase] = useState('');
  const [polyForm, setPolyForm] = useState<{ phase: RiskPhase; riskLevel: RiskLevel }>({
    phase: 'PENDANT',
    riskLevel: 'ELEVE',
  });
  const [riskPhase, setRiskPhase] = useState<RiskPhase>('PENDANT');
  const [removeCommuneId, setRemoveCommuneId] = useState('');
  const [selectedMapCommune, setSelectedMapCommune] = useState<{
    communeId: string;
    communeName: string;
    riskLevel?: string;
    riskScore?: number;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant: 'warning' | 'destructive' | 'primary';
    actionLabel: string;
    onConfirm: () => void;
    contextLabel?: string;
    contextValue?: string;
  }>({ open: false, title: '', variant: 'warning', actionLabel: '', onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, open: false }));

  const areaForm = useForm<AreaForm>({
    resolver: zodResolver(calculateAreaSchema),
    defaultValues: { phase: 'PENDANT', riskLevel: 'ELEVE', radiusKm: 50 },
  });

  const eventQ = useQuery({
    queryKey: ['event', id],
    queryFn: () => eventsApi.get(id) as Promise<EventListItem>,
    enabled: Boolean(id),
  });

  const tracksQ = useQuery({
    queryKey: ['event', id, 'tracks-geojson'],
    queryFn: () => eventsApi.trackGeoJson(id),
    enabled: Boolean(id),
  });

  const areasQ = useQuery({
    queryKey: ['event', id, 'areas'],
    queryFn: () => eventsApi.areas(id),
    enabled: Boolean(id),
  });

  const exposedQ = useQuery({
    queryKey: ['event', id, 'exposed', exposedPhase],
    queryFn: () =>
      eventsApi.exposedCommunes(id, {
        page: 1,
        limit: 50,
        ...(exposedPhase ? { phase: exposedPhase } : {}),
      }),
    enabled: Boolean(id),
  });

  const exposedAnyQ = useQuery({
    queryKey: ['event', id, 'exposed', 'any'],
    queryFn: () => eventsApi.exposedCommunes(id, { page: 1, limit: 1 }),
    enabled: Boolean(id),
  });

  const riskMapQ = useQuery({
    queryKey: ['event', id, 'risk-map', exposedPhase],
    queryFn: () =>
      risksApi.mapLayer({
        eventId: id,
        ...(exposedPhase ? { phase: exposedPhase } : {}),
      }),
    enabled: Boolean(id),
  });

  const invalidateEvent = () => {
    void qc.invalidateQueries({ queryKey: ['event', id] });
  };

  const statusM = useMutation({
    mutationFn: (status: string) => eventsApi.updateStatus(id, status),
    onSuccess: () => {
      toast('Statut mis à jour', 'success');
      invalidateEvent();
      void qc.invalidateQueries({ queryKey: ['events'] });
      closeConfirm();
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Erreur statut', 'error');
    },
  });

  const exposureM = useMutation({
    mutationFn: () => eventsApi.calculateExposure(id, { allAreas: 'true' }),
    onSuccess: () => {
      toast('Exposition recalculée', 'success');
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed'] });
      closeConfirm();
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
  });

  const areaM = useMutation({
    mutationFn: (body: AreaForm) => eventsApi.calculateArea(id, body),
    onSuccess: () => {
      toast('Zone d’influence calculée', 'success');
      void qc.invalidateQueries({ queryKey: ['event', id, 'areas'] });
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed'] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
  });

  const polygonM = useMutation({
    mutationFn: (body: { phase: RiskPhase; riskLevel: RiskLevel; geometry: Polygon }) =>
      eventsApi.createPolygonArea(id, body),
    onSuccess: () => {
      toast('Zone polygonale définie', 'success');
      setPolygonPoints([]);
      void qc.invalidateQueries({ queryKey: ['event', id, 'areas'] });
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed'] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
  });

  const deleteAreaM = useMutation({
    mutationFn: (areaId: string) => eventsApi.deleteArea(id, areaId),
    onSuccess: () => {
      toast('Zone supprimée — exposition recalculée', 'success');
      void qc.invalidateQueries({ queryKey: ['event', id, 'areas'] });
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed'] });
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed', 'any'] });
      closeConfirm();
    },
    onError: (err) =>
      toast(err instanceof ApiClientError ? err.message : 'Erreur suppression zone', 'error'),
  });

  const risksM = useMutation({
    mutationFn: (phase: RiskPhase) => eventsApi.recalculateRisks(id, { phase }),
    onSuccess: () => {
      toast('Risques recalculés', 'success');
      closeConfirm();
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
  });

  const removeExposedM = useMutation({
    mutationFn: (communeId: string) => eventsApi.removeExposedCommune(id, communeId),
    onSuccess: () => {
      toast('Commune retirée de l\'exposition', 'success');
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed'] });
      void qc.invalidateQueries({ queryKey: ['event', id, 'exposed', 'any'] });
      if (activeEventId === id) {
        void qc.invalidateQueries({ queryKey: ['crisis', 'risk-map'] });
      }
      setSelectedMapCommune(null);
      closeConfirm();
    },
    onError: (err) =>
      toast(err instanceof ApiClientError ? err.message : 'Erreur retrait commune', 'error'),
  });

  const trackM = useMutation({
    mutationFn: () =>
      eventsApi.addTrack(id, {
        trackType: trackPoint.trackType,
        latitude: Number(trackPoint.lat),
        longitude: Number(trackPoint.lng),
        observedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      toast('Point de trajectoire ajouté', 'success');
      setTrackPoint({ lat: '', lng: '', trackType: 'PREVUE' });
      void qc.invalidateQueries({ queryKey: ['event', id, 'tracks-geojson'] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
  });

  if (eventQ.isLoading) return <Spinner />;
  if (eventQ.isError || !eventQ.data) {
    return <AlertBanner tone="danger">Événement introuvable.</AlertBanner>;
  }

  const ev = eventQ.data;
  const exposed = exposedQ.data?.data ?? [] as ExposedCommuneRow[];
  const tracks = tracksQ.data as FeatureCollection | undefined;
  const areas = areasQ.data as FeatureCollection | undefined;
  const riskCommunes = riskMapQ.data as FeatureCollection | undefined;
  const riskFeatureCount = riskCommunes?.features?.length ?? 0;
  const trackCount = tracks?.features?.length ?? 0;
  const zoneCount = areas?.features?.length ?? 0;
  const hasExposure = (exposedAnyQ.data?.meta?.total ?? 0) > 0;
  const hasRiskScores = exposed.some((r) => Boolean(r.riskLevel));
  const isTrackRequired = ev.type === 'CYCLONE';
  const nextStatus = STATUSES[STATUSES.indexOf(ev.status) + 1];
  const canResetToDraft =
    role === 'SUPER_ADMIN' && trackCount === 0 && zoneCount === 0 && !hasExposure;
  const isStatusTransitionAllowed = (s: EventStatus) =>
    s !== ev.status && (s === nextStatus || (s === 'BROUILLON' && canResetToDraft));

  const workflowSteps = [
    {
      step: 1,
      label: 'Trajectoire',
      note:
        trackCount >= 2
          ? `${trackCount} point${trackCount > 1 ? 's' : ''} sur la ligne`
          : isTrackRequired
            ? `${trackCount} point${trackCount > 1 ? 's' : ''} / 2 minimum requis`
            : 'Optionnelle — utilisez la zone polygonale',
      done: trackCount >= 2,
      locked: isTrackRequired && trackCount < 2,
    },
    {
      step: 2,
      label: 'Zone d’influence',
      note:
        zoneCount > 0
          ? `${zoneCount} zone${zoneCount > 1 ? 's' : ''} définie${zoneCount > 1 ? 's' : ''}`
          : 'Bande tampon ou polygone à définir',
      done: zoneCount > 0,
      locked: isTrackRequired && trackCount < 2 && zoneCount === 0,
    },
    {
      step: 3,
      label: 'Exposition',
      note: hasExposure ? `${exposed.length} communes exposées` : 'Communes à intersecter avec les zones',
      done: hasExposure,
      locked: zoneCount === 0,
    },
    {
      step: 4,
      label: 'Évaluation',
      note: hasRiskScores ? 'Niveaux par commune calculés' : 'Scores à calculer après exposition',
      done: hasRiskScores,
      locked: !hasExposure,
    },
  ];
  const activeStep = workflowSteps.find((s) => !s.done && !s.locked)?.step ?? 4;
  const allStepsDone = workflowSteps.every((s) => s.done);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/evenements" className="text-sm text-brand hover:underline">
            ← Événements
          </Link>
          <h1 className="mt-1 font-display text-3xl text-ink">{ev.name}</h1>
          <p className="text-sm text-muted">
            {ev.eventCode} · {ev.type} · créé {formatDate(ev.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{ev.status}</Badge>
          <Badge tone="warning">{ev.severity}</Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActiveEventId(ev.id);
              toast('Événement actif en salle de crise', 'info');
            }}
          >
            Activer en crise
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {(['operations', 'chronologie', 'bilan'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={cn(
              'rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition',
              activeTab === t
                ? 'border-brand bg-brand-soft text-brand-deep'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t === 'operations'
              ? 'Opérations'
              : t === 'chronologie'
                ? 'Chronologie'
                : 'Bilan · Évaluation'}
          </button>
        ))}
      </div>

      {activeTab === 'operations' ? (
        <>
          {ev.description ? (
            <Card>
              <p className="text-sm text-ink">{ev.description}</p>
            </Card>
          ) : null}

      <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base text-ink">Parcours de gestion</h2>
                <p className="text-xs text-muted">
                  {allStepsDone
                    ? 'Les 4 étapes sont finalisées — le suivi automatique se poursuit (cycle de vie, carte, communes exposées).'
                    : `Étape active : n°${activeStep} — les données sont produites automatiquement.`}
                </p>
              </div>
              {allStepsDone ? (
                <Badge tone="success">Parcours terminé</Badge>
              ) : (
                <Badge tone="brand">Étape {activeStep} / 4</Badge>
              )}
            </div>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {workflowSteps.map((s) => (
                <li key={s.label}>
                  <WorkflowStep {...s} current={s.step === activeStep} />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted">
              Ces étapes sont alimentées automatiquement. Les interventions manuelles de
              correction ou de relance sont réservées à l&apos;intervention administrative.
            </p>
          </section>

      <Card
        title="Carte — trajectoire, zones & risques"
        description="Étapes 1 à 4 · couches géographiques de l'événement et communes exposées"
      >
        {tracksQ.isLoading || areasQ.isLoading ? (
          <Spinner />
        ) : (tracks?.features?.length || areas?.features?.length || riskFeatureCount) ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Cliquez un point ou une commune exposée pour en voir l&apos;évaluation.
              </p>
              <Select
                label="Phase"
                className="w-56"
                value={exposedPhase}
                onChange={(e) => setExposedPhase(e.target.value)}
                options={[
                  { value: '', label: 'Dernière évaluation (toutes phases)' },
                  ...PHASES.map((p) => ({ value: p, label: p })),
                ]}
              />
            </div>
            <GeoJsonMap
              data={
                {
                  type: 'FeatureCollection',
                  features: [
                    ...(tracks?.features ?? []),
                    ...(areas?.features ?? []),
                    ...(riskCommunes?.features ?? []),
                  ],
                } as FeatureCollection
              }
              height={420}
              onFeatureClick={(f) => {
                const props = (f.properties ?? {}) as Record<string, unknown>;
                const geom = f.geometry;
                if (geom.type === 'Point') {
                  const [lng, lat] = geom.coordinates;
                  setTrackPoint((p) => ({
                    ...p,
                    lat: String(lat),
                    lng: String(lng),
                  }));
                }
                const communeId = String(props.communeId ?? '');
                if (communeId) {
                  setSelectedMapCommune({
                    communeId,
                    communeName: String(props.communeName ?? props.name ?? communeId),
                    riskLevel: props.riskLevel ? String(props.riskLevel) : undefined,
                    riskScore:
                      typeof props.riskScore === 'number' ? props.riskScore : undefined,
                  });
                }
              }}
            />
            {riskFeatureCount > 0 ? (
              <div className="mt-3 rounded-lg border border-brand/15 bg-brand-soft/20 px-3 py-2 text-xs text-muted">
                Cliquez une commune sur la carte pour consulter son évaluation, ou utilisez le
                tableau « Communes exposées » ci-dessous.
              </div>
            ) : null}
            {areas?.features?.length ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Zones d&apos;influence ({areas.features.length})
                </p>
                <ul className="space-y-1.5">
                  {areas.features.map((f) => {
                    const props = (f.properties ?? {}) as Record<string, unknown>;
                    const areaId = String(props.areaId ?? '');
                    const isBuffer = props.radiusKm != null;
                    return (
                      <li
                        key={areaId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-brand/10 bg-brand-soft/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {isBuffer
                              ? `Bande tampon · ${String(props.radiusKm)} km`
                              : 'Zone polygonale'}
                          </p>
                          <p className="text-xs text-muted">
                            Phase : {String(props.phase ?? '—')} · Niveau :{' '}
                            {String(props.riskLevel ?? '—')}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="Aucune trajectoire" description="Ajoutez des tracks côté opérationnel." />
        )}
      </Card>

      <Card
        title="Communes exposées"
        description={
          exposedPhase
            ? `Scores et niveaux pour la phase ${exposedPhase}`
            : 'Dernière évaluation pour chaque commune (toutes phases confondues)'
        }
      >
        <div className="mb-3 max-w-xs">
          <Select
            label="Phase"
            value={exposedPhase}
            onChange={(e) => setExposedPhase(e.target.value)}
            options={[
              { value: '', label: 'Dernière évaluation (toutes phases)' },
              ...PHASES.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>
        {exposedQ.isError ? (
          <AlertBanner tone="danger" title="Échec du chargement">
            Impossible de charger les communes exposées. Réessayez ou rechargez la page.
          </AlertBanner>
        ) : exposedQ.isLoading ? (
          <Spinner />
        ) : exposed.length === 0 ? (
          <EmptyState
            title="Aucune exposition calculée"
            description={
              exposedPhase
                ? `Aucune évaluation pour la phase ${exposedPhase}.`
                : zoneCount > 0
                  ? 'L’exposition est recalculée automatiquement lors de la mise à jour des zones.'
                  : 'Aucune zone d\'influence n\'est définie pour le moment (générée automatiquement).'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line bg-gray-50 text-muted">
                <tr>
                  <th className="px-3 py-2.5">Commune</th>
                  <th className="px-3 py-2.5">Population</th>
                  <th className="px-3 py-2.5">Exposée</th>
                  <th className="px-3 py-2.5">Distance</th>
                  <th className="px-3 py-2.5">Score</th>
                  <th className="px-3 py-2.5">Niveau</th>
                </tr>
              </thead>
              <tbody>
                {exposed.map((row) => (
                  <tr key={row.communeId} className="border-b border-brand/5">
                    <td className="px-3 py-2.5">
                      <Link
                        className="text-brand hover:underline"
                        to={`/territoires/communes/${row.communeId}`}
                      >
                        {row.communeName}
                      </Link>
                      <div className="text-xs text-muted">{row.districtName}</div>
                    </td>
                    <td className="px-3 py-2.5">{formatNumber(row.population)}</td>
                    <td className="px-3 py-2.5">{formatNumber(row.exposedPopulation)}</td>
                    <td className="px-3 py-2.5">
                      {row.distanceToTrackKm !== null ? `${formatNumber(row.distanceToTrackKm)} km` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.riskScore !== null ? formatNumber(row.riskScore) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.riskLevel ? (
                        <Badge tone={tone(row.riskLevel)}>{RISK_LABELS[row.riskLevel]}</Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AdministrativeInterventionPanel
        title={`Événement ${ev.eventCode} — corrections et relances`}
      >
        <Card
          title="Cycle de vie"
          description={
            nextStatus
              ? `Statut actuel : ${ev.status} · prochaine étape automatique : ${nextStatus}`
              : `Statut actuel : ${ev.status} · cycle de vie terminé`
          }
        >
          <ol className="flex flex-wrap items-center gap-y-3">
            {STATUSES.map((s, i) => {
              const idx = STATUSES.indexOf(ev.status);
              const done = i < idx;
              const at = i === idx;
              const allowed = isStatusTransitionAllowed(s);
              return (
                <li key={s} className="flex items-center">
                  <button
                    type="button"
                    disabled={!allowed || statusM.isPending}
                    onClick={() => {
                      setConfirmState({
                        open: true,
                        title: `Faire passer l'événement au statut « ${s} »\u00a0?`,
                        variant: 'warning',
                        actionLabel: 'Confirmer le changement de statut',
                        contextLabel: 'Statut',
                        contextValue: s,
                        onConfirm: () => statusM.mutate(s),
                      });
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      at
                        ? 'border-brand bg-brand text-white shadow-sm'
                        : done
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : allowed
                            ? 'border-line bg-white text-muted hover:border-brand/40 hover:text-brand'
                            : 'cursor-not-allowed border-line bg-canvas text-slate-400',
                    )}
                  >
                    <span className="flex size-4 items-center justify-center">
                      {done ? (
                        <Check className="size-3" />
                      ) : (
                        <span className="text-[10px] font-bold">{i + 1}</span>
                      )}
                    </span>
                    {s}
                  </button>
                  {i < STATUSES.length - 1 ? (
                    <span
                      className={cn(
                        'mx-2 h-px w-4 sm:w-6',
                        done || at ? 'bg-emerald-300' : 'bg-line',
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted">
            L&apos;événement avance automatiquement dans l&apos;ordre BROUILLON → PREVISION →
            ACTIF → SUIVI → CLOTURE. Le retour en arrière est réservé aux SUPER_ADMIN (et
            uniquement si l&apos;événement n&apos;a aucune donnée).
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Point de trajectoire"
            description={`Étape 1 · ${isTrackRequired ? 'le chemin emprunté par le phénomène' : 'optionnelle — le chemin du phénomène s’il se déplace'}`}
          >
            <div className="space-y-2">
              <Input
                label="Latitude"
                value={trackPoint.lat}
                onChange={(e) => setTrackPoint((p) => ({ ...p, lat: e.target.value }))}
              />
              <Input
                label="Longitude"
                value={trackPoint.lng}
                onChange={(e) => setTrackPoint((p) => ({ ...p, lng: e.target.value }))}
              />
              <Select
                label="Type"
                value={trackPoint.trackType}
                onChange={(e) => setTrackPoint((p) => ({ ...p, trackType: e.target.value }))}
                options={[
                  { value: 'OBSERVEE', label: 'OBSERVEE' },
                  { value: 'PREVUE', label: 'PREVUE' },
                ]}
              />
              <Button className="w-full" loading={trackM.isPending} onClick={() => trackM.mutate()}>
                Ajouter le point
              </Button>
              <p className="text-xs text-muted">
                {trackCount >= 2
                  ? `${trackCount} point${trackCount > 1 ? 's' : ''} ajouté${trackCount > 1 ? 's' : ''} — la ligne est tracée.`
                  : isTrackRequired
                    ? `Ajoutez au moins 2 points (OBSERVEE = passé, PREVUE = prévu). ${trackCount} point${trackCount > 1 ? 's' : ''} ajouté${trackCount > 1 ? 's' : ''}.`
                    : `Optionnel — vous pouvez tracer une trajectoire si le phénomène se déplace, sinon passez directement à la « Zone polygonale » (étape 2).`}
              </p>
            </div>
          </Card>

          <Card title="Bande tampon" description="Étape 2 · élargit la trajectoire d'un rayon puis relance l'exposition et les risques">
            <form className="space-y-2" onSubmit={areaForm.handleSubmit((v) => areaM.mutate(v))}>
              <Select
                label="Phase"
                {...areaForm.register('phase')}
                options={PHASES.map((p) => ({ value: p, label: p }))}
              />
              <Select
                label="Niveau"
                {...areaForm.register('riskLevel')}
                options={LEVELS.map((p) => ({ value: p, label: p }))}
              />
              <Input
                label="Rayon (km)"
                type="number"
                min={1}
                max={500}
                {...areaForm.register('radiusKm')}
                error={areaForm.formState.errors.radiusKm?.message}
              />
              <Button type="submit" loading={areaM.isPending} disabled={trackCount < 2} className="w-full">
                Relancer le calcul de zone
              </Button>
              <p className="text-xs text-muted">
                {trackCount < 2
                  ? `Nécessite au moins 2 points de trajectoire (actuellement ${trackCount}). Pour un événement sans trajectoire, utilisez la « Zone polygonale ».`
                  : "Élargit la trajectoire d'un rayon, puis relance l'exposition (étape 3) et les risques (étape 4)."}
              </p>
            </form>
          </Card>

          <Card title="Zone polygonale (dessin)" description="Étape 2 · périmètre tracé à la main — recommandé pour les événements sans trajectoire">
            <div className="space-y-2">
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
              <PolygonDrawMap points={polygonPoints} onChange={setPolygonPoints} height={240} />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="secondary"
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints((p) => p.slice(0, -1))}
                >
                  Annuler le point
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints([])}
                >
                  Effacer
                </Button>
              </div>
              <Button
                className="w-full"
                loading={polygonM.isPending}
                disabled={polygonPoints.length < 3}
                onClick={() => {
                  const ring: Polygon['coordinates'][number] = [
                    ...polygonPoints.map(([lat, lng]) => [lng, lat] as [number, number]),
                    [polygonPoints[0][1], polygonPoints[0][0]],
                  ];
                  polygonM.mutate({
                    phase: polyForm.phase,
                    riskLevel: polyForm.riskLevel,
                    geometry: { type: 'Polygon', coordinates: [ring] },
                  });
                }}
              >
                Définir la zone ({polygonPoints.length} point{polygonPoints.length > 1 ? 's' : ''})
              </Button>
            </div>
          </Card>

          <Card title="Exposition & évaluation" description="Étapes 3 et 4 · communes exposées puis niveaux de risque par phase">
            <div className="space-y-2">
              <Button
                className="w-full"
                variant="secondary"
                loading={exposureM.isPending}
                disabled={zoneCount === 0}
                onClick={() => {
                  setConfirmState({
                    open: true,
                    title: "Relancer le calcul d'exposition pour toutes les zones\u00a0?",
                    variant: 'warning',
                    actionLabel: 'Confirmer le recalcul',
                    onConfirm: () => exposureM.mutate(),
                  });
                }}
              >
                Relancer le calcul d’exposition
              </Button>
              <div className="flex items-end gap-2">
                <Select
                  label="Phase"
                  value={riskPhase}
                  disabled={zoneCount === 0}
                  onChange={(e) => setRiskPhase(e.target.value as RiskPhase)}
                  options={PHASES.map((p) => ({ value: p, label: p }))}
                  className="flex-1 [&>select]:h-9"
                />
                <Button
                  className="shrink-0"
                  variant="outline"
                  loading={risksM.isPending}
                  disabled={zoneCount === 0}
                  onClick={() => {
                    setConfirmState({
                      open: true,
                      title: `Relancer le calcul des risques pour la phase ${riskPhase}\u00a0?`,
                      variant: 'warning',
                      actionLabel: 'Confirmer le recalcul',
                      contextLabel: 'Phase',
                      contextValue: riskPhase,
                      onConfirm: () => risksM.mutate(riskPhase),
                    });
                  }}
                >
                  Relancer le calcul des risques
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {selectedMapCommune ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/15 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{selectedMapCommune.communeName}</p>
              <p className="text-xs text-muted">
                Niveau :{' '}
                {selectedMapCommune.riskLevel ? (
                  <Badge tone={tone(selectedMapCommune.riskLevel as RiskLevel)}>
                    {RISK_LABELS[selectedMapCommune.riskLevel as RiskLevel]}
                  </Badge>
                ) : (
                  '—'
                )}
                {selectedMapCommune.riskScore != null
                  ? ` · Score : ${formatNumber(selectedMapCommune.riskScore)}`
                  : ''}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              loading={removeExposedM.isPending}
              onClick={() => {
                setConfirmState({
                  open: true,
                  title: `Retirer ${selectedMapCommune.communeName} de l'exposition\u00a0?`,
                  variant: 'destructive',
                  actionLabel: 'Confirmer le retrait',
                  contextLabel: 'Commune',
                  contextValue: selectedMapCommune.communeName,
                  onConfirm: () => removeExposedM.mutate(selectedMapCommune.communeId),
                });
              }}
            >
              <XCircle className="size-3.5" /> Retirer une commune exposée erronée
            </Button>
          </div>
        ) : (
          <>
            {areas?.features?.length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Supprimer une zone erronée
                </p>
                {areas.features.map((f) => {
                  const props = (f.properties ?? {}) as Record<string, unknown>;
                  const areaId = String(props.areaId ?? '');
                  const isBuffer = props.radiusKm != null;
                  return (
                    <div
                      key={areaId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {isBuffer
                            ? `Bande tampon · ${String(props.radiusKm)} km`
                            : 'Zone polygonale'}
                        </p>
                        <p className="text-xs text-muted">
                          Phase : {String(props.phase ?? '—')} · Niveau :{' '}
                          {String(props.riskLevel ?? '—')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        loading={deleteAreaM.isPending && deleteAreaM.variables === areaId}
                        onClick={() => {
                          setConfirmState({
                            open: true,
                            title: 'Supprimer cette zone erronée\u00a0?',
                            variant: 'destructive',
                            actionLabel: 'Confirmer la suppression',
                            contextLabel: 'Zone',
                            contextValue: isBuffer
                              ? `Bande tampon · ${String(props.radiusKm)} km`
                              : 'Zone polygonale',
                            onConfirm: () => deleteAreaM.mutate(areaId),
                          });
                        }}
                      >
                        <Trash2 className="size-3.5" /> Supprimer une zone erronée
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {exposed.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Retirer une commune exposée erronée
                </p>
                <div className="flex items-end gap-2">
                  <Select
                    label="Commune"
                    className="flex-1 [&>select]:h-9"
                    value={removeCommuneId}
                    onChange={(e) => setRemoveCommuneId(e.target.value)}
                    options={exposed.map((r) => ({ value: r.communeId, label: r.communeName }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={!removeCommuneId}
                    loading={removeExposedM.isPending}
                    onClick={() => {
                      setConfirmState({
                        open: true,
                        title: "Retirer cette commune de l'exposition\u00a0?",
                        variant: 'destructive',
                        actionLabel: 'Confirmer le retrait',
                        onConfirm: () => removeExposedM.mutate(removeCommuneId),
                      });
                    }}
                  >
                    <XCircle className="size-3.5" /> Retirer une commune exposée erronée
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </AdministrativeInterventionPanel>
        </>
      ) : activeTab === 'chronologie' ? (
        <EventChronologieTab eventId={ev.id} />
      ) : (
        <EventBilanTab eventId={ev.id} />
      )}
      <AdministrativeActionConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        actionLabel={confirmState.actionLabel}
        isPending={
          statusM.isPending ||
          exposureM.isPending ||
          risksM.isPending ||
          deleteAreaM.isPending ||
          removeExposedM.isPending
        }
        onConfirm={confirmState.onConfirm}
        contextLabel={confirmState.contextLabel}
        contextValue={confirmState.contextValue}
      />
    </div>
  );
}
