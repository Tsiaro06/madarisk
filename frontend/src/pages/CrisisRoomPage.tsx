import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CloudSun } from 'lucide-react';
import { alertsApi, eventsApi, risksApi, territoriesApi, weatherApi } from '@/api';
import type { CommuneDetail, EventTrack, ExposedCommuneInfo } from '@/types';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { ActiveEventProvider, useActiveEvent } from '@/stores/activeEvent';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { CrisisHeader } from '@/components/crisis/CrisisHeader';
import { CrisisSideRail } from '@/components/crisis/CrisisSideRail';
import { LeftPanel } from '@/components/crisis/LeftPanel';
import { RightPanel } from '@/components/crisis/RightPanel';
import { CrisisMap } from '@/components/crisis/CrisisMap';
import { CreateEventModal } from '@/components/crisis/CreateEventModal';
import { buildExposureIndex } from '@/lib/crisisData';
import { cn, formatDate } from '@/lib/utils';

const REFRESH_INTERVAL_MS = 5 * 60_000;

function syncStatusLabel(status?: string): string {
  if (status === 'FRESH') return 'Fraîches';
  if (status === 'STALE') return 'Périmées';
  if (status === 'NEVER') return 'Jamais synchronisées';
  return 'Indisponibles';
}

interface FocusTarget {
  geometry: unknown;
  nonce: number;
}

