import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FeatureCollection, Polygon } from 'geojson';
import type { z } from 'zod';
import { eventsApi } from '@/api';
import type { EventListItem, EventStatus, RiskLevel, RiskPhase } from '@/types';
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
import { formatDate, formatNumber } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { useCrisisStore } from '@/stores/crisisStore';

const STATUSES: EventStatus[] = ['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'];
const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];
const LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

interface ExposedRow {
  communeId?: string;
  communeName?: string;
  name?: string;
  population?: number | null;
  exposureScore?: number | null;
  [key: string]: unknown;
}

type AreaForm = z.infer<typeof calculateAreaSchema>;

export function EvenementDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const setActiveEventId = useCrisisStore((s) => s.setActiveEventId);
  const [trackPoint, setTrackPoint] = useState({ lat: '', lng: '', trackType: 'PREVUE' });
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
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
    queryKey: ['event', id, 'exposed'],
    queryFn: () => eventsApi.exposedCommunes(id, { page: 1, limit: 50 }),
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
  const exposed = (exposedQ.data?.data ?? []) as unknown as ExposedRow[];
  const tracks = tracksQ.data as FeatureCollection | undefined;
  const areas = areasQ.data as FeatureCollection | undefined;

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
          <Card title="Actions de statut" description="Réservé ADMIN / SUPER_ADMIN">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ev.status === s ? 'primary' : 'outline'}
                  loading={statusM.isPending}
                  onClick={() => statusM.mutate(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Zone d’influence">
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
                <Button type="submit" loading={areaM.isPending} className="w-full">
                  Calculer
                </Button>
              </form>
            </Card>

            <Card title="Zone polygonale (dessin)">
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
                  Cliquez la carte pour tracer la zone (≥ 3 points). Aucune trajectoire requise.
                </p>
              </div>
            </Card>

            <Card title="Exposition & risques">
              <div className="space-y-2">
                <Button
                  className="w-full"
                  variant="secondary"
                  loading={exposureM.isPending}
                  onClick={() => exposureM.mutate()}
                >
                  Calculer exposition (toutes zones)
                </Button>
                <Select
                  label="Phase recalcul risques"
                  id="risk-phase"
                  defaultValue="PENDANT"
                  options={PHASES.map((p) => ({ value: p, label: p }))}
                  onChange={(e) => risksM.mutate(e.target.value as RiskPhase)}
                />
              </div>
            </Card>

            <Card title="Point de trajectoire">
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
                <p className="text-xs text-muted">Astuce : cliquez la carte pour préremplir lat/lng.</p>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      <Card title="Trajectoire / zones" description="GeoJSON tracks + aires">
        {tracksQ.isLoading || areasQ.isLoading ? (
          <Spinner />
        ) : (tracks?.features?.length || areas?.features?.length) ? (
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
        ) : (
          <EmptyState title="Aucune trajectoire" description="Ajoutez des tracks côté opérationnel." />
        )}
      </Card>

      <Card title="Communes exposées">
        {exposedQ.isLoading ? (
          <Spinner />
        ) : exposed.length === 0 ? (
          <EmptyState title="Aucune exposition calculée" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-brand/10 text-muted">
                <tr>
                  <th className="px-2 py-2">Commune</th>
                  <th className="px-2 py-2">Population</th>
                  <th className="px-2 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {exposed.map((row, i) => (
                  <tr key={String(row.communeId ?? i)} className="border-b border-brand/5">
                    <td className="px-2 py-2">
                      {row.communeId ? (
                        <Link
                          className="text-brand hover:underline"
                          to={`/territoires/communes/${row.communeId}`}
                        >
                          {String(row.communeName ?? row.name ?? row.communeId)}
                        </Link>
                      ) : (
                        String(row.communeName ?? row.name ?? '—')
                      )}
                    </td>
                    <td className="px-2 py-2">{formatNumber(row.population as number | null)}</td>
                    <td className="px-2 py-2">{formatNumber(row.exposureScore as number | null)}</td>
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
