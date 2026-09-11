import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FeatureCollection, Polygon } from 'geojson';
import type { z } from 'zod';
import { eventsApi } from '@/api';
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
import { Check, Trash2 } from 'lucide-react';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { useCrisisStore } from '@/stores/crisisStore';

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
}: {
  step: number;
  label: string;
  note: string;
  done: boolean;
  locked: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2',
        done
          ? 'border-emerald-300 bg-emerald-50'
          : locked
            ? 'border-brand/10 bg-white'
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
            locked && !done ? 'text-muted' : 'text-ink',
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
  const [trackPoint, setTrackPoint] = useState({ lat: '', lng: '', trackType: 'PREVUE' });
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [exposedPhase, setExposedPhase] = useState('');
  const [polyForm, setPolyForm] = useState<{ phase: RiskPhase; riskLevel: RiskLevel }>({
    phase: 'PENDANT',
    riskLevel: 'ELEVE',
  });

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

  const invalidateEvent = () => {
    void qc.invalidateQueries({ queryKey: ['event', id] });
  };

  const statusM = useMutation({
    mutationFn: (status: string) => eventsApi.updateStatus(id, status),
    onSuccess: () => {
      toast('Statut mis à jour', 'success');
      invalidateEvent();
      void qc.invalidateQueries({ queryKey: ['events'] });
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
    },
    onError: (err) =>
      toast(err instanceof ApiClientError ? err.message : 'Erreur suppression zone', 'error'),
  });

  const risksM = useMutation({
    mutationFn: (phase: RiskPhase) => eventsApi.recalculateRisks(id, { phase }),
    onSuccess: () => toast('Risques recalculés', 'success'),
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error'),
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

      {ev.description ? (
        <Card>
          <p className="text-sm text-ink">{ev.description}</p>
        </Card>
      ) : null}

      {canManageOps(role) ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <WorkflowStep
              step={1}
              label="Trajectoire"
              note={
                trackCount >= 2
                  ? `${trackCount} point${trackCount > 1 ? 's' : ''} sur la ligne`
                  : isTrackRequired
                    ? `${trackCount} point${trackCount > 1 ? 's' : ''} — 2 minimum requis`
                    : 'Optionnelle — utilisez la zone polygonale (étape 2)'
              }
              done={trackCount >= 2}
              locked={isTrackRequired && trackCount < 2}
            />
            <WorkflowStep
              step={2}
              label="Zone d’influence"
              note={
                zoneCount > 0
                  ? `${zoneCount} zone${zoneCount > 1 ? 's' : ''} définie${zoneCount > 1 ? 's' : ''}`
                  : isTrackRequired
                    ? 'Bande tampon (après trajectoire) ou polygone'
                    : 'Polygone dessiné (≥ 3 points) ou bande tampon'
              }
              done={zoneCount > 0}
              locked={isTrackRequired && trackCount < 2 && zoneCount === 0}
            />
            <WorkflowStep
              step={3}
              label="Exposition"
              note={
                hasExposure ? `${exposed.length} communes exposées` : 'Communes intersectées par les zones'
              }
              done={hasExposure}
              locked={zoneCount === 0}
            />
            <WorkflowStep
              step={4}
              label="Risques"
              note={hasRiskScores ? 'Niveaux par commune' : 'Scores après exposition'}
              done={hasRiskScores}
              locked={!hasExposure}
            />
          </div>

          <Card
            title="Actions de statut"
            description={
              nextStatus
                ? `Statut actuel : ${ev.status} · prochaine étape : ${nextStatus}`
                : `Statut actuel : ${ev.status} · cycle terminé`
            }
          >
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ev.status === s ? 'primary' : 'outline'}
                  loading={statusM.isPending}
                  disabled={!isStatusTransitionAllowed(s)}
                  onClick={() => statusM.mutate(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Avance uniquement dans l&apos;ordre BROUILLON → PREVISION → ACTIF → SUIVI → CLOTURE.
              {role === 'SUPER_ADMIN'
                ? ' Retour à BROUILLON possible seulement si l’événement n’a aucune donnée (trajectoire, zones, exposition, alertes, risques, rapports).'
                : ' Le retour en arrière est réservé aux SUPER_ADMIN.'}
            </p>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Zone d’influence" description="Étape 2 · bande tampon autour de la trajectoire">
              <form
                className="space-y-2"
                onSubmit={areaForm.handleSubmit((v) => areaM.mutate(v))}
              >
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
                  Calculer
                </Button>
                <p className="text-xs text-muted">
                  {trackCount < 2
                    ? `Nécessite au moins 2 points de trajectoire (actuellement ${trackCount}). Pour un événement sans trajectoire, utilisez la « Zone polygonale » à côté.`
                    : "Élargit la trajectoire d'un rayon, puis lance automatiquement l'exposition (étape 3) et les risques (étape 4)."}
                </p>
              </form>
            </Card>

            <Card title="Zone polygonale (dessin)" description="Étape 2 · pour les événements sans trajectoire">
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
                <p className="text-xs text-muted">
                  Tracez le périmètre touché à la main (≥ 3 points).
                  {isTrackRequired
                    ? ' Alternative au tracé automatique sur trajectoire.'
                    : ' Méthode recommandée car ce type d’événement n’a pas de trajectoire. Alimente les étapes 3 (exposition) et 4 (risques).'}
                </p>
              </div>
            </Card>

            <Card title="Exposition & risques" description="Étapes 3 et 4 · après la création d'une zone">
              <div className="space-y-2">
                <Button
                  className="w-full"
                  variant="secondary"
                  loading={exposureM.isPending}
                  disabled={zoneCount === 0}
                  onClick={() => exposureM.mutate()}
                >
                  Calculer exposition (toutes zones)
                </Button>
                <Select
                  label="Phase recalcul risques"
                  id="risk-phase"
                  defaultValue="PENDANT"
                  disabled={zoneCount === 0}
                  options={PHASES.map((p) => ({ value: p, label: p }))}
                  onChange={(e) => risksM.mutate(e.target.value as RiskPhase)}
                />
                <p className="text-xs text-muted">
                  {zoneCount === 0
                    ? "Étape 3 · calculez d'abord une zone d'influence ou tracez une zone polygonale."
                    : hasExposure
                      ? 'Recalcul risques : scores puis niveaux par commune pour la phase choisie.'
                      : 'Exposition pas encore calculée — lancez « Calculer exposition » puis choisissez la phase.'}
                </p>
              </div>
            </Card>

            <Card title="Point de trajectoire" description={`Étape 1 · ${isTrackRequired ? 'le chemin emprunté par le phénomène' : 'optionnelle — le chemin du phénomène s’il se déplace'}`}>
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
                <Button
                  className="w-full"
                  loading={trackM.isPending}
                  onClick={() => trackM.mutate()}
                >
                  Ajouter le point
                </Button>
                <p className="text-xs text-muted">
                  {trackCount >= 2
                    ? `${trackCount} point${trackCount > 1 ? 's' : ''} ajouté${trackCount > 1 ? 's' : ''} — la ligne est tracée, vous pouvez passer à l'étape 2.`
                    : isTrackRequired
                      ? `Ajoutez au moins 2 points (OBSERVEE = passé, PREVUE = prévu) pour tracer la ligne. ${trackCount} point${trackCount > 1 ? 's' : ''} ajouté${trackCount > 1 ? 's' : ''}.`
                      : `Optionnel — vous pouvez tracer une trajectoire si le phénomène se déplace, sinon passez directement à la « Zone polygonale » (étape 2).`}{' '}
                  Astuce : cliquez la carte « Trajectoire / zones » pour préremplir lat/lng.
                </p>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      <Card title="Trajectoire / zones" description="GeoJSON tracks + aires">
        {tracksQ.isLoading || areasQ.isLoading ? (
          <Spinner />
        ) : (tracks?.features?.length || areas?.features?.length) ? (
          <>
            <GeoJsonMap
              data={
                {
                  type: 'FeatureCollection',
                  features: [...(tracks?.features ?? []), ...(areas?.features ?? [])],
                } as FeatureCollection
              }
              height={420}
              showLegend={false}
              onFeatureClick={(f) => {
                const geom = f.geometry;
                if (geom.type === 'Point') {
                  const [lng, lat] = geom.coordinates;
                  setTrackPoint((p) => ({
                    ...p,
                    lat: String(lat),
                    lng: String(lng),
                  }));
                }
              }}
            />
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
                        {canManageOps(role) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            loading={deleteAreaM.isPending && deleteAreaM.variables === areaId}
                            onClick={() => deleteAreaM.mutate(areaId)}
                          >
                            <Trash2 className="size-3.5" /> Supprimer
                          </Button>
                        ) : null}
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
        {exposedQ.isLoading ? (
          <Spinner />
        ) : exposed.length === 0 ? (
          <EmptyState
            title="Aucune exposition calculée"
            description={
              exposedPhase
                ? `Aucune évaluation pour la phase ${exposedPhase} — lancez « Phase recalcul risques » avec cette phase.`
                : zoneCount > 0
                  ? 'Lancez « Calculer exposition (toutes zones) » — étape 3.'
                  : 'Créez d\'abord une zone d\'influence ou tracez une zone polygonale (étape 2).'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-brand/10 text-muted">
                <tr>
                  <th className="px-2 py-2">Commune</th>
                  <th className="px-2 py-2">Population</th>
                  <th className="px-2 py-2">Exposée</th>
                  <th className="px-2 py-2">Distance</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">Niveau</th>
                </tr>
              </thead>
              <tbody>
                {exposed.map((row) => (
                  <tr key={row.communeId} className="border-b border-brand/5">
                    <td className="px-2 py-2">
                      <Link
                        className="text-brand hover:underline"
                        to={`/territoires/communes/${row.communeId}`}
                      >
                        {row.communeName}
                      </Link>
                      <div className="text-xs text-muted">{row.districtName}</div>
                    </td>
                    <td className="px-2 py-2">{formatNumber(row.population)}</td>
                    <td className="px-2 py-2">{formatNumber(row.exposedPopulation)}</td>
                    <td className="px-2 py-2">
                      {row.distanceToTrackKm !== null ? `${formatNumber(row.distanceToTrackKm)} km` : '—'}
                    </td>
                    <td className="px-2 py-2">
                      {row.riskScore !== null ? formatNumber(row.riskScore) : '—'}
                    </td>
                    <td className="px-2 py-2">
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
    </div>
  );
}