function CrisisRoomView() {
  const { activeEvent, activeEventId, setActiveEventId } = useActiveEvent();
  const queryClient = useQueryClient();
  const isFetchingAny = useIsFetching();

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileLeft, setMobileLeft] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCommuneId, setSelectedCommuneId] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState(0);
  const [urgentDismissed, setUrgentDismissed] = useState(false);
  const [mapPhase, setMapPhase] = useState('');
  const [districtId, setDistrictId] = useState('');

  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canManageOps(role);

  const detailQ = useQuery<CommuneDetail | null>({
    queryKey: ['commune-detail', selectedCommuneId],
    queryFn: () => (selectedCommuneId ? territoriesApi.commune(selectedCommuneId) : null),
    enabled: Boolean(selectedCommuneId),
    staleTime: 60_000,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const focusGeometry = detailQ.data?.geometry ?? detailQ.data?.commune.centroid ?? null;
  const focusTarget: FocusTarget | null =
    focusReq && focusGeometry ? { geometry: focusGeometry, nonce: focusReq } : null;

  const risksQ = useQuery({
    queryKey: ['risks', 'map-layer', activeEventId, mapPhase],
    queryFn: () =>
      risksApi.mapLayer(
        activeEventId
          ? { eventId: activeEventId, ...(mapPhase ? { phase: mapPhase } : {}) }
          : {},
      ),
    enabled: Boolean(activeEventId),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const communesQ = useQuery({
    queryKey: ['communes', 'map-layer', activeEventId, districtId],
    queryFn: () =>
      territoriesApi.mapCommunes(
        activeEventId || districtId
          ? {
              ...(activeEventId ? { eventId: activeEventId } : {}),
              ...(districtId ? { districtId } : {}),
            }
          : {},
      ),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const districtsQ = useQuery({
    queryKey: ['territories', 'map-districts'],
    queryFn: () => territoriesApi.mapDistricts({}),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const hasEventCommunes = Boolean(communesQ.data?.features?.length);
  const riskLayer = risksQ.data?.features?.length ? (risksQ.data ?? null) : null;
  const communeLayer = hasEventCommunes ? (communesQ.data ?? null) : null;

  const weatherQ = useQuery({
    queryKey: ['weather', 'map-layer', activeEventId, districtId],
    queryFn: () =>
      weatherApi.mapLayer(
        activeEventId || districtId
          ? {
              ...(activeEventId ? { eventId: activeEventId } : {}),
              ...(districtId ? { districtId } : {}),
            }
          : {},
      ),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const trackQ = useQuery({
    queryKey: ['event', 'track', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.trackGeoJson(activeEventId) : null),
    enabled: Boolean(activeEventId),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const trackPointsQ = useQuery<EventTrack[]>({
    queryKey: ['event', 'track-points', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.tracks(activeEventId) : []),
    enabled: Boolean(activeEventId),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const areasQ = useQuery({
    queryKey: ['event', 'areas', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.areas(activeEventId) : null),
    enabled: Boolean(activeEventId),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const exposureQ = useQuery({
    queryKey: ['event', 'exposure', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.exposureGeoJson(activeEventId) : null),
    enabled: Boolean(activeEventId),
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const exposureIndex = buildExposureIndex(exposureQ.data ?? null);
  const selectedExposure: ExposedCommuneInfo | null = selectedCommuneId
    ? (exposureIndex.info.get(selectedCommuneId) ?? null)
    : null;

  const monitoringQ = useQuery({
    queryKey: ['weather', 'monitoring'],
    queryFn: () => weatherApi.monitoring(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const urgentQ = useQuery({
    queryKey: ['alerts', 'urgent-banner'],
    queryFn: () => alertsApi.list({ activeOnly: true, limit: 5, page: 1 }),
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const urgentAlerts = (urgentQ.data?.data ?? [])
    .filter((a) => a.status === 'PUBLIEE')
    .slice(0, 4);

  const observationSync = monitoringQ.data?.sync?.observations;

  const statusLine = activeEvent
    ? `Màj. ${formatDate(activeEvent.updatedAt)}${activeEvent.sourceName ? ` · ${activeEvent.sourceName}` : ''}`
    : null;
  const weatherLine = observationSync
    ? `Météo ${syncStatusLabel(observationSync.status)}${
        observationSync.lastDataAt ? ` · ${formatDate(observationSync.lastDataAt)}` : ''
      }`
    : null;

  const selectCommune = (id: string, focus: boolean) => {
    setSelectedCommuneId(id);
    setRightOpen(true);
    setMobileRight(true);
    if (focus) setFocusReq((n) => n + 1);
  };

  const handleSelectEvent = (id: string) => {
    setActiveEventId(id);
  };

  const handleRefresh = async () => {
    await queryClient.refetchQueries({ type: 'active' });
  };

  const handleDistrictChange = (id: string) => {
    setDistrictId(id);
    setSelectedCommuneId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      {urgentAlerts.length > 0 && !urgentDismissed ? (
        <div className="px-3 pt-3">
          <AlertBanner tone="danger" title="Alertes actives" onClose={() => setUrgentDismissed(true)}>
            <ul className="space-y-1">
              {urgentAlerts.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <Link to="/alertes" className="underline-offset-2 hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-xs opacity-80">· {a.severity}</span>
                </li>
              ))}
            </ul>
          </AlertBanner>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
            leftOpen ? 'w-80' : 'w-12',
          )}
        >
          {leftOpen ? (
            <LeftPanel
              activeEventId={activeEventId}
              onSelectEvent={handleSelectEvent}
              onSelectCommune={(r) => selectCommune(r.id, true)}
              onClose={() => setLeftOpen(false)}
              districtId={districtId}
              onDistrictChange={handleDistrictChange}
              canCreate={canCreate}
              onCreateEvent={() => setCreateOpen(true)}
              statusLine={statusLine}
              weatherLine={weatherLine}
            />
          ) : (
            <CrisisSideRail
              side="left"
              label="Événements"
              onExpand={() => setLeftOpen(true)}
            />
          )}
        </aside>

        <main className="relative min-w-0 flex-1">
          <CrisisHeader onOpenMobileLeft={() => setMobileLeft(true)} />
          <CrisisMap
            riskLayer={riskLayer}
            communeLayer={communeLayer}
            districtLayer={districtsQ.data ?? null}
            weatherLayer={weatherQ.data ?? null}
            trackLayer={trackQ.data ?? null}
            trackPoints={trackPointsQ.data ?? []}
            areasLayer={areasQ.data ?? null}
            exposedCommuneIds={exposureIndex.exposedIds}
            activeEvent={activeEvent}
            selectedCommuneId={selectedCommuneId}
            onCommuneClick={(id) => selectCommune(id, false)}
            focusTarget={focusTarget}
            mapPhase={mapPhase}
            onMapPhaseChange={setMapPhase}
            refreshing={isFetchingAny > 0}
            onRefresh={() => void handleRefresh()}
          />

          {!activeEventId ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[600] w-80 max-w-[calc(100%-1.5rem)]">
              <div className="pointer-events-auto rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur">
                <p className="font-display text-base font-semibold text-ink">
                  Bienvenue sur la carte
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Pour commencer : choisissez un événement dans la liste à gauche.
                  Sans événement, la carte montre déjà la météo nationale.
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-ink">
                  <li>Ouvrez un événement (prévision, actif ou suivi)</li>
                  <li>Cliquez une commune pour voir le détail à droite</li>
                  <li>Consultez la météo ou les alertes via le menu</li>
                </ol>
                <div className="mt-3 space-y-1.5 text-xs text-ink">
                  <p className="flex items-start gap-1.5">
                    <CloudSun className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    <span>
                      Météo : {syncStatusLabel(observationSync?.status)}
                      {observationSync?.communesData != null
                        ? ` · ${observationSync.communesData} communes`
                        : ''}
                      {observationSync?.lastDataAt
                        ? ` · Obs. ${formatDate(observationSync.lastDataAt)}`
                        : ''}
                    </span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    Alertes actives : {urgentAlerts.length}
                  </p>
                </div>
                <Link
                  to="/meteo"
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-canvas"
                >
                  <CloudSun className="size-4 text-muted" /> Voir la météo
                </Link>
              </div>
            </div>
          ) : null}

          {mobileLeft ? (
            <div
              className="absolute inset-0 z-40 bg-black/30 lg:hidden"
              onClick={() => setMobileLeft(false)}
            >
              <div
                className="flex h-full w-[85%] max-w-80 flex-col bg-canvas shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-h-0 flex-1">
                  <LeftPanel
                    activeEventId={activeEventId}
                    onSelectEvent={handleSelectEvent}
                    onSelectCommune={(r) => selectCommune(r.id, true)}
                    onClose={() => setMobileLeft(false)}
                    districtId={districtId}
                    onDistrictChange={handleDistrictChange}
                    canCreate={canCreate}
                    onCreateEvent={() => setCreateOpen(true)}
                    statusLine={statusLine}
                    weatherLine={weatherLine}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {mobileRight ? (
            <div
              className="absolute inset-0 z-50 flex justify-end bg-black/30 lg:hidden"
              onClick={() => setMobileRight(false)}
            >
              <div
                className="h-full w-[min(26rem,92vw)] bg-canvas shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <RightPanel
                  communeId={selectedCommuneId}
                  detail={detailQ.data ?? null}
                  detailLoading={detailQ.isLoading}
                  hasEvent={Boolean(activeEventId)}
                  exposure={selectedExposure}
                  onClose={() => setMobileRight(false)}
                  onSelectEvent={handleSelectEvent}
                />
              </div>
            </div>
          ) : null}
        </main>

        <aside
          className={cn(
            'hidden shrink-0 border-l border-line bg-surface transition-[width] duration-200 lg:block',
            rightOpen ? 'w-[26rem]' : 'w-12',
          )}
        >
          {rightOpen ? (
            <RightPanel
              communeId={selectedCommuneId}
              detail={detailQ.data ?? null}
              detailLoading={detailQ.isLoading}
              hasEvent={Boolean(activeEventId)}
              exposure={selectedExposure}
              onClose={() => setRightOpen(false)}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <CrisisSideRail
              side="right"
              label="Commune"
              onExpand={() => setRightOpen(true)}
            />
          )}
        </aside>
      </div>

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export function CrisisRoomPage() {
  return (
    <ActiveEventProvider>
      <CrisisRoomView />
    </ActiveEventProvider>
  );
}