import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { eventsApi, territoriesApi } from '@/api';
import {
  availableWindRadiusKm,
  CYCLONE_VIOLET,
  CYCLONE_VIOLET_DEEP,
  documentedWindCircles,
  formatAntananarivo,
  IMPACT_STATE_LABELS,
  OBSERVED_RISK_COLORS,
  OBSERVED_RISK_LABELS,
  VIGILANCE_LEVELS,
} from '@/lib/historical';
import { useTrackPlayback } from '@/lib/useTrackPlayback';
import type {
  EventCommuneImpactRow,
  ObservedRiskLevel,
  RiskLevel,
  TrackStatePoint,
} from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Spinner } from '@/components/ui/Spinner';
import { CommuneImpactLayer } from '@/components/events/CommuneImpactLayer';
import {
  CycloneInformationPanel,
  DetailRow,
} from '@/components/events/CycloneInformationPanel';
import { CycloneMarker } from '@/components/events/CycloneMarker';
import { CycloneWindSwath } from '@/components/events/CycloneWindSwath';
import { EventTrackLayer } from '@/components/events/EventTrackLayer';
import { VigilanceZoneLayer } from '@/components/events/VigilanceZoneLayer';
import {
  HistoricalTimelineControl,
  type TimelineSpeed,
} from '@/components/events/HistoricalTimelineControl';

export interface EventHistoricalMapTabProps {
  eventId: string;
  /** Nom affiché dans le tooltip du cyclone (fourni par la page). */
  eventName?: string | null;
  /** Source documentaire de la trajectoire (niveau événement). */
  sourceName?: string | null;
  sourceUrl?: string | null;
}

function FitBounds({ data }: { data: FeatureCollection | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !data?.features?.length || typeof map?.fitBounds !== 'function') return;
    done.current = true;
    try {
      const bounds = L.geoJSON(data as GeoJSON.GeoJsonObject).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
    } catch {
      // géométrie invalide : on conserve la vue par défaut
    }
  }, [data, map]);
  return null;
}

