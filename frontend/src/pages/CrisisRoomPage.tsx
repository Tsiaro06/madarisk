import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { alertsApi, eventsApi, risksApi, territoriesApi, weatherApi } from '@/api';
import type { CommuneDetail } from '@/types';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { ActiveEventProvider, useActiveEvent } from '@/stores/activeEvent';
import { AiChatBubble } from '@/components/ai/AiChatBubble';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { CrisisHeader } from '@/components/crisis/CrisisHeader';
import { LeftPanel } from '@/components/crisis/LeftPanel';
import { RightPanel } from '@/components/crisis/RightPanel';
import { CrisisMap } from '@/components/crisis/CrisisMap';
import { CreateEventModal } from '@/components/crisis/CreateEventModal';
import { cn } from '@/lib/utils';

interface FocusTarget {
  geometry: unknown;
  nonce: number;
}

function CrisisRoomView() {
  const { activeEvent, activeEventId, setActiveEventId } = useActiveEvent();

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileLeft, setMobileLeft] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCommuneId, setSelectedCommuneId] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState(0);
  const [urgentDismissed, setUrgentDismissed] = useState(false);
  const [mapPhase, setMapPhase] = useState('');

  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canManageOps(role);

  const detailQ = useQuery<CommuneDetail | null>({
    queryKey: ['commune-detail', selectedCommuneId],
    queryFn: () => (selectedCommuneId ? territoriesApi.commune(selectedCommuneId) : null),
    enabled: Boolean(selectedCommuneId),
    staleTime: 60_000,
  });

  const focusGeometry = detailQ.data?.geometry ?? detailQ.data?.commune.centroid ?? null;
  const focusTarget: FocusTarget | null = focusReq && focusGeometry ? { geometry: focusGeometry, nonce: focusReq } : null;

  const risksQ = useQuery({
    queryKey: ['risks', 'map-layer', activeEventId, mapPhase],
    queryFn: () =>
      risksApi.mapLayer(
        activeEventId
          ? { eventId: activeEventId, ...(mapPhase ? { phase: mapPhase } : {}) }
          : {},
      ),
  });

  const communesQ = useQuery({
    queryKey: ['communes', 'map-layer', activeEventId],
    queryFn: () => territoriesApi.mapCommunes(activeEventId ? { eventId: activeEventId } : {}),
  });

  const hasEventCommunes = Boolean(communesQ.data?.features?.length);
  const riskLayer = risksQ.data?.features?.length ? (risksQ.data ?? null) : null;
  const communeLayer = hasEventCommunes ? (communesQ.data ?? null) : null;

  const weatherQ = useQuery({
    queryKey: ['weather', 'map-layer', activeEventId],
    queryFn: () => weatherApi.mapLayer(activeEventId ? { eventId: activeEventId } : {}),
  });

  const trackQ = useQuery({
    queryKey: ['event', 'track', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.trackGeoJson(activeEventId) : null),
    enabled: Boolean(activeEventId),
  });

  const areasQ = useQuery({
    queryKey: ['event', 'areas', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.areas(activeEventId) : null),
    enabled: Boolean(activeEventId),
  });

  const exposedQ = useQuery({
    queryKey: ['event', 'exposed', activeEventId],
    queryFn: () => (activeEventId ? eventsApi.exposedCommunesIds(activeEventId) : null),
    enabled: Boolean(activeEventId),
    staleTime: 30_000,
  });

  const urgentQ = useQuery({
    queryKey: ['alerts', 'urgent-banner'],
    queryFn: () => alertsApi.list({ activeOnly: true, limit: 5, page: 1 }),
    staleTime: 30_000,
  });
  const urgentAlerts = (urgentQ.data?.data ?? []).filter((a) => a.status === 'PUBLIEE').slice(0, 4);

  const selectCommune = (id: string, focus: boolean) => {
    setSelectedCommuneId(id);
    setRightOpen(true);
    setMobileRight(true);
    if (focus) setFocusReq((n) => n + 1);
  };

  const handleSelectEvent = (id: string) => {
    setActiveEventId(id);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <CrisisHeader
        canCreate={canCreate}
        onOpenCreate={() => setCreateOpen(true)}
        leftOpen={leftOpen}
        onToggleLeft={() => {
          setLeftOpen((v) => !v);
          setMobileLeft(false);
        }}
        rightOpen={rightOpen}
        onToggleRight={() => {
          setRightOpen((v) => !v);
          setMobileRight(false);
        }}
      />

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
            'hidden w-80 shrink-0 border-r border-brand/10 bg-canvas lg:block',
            !leftOpen && 'lg:hidden',
          )}
        >
          <LeftPanel
            activeEventId={activeEventId}
            onSelectEvent={handleSelectEvent}
            onSelectCommune={(r) => selectCommune(r.id, true)}
            onClose={() => setLeftOpen(false)}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <CrisisMap
            riskLayer={riskLayer}
            communeLayer={communeLayer}
            weatherLayer={weatherQ.data ?? null}
            trackLayer={trackQ.data ?? null}
            areasLayer={areasQ.data ?? null}
            exposedCommuneIds={exposedQ.data ?? new Set<string>()}
            activeEvent={activeEvent}
            selectedCommuneId={selectedCommuneId}
            onCommuneClick={(id) => selectCommune(id, false)}
            focusTarget={focusTarget}
            mapPhase={mapPhase}
            onMapPhaseChange={setMapPhase}
          />

          {mobileLeft ? (
            <div
              className="absolute inset-0 z-40 bg-black/30 lg:hidden"
              onClick={() => setMobileLeft(false)}
            >
              <div
                className="h-full w-[85%] max-w-80 bg-canvas shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <LeftPanel
                  activeEventId={activeEventId}
                  onSelectEvent={handleSelectEvent}
                  onSelectCommune={(r) => selectCommune(r.id, true)}
                  onClose={() => setMobileLeft(false)}
                />
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
                  onClose={() => setMobileRight(false)}
                  onSelectEvent={handleSelectEvent}
                />
              </div>
            </div>
          ) : null}
        </main>

        <aside
          className={cn(
            'hidden w-[26rem] shrink-0 border-l border-brand/10 bg-canvas lg:block',
            !rightOpen && 'lg:hidden',
          )}
        >
          <RightPanel
            communeId={selectedCommuneId}
            detail={detailQ.data ?? null}
            detailLoading={detailQ.isLoading}
            onClose={() => setRightOpen(false)}
            onSelectEvent={handleSelectEvent}
          />
        </aside>
      </div>

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <AiChatBubble />
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