function observedOnly(points: TrackStatePoint[]): TrackStatePoint[] {
  return points
    .filter((p) => p.trackType === 'OBSERVEE')
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function forecastOnly(points: TrackStatePoint[]): TrackStatePoint[] {
  return points
    .filter((p) => p.trackType === 'PREVUE')
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function SelectedCommune({
  name,
  row,
}: {
  name: string;
  row: EventCommuneImpactRow | null;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Commune sélectionnée
      </p>
      <p className="mt-1 font-display text-base text-ink">{name}</p>
      {!row ? (
        <p className="mt-1 text-xs text-muted">
          Aucun impact documenté à cette date pour cette commune.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-line">
          <DetailRow
            label="Risque observé"
            value={
              <Badge tone="danger">{OBSERVED_RISK_LABELS[row.observedRiskLevel]}</Badge>
            }
          />
          <DetailRow
            label="État"
            value={IMPACT_STATE_LABELS[row.impactState] ?? row.impactState}
          />
          <DetailRow
            label="Premier impact"
            value={formatAntananarivo(row.firstAffectedAt)}
          />
          <DetailRow label="Dernier impact" value={formatAntananarivo(row.lastAffectedAt)} />
          <DetailRow label="Source" value={row.sourceName ?? 'non disponible'} />
          {row.method ? (
            <p className="pt-1.5 text-[11px] leading-snug text-muted">{row.method}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Carte historique (événement CLOTURÉ) : trajectoire observée vérifiée, barre
 * temporelle et impacts communaux datés. Le marqueur violet est une lecture
 * visuelle de la trajectoire importée (best track IBTrACS) — jamais une
 * simulation, et jamais une commune colorée avant son premier impact documenté.
 */
export function EventHistoricalMapTab({
  eventId,
  eventName,
  sourceName,
  sourceUrl,
}: EventHistoricalMapTabProps) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<TimelineSpeed>('1x');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [showVigilance, setShowVigilance] = useState(true);
  // Emprise documentée des vents : couche d'ensemble, affichée par défaut.
  const [showSwath, setShowSwath] = useState(true);

  const tracksQ = useQuery({
    queryKey: ['event', eventId, 'tracks'],
    queryFn: () => eventsApi.tracks(eventId),
    enabled: Boolean(eventId),
  });

  const areasQ = useQuery({
    queryKey: ['event', eventId, 'areas'],
    queryFn: () => eventsApi.areas(eventId),
    enabled: Boolean(eventId),
  });

  const communesQ = useQuery({
    queryKey: ['territories', 'communes', 'map'],
    queryFn: () => territoriesApi.mapCommunes(),
    staleTime: 5 * 60_000,
  });

  const tracks = useMemo(() => tracksQ.data ?? [], [tracksQ.data]);
  const steps = useMemo(() => observedOnly(tracks), [tracks]);
  const forecast = useMemo(() => forecastOnly(tracks), [tracks]);

  // Lecture visuelle : un segment (point observé → point observé) parcouru en
  // 3 s puis reprise au premier point — voir useTrackPlayback.
  const {
    minute,
    setMinute,
    spanMinutes,
    frame,
    position,
    point,
    nextPoint,
    interpolated,
  } = useTrackPlayback(steps, playing, speed);

  const currentPosition = position;
  const activePoint = point;
  const at = activePoint?.observedAt ?? null;

  // Requêtes cadencées sur le point observé courant : la clé ne change qu'au
  // franchissement d'un point, jamais à chaque pixel de déplacement du curseur.
  const stateQ = useQuery({
    queryKey: ['event', eventId, 'track-state', at],
    queryFn: () => eventsApi.trackState(eventId, at ? { at } : undefined),
    enabled: Boolean(eventId && at),
    placeholderData: (prev) => prev,
  });

  const impactsQ = useQuery({
    queryKey: ['event', eventId, 'commune-impacts', at],
    queryFn: () => eventsApi.communeImpacts(eventId, at ? { at } : undefined),
    enabled: Boolean(eventId && at),
    placeholderData: (prev) => prev,
  });

  const affected = useMemo(() => {
    const map = new Map<string, EventCommuneImpactRow>();
    for (const row of impactsQ.data?.communes ?? []) map.set(row.communeId, row);
    return map;
  }, [impactsQ.data]);

  const riskSummary = useMemo(() => {
    const counts = new Map<ObservedRiskLevel, number>();
    for (const row of affected.values()) {
      counts.set(row.observedRiskLevel, (counts.get(row.observedRiskLevel) ?? 0) + 1);
    }
    return counts;
  }, [affected]);

  // Zones de vigilance du bulletin prévisionnel (couche documentaire, jamais un
  // impact observé) : on ne liste que les niveaux réellement présents en base.
  const vigilanceZones = areasQ.data ?? null;
  const vigilanceCount = vigilanceZones?.features?.length ?? 0;
  const vigilanceLevels = useMemo(() => {
    const present = new Set<RiskLevel>();
    for (const feature of vigilanceZones?.features ?? []) {
      const level = (feature.properties as Record<string, unknown> | null)?.riskLevel;
      if (typeof level === 'string' && level in RISK_COLORS) present.add(level as RiskLevel);
    }
    return VIGILANCE_LEVELS.filter((level) => present.has(level));
  }, [vigilanceZones]);

  const traveled = useMemo<Array<[number, number]>>(() => {
    if (!frame || !currentPosition) return [];
    const positions = steps
      .slice(0, frame.index + 1)
      .map((p) => [p.latitude, p.longitude] as [number, number]);
    if (frame.progress > 0) positions.push(currentPosition);
    return positions;
  }, [frame, steps, currentPosition]);

  const radiusKm = availableWindRadiusKm(activePoint);
  const swathCount = useMemo(() => documentedWindCircles(steps).length, [steps]);
  const eventTitle = eventName?.trim() || 'Événement historique';

  if (tracksQ.isLoading || communesQ.isLoading) return <Spinner />;

  if (tracksQ.isError) {
    return (
      <AlertBanner tone="danger">
        Impossible de charger la trajectoire observée de l&apos;événement.
      </AlertBanner>
    );
  }

  if (steps.length === 0) {
    return (
      <Card
        title="Historique — carte temporelle"
        description="Visualisation communale de l'événement historisé"
      >
        <p className="text-sm text-muted">
          Trajectoire historique détaillée non disponible pour cette période.
        </p>
      </Card>
    );
  }

  const atParam = at ?? '';

  return (
    <Card
      title="Historique — carte temporelle"
      description="Lecture de la trajectoire observée (best track IBTrACS) : les communes ne sont colorées qu'après leur premier impact documenté, jamais sur une alerte prévisionnelle. Les zones de vigilance du bulletin sont une couche documentaire distincte (contours tiretés)."
    >
      <HistoricalTimelineControl
        points={steps}
        minute={minute}
        spanMinutes={spanMinutes}
        playing={playing}
        speed={speed}
        interpolated={interpolated}
        onMinuteChange={(value) => {
          setPlaying(false);
          setMinute(value);
        }}
        onTogglePlay={() => {
          if (!playing && spanMinutes > 0 && minute >= spanMinutes) setMinute(0);
          setPlaying((v) => !v);
        }}
        onSpeedChange={(value) => setSpeed(value)}
      />

      {vigilanceCount > 0 ? (
        <label className="mb-3 flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink">
          <input
            type="checkbox"
            className="size-3.5 accent-brand"
            checked={showVigilance}
            onChange={(event) => setShowVigilance(event.target.checked)}
          />
          <span className="font-medium">
            Zones de vigilance du bulletin prévisionnel ({vigilanceCount})
          </span>
          <span className="text-muted">
            — indépendantes du curseur temporel ; aucune commune n&apos;est colorée par cette couche.
          </span>
        </label>
      ) : null}

      {swathCount > 0 ? (
        <label className="mb-3 flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink">
          <input
            type="checkbox"
            className="size-3.5 accent-brand"
            checked={showSwath}
            onChange={(event) => setShowSwath(event.target.checked)}
          />
          <span className="font-medium">
            Emprise documentée des vents ({swathCount} points)
          </span>
          <span className="text-muted">
            — union des rayons de vent publiés par le RSMC, point par point, du premier au dernier
            point documenté (le plus large documenté est retenu quand plusieurs seuils existent), les
            mesures consécutives étant reliées par leurs tangentes. Aucune largeur n&apos;est mesurée
            entre deux points datés, et ce n&apos;est pas un cône d&apos;incertitude : aucune
            incertitude de position n&apos;est publiée pour un événement observé.
          </span>
        </label>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="relative h-[26rem] overflow-hidden rounded-xl border border-line">
          <MapContainer
            center={[-19.4, 47.5]}
            zoom={6}
            minZoom={4}
            scrollWheelZoom
            zoomControl={false}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoomControl position="bottomright" />
            <FitBounds data={communesQ.data ?? null} />

            {showSwath ? <CycloneWindSwath points={steps} /> : null}

            {showVigilance && vigilanceCount > 0 ? (
              <VigilanceZoneLayer data={vigilanceZones} />
            ) : null}

            <CommuneImpactLayer
              data={communesQ.data ?? null}
              affected={affected}
              selectedId={selected?.id ?? null}
              onCommuneClick={(communeId, name) => setSelected({ id: communeId, name })}
            />

            <EventTrackLayer observed={steps} forecast={forecast} traveled={traveled} />

            {currentPosition && activePoint ? (
              <CycloneMarker
                position={currentPosition}
                point={activePoint}
                interpolated={interpolated}
                eventName={eventTitle}
                sourceName={sourceName}
                sourceUrl={sourceUrl}
              />
            ) : null}

            <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[min(16rem,75%)] rounded-lg border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
              <p className="mb-1 font-semibold text-ink">Risque observé (impact documenté)</p>
              <ul className="space-y-1">
                {(Object.keys(OBSERVED_RISK_COLORS) as ObservedRiskLevel[]).map((level) => (
                  <li key={level} className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-sm"
                      style={{ background: OBSERVED_RISK_COLORS[level] }}
                    />
                    {OBSERVED_RISK_LABELS[level]}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ background: CYCLONE_VIOLET, boxShadow: `0 0 0 2px ${CYCLONE_VIOLET_DEEP}55` }}
                  />
                  Centre du cyclone (observé)
                </li>
                {showSwath && swathCount > 0 ? (
                  <li className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-sm"
                      style={{ background: `${CYCLONE_VIOLET}1f` }}
                    />
                    Emprise documentée des vents
                  </li>
                ) : null}
                <li className="flex items-center gap-2 text-muted">
                  <span
                    className="inline-block size-3 rounded-full border border-dashed"
                    style={{
                      borderColor: CYCLONE_VIOLET_DEEP,
                      backgroundColor: `${CYCLONE_VIOLET}29`,
                    }}
                  />
                  {radiusKm != null
                    ? `${activePoint?.radiusMeasureType ?? 'Rayon de vent'} — ${radiusKm} km`
                    : 'Aucun rayon de vent fiable dans les données vérifiées'}
                </li>
                <li className="flex items-center gap-2 text-muted">
                  <span className="inline-block size-3 rounded-sm border border-slate-200 bg-slate-50" />
                  Non affectée au temps choisi
                </li>
              </ul>
              {showVigilance && vigilanceLevels.length > 0 ? (
                <>
                  <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Zones de vigilance (prévision)
                  </p>
                  <ul className="space-y-1 text-muted">
                    {vigilanceLevels.map((level) => (
                      <li key={level} className="flex items-center gap-2">
                        <span
                          className="inline-block size-3 rounded-sm border border-dashed"
                          style={{ borderColor: RISK_COLORS[level] }}
                        />
                        {RISK_LABELS[level]}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-muted">
                Le passage du marqueur est une lecture de la trajectoire importée ; la couleur des
                communes vient uniquement d&apos;un impact daté. Les zones de vigilance reprennent le
                bulletin prévisionnel, sans contaminer les impacts observés.
              </p>
            </div>
          </MapContainer>
        </div>

        <div className="flex flex-col gap-3 lg:max-h-[26rem] lg:overflow-y-auto">
          <CycloneInformationPanel
            point={activePoint}
            nextPoint={nextPoint}
            interpolated={interpolated}
            method={stateQ.data?.method ?? null}
            hasRadiusData={stateQ.data?.hasRadiusData ?? false}
            radiusSource={stateQ.data?.radiusSource ?? null}
            radiusMeasureType={activePoint?.radiusMeasureType ?? null}
          />

          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Communes affectées
              </p>
              <Badge tone={affected.size > 0 ? 'brand' : 'neutral'}>{affected.size}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {affected.size === 0
                ? 'Aucune commune dont le premier impact documenté est atteint.'
                : `Premiers impacts documentés jusqu'au ${formatAntananarivo(atParam)} (heure de Madagascar).`}
            </p>
            {affected.size > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(OBSERVED_RISK_COLORS) as ObservedRiskLevel[])
                  .filter((level) => (riskSummary.get(level) ?? 0) > 0)
                  .map((level) => (
                    <li
                      key={level}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px]"
                    >
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{ background: OBSERVED_RISK_COLORS[level] }}
                      />
                      {OBSERVED_RISK_LABELS[level]} · {riskSummary.get(level)}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>

          {selected ? (
            <SelectedCommune
              name={selected.name}
              row={affected.get(selected.id) ?? null}
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Commune sélectionnée
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                Cliquez une commune sur la carte pour consulter son impact daté et sa source.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
