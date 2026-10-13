import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import {
  Clock,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { eventsApi, territoriesApi } from '@/api';
import type {
  EventCommuneImpactRow,
  ObservedRiskLevel,
  TrackStatePoint,
} from '@/types';
import {
  IMPACT_STATE_LABELS,
  NOT_AFFECTED_FILL,
  OBSERVED_RISK_COLORS,
  OBSERVED_RISK_LABELS,
  deriveRiskFromWind,
  formatAntananarivo,
  formatAntananarivoShort,
  observedSteps,
} from '@/lib/historical';
import { formatNumber } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const SPEEDS = [
  { key: '1x', label: '1×', intervalMs: 800 },
  { key: '2x', label: '2×', intervalMs: 400 },
  { key: '4x', label: '4×', intervalMs: 200 },
] as const;

type SpeedKey = (typeof SPEEDS)[number]['key'];

const OBSERVED_LINE_COLOR = '#03224c';

function FitBounds({ data }: { data: FeatureCollection | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !data?.features?.length) return;
    done.current = true;
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid() && typeof map.fitBounds === 'function') {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
      }
    } catch {
      // géométrie invalide : on conserve la vue par défaut
    }
  }, [data, map]);
  return null;
}

interface HistoricalMapProps {
  communeLayer: FeatureCollection | null;
  affected: Map<string, EventCommuneImpactRow>;
  steps: TrackStatePoint[];
  currentPoint: TrackStatePoint | null;
  selectedId: string | null;
  onCommuneClick: (communeId: string, name: string) => void;
}

function communeFeatureId(p: Record<string, unknown>): string {
  return String(p.communeId ?? p.id ?? '');
}

function neutralCommuneStyle(): PathOptions {
  return {
    color: '#e2e8f0',
    weight: 0.6,
    fillColor: '#f8fafc',
    fillOpacity: 0.06,
    opacity: 0.9,
  };
}

function impactedCommuneStyle(
  row: EventCommuneImpactRow | undefined,
  selected: boolean,
): PathOptions {
  if (!row) return neutralCommuneStyle();
  const fill = OBSERVED_RISK_COLORS[row.observedRiskLevel] ?? NOT_AFFECTED_FILL;
  return {
    color: selected ? '#03224c' : '#475569',
    weight: selected ? 3 : 1.4,
    fillColor: fill,
    fillOpacity: selected ? 0.75 : 0.6,
    opacity: 0.95,
  };
}

function HistoricalMap({
  communeLayer,
  affected,
  steps,
  currentPoint,
  selectedId,
  onCommuneClick,
}: HistoricalMapProps) {
  const geoRef = useRef<L.GeoJSON | null>(null);

  // Applique les couleurs « impact au temps choisi » sans recréer la couche
  // (≈1 700 communes) : style neutre au montage, styles réaffectés à chaque
  // changement de pas via setStyle.
  useEffect(() => {
    const layer = geoRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const feature = (l as L.Layer & { feature?: Feature }).feature;
      if (!feature || !('setStyle' in l)) return;
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const row = affected.get(communeFeatureId(props));
      const selected = selectedId != null && communeFeatureId(props) === selectedId;
      (l as L.Path).setStyle(impactedCommuneStyle(row, selected));
    });
  }, [affected, selectedId]);

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    const name = String(p.commune ?? p.communeName ?? p.name ?? '');
    layer.bindTooltip(name, { sticky: true });
    layer.on({
      click: (e) => {
        L.DomEvent.stop(e.originalEvent);
        onCommuneClick(communeFeatureId(p), name);
      },
    });
  };

  const linePositions: [number, number][] = steps.map((s) => [s.latitude, s.longitude]);

  return (
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
      <FitBounds data={communeLayer} />

      <GeoJSON
        ref={geoRef as never}
        data={communeLayer ?? { type: 'FeatureCollection', features: [] }}
        style={neutralCommuneStyle}
        onEachFeature={onEachFeature}
      />

      {linePositions.length >= 2 ? (
        <Polyline
          positions={linePositions}
          pathOptions={{ color: OBSERVED_LINE_COLOR, weight: 2.5, opacity: 0.85 }}
        />
      ) : null}

      {steps.map((pt) => {
        const isCurrent = currentPoint?.id === pt.id;
        return (
          <CircleMarker
            key={pt.id}
            center={[pt.latitude, pt.longitude]}
            radius={isCurrent ? 7 : 4}
            pathOptions={
              isCurrent
                ? { color: '#1e293b', weight: 2, fillColor: OBSERVED_LINE_COLOR, fillOpacity: 0.95 }
                : { color: '#475569', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.6 }
            }
          >
            <Tooltip>
              {formatAntananarivo(pt.observedAt)} — {pt.latitude.toFixed(2)}°,{' '}
              {pt.longitude.toFixed(2)}°
            </Tooltip>
          </CircleMarker>
        );
      })}

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] max-w-[min(16rem,75%)] rounded-lg border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
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
          <li className="flex items-center gap-2 text-muted">
            <span className="inline-block size-3 rounded-sm border border-slate-200 bg-slate-50" />
            Non encore atteinte au temps choisi
          </li>
        </ul>
      </div>
    </MapContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function riskBadge(level: ObservedRiskLevel | null | undefined) {
  if (!level || level === 'INCONNU') return 'Non disponible';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ background: OBSERVED_RISK_COLORS[level] }}
      />
      {OBSERVED_RISK_LABELS[level]}
    </span>
  );
}

export function EventHistoricalMapTab({ eventId }: { eventId: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>('1x');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const tracksQ = useQuery({
    queryKey: ['event', eventId, 'tracks'],
    queryFn: () => eventsApi.tracks(eventId),
    enabled: Boolean(eventId),
  });

  const communesQ = useQuery({
    queryKey: ['territories', 'communes', 'map'],
    queryFn: () => territoriesApi.mapCommunes(),
    staleTime: 5 * 60_000,
  });

  const steps = useMemo(() => observedSteps(tracksQ.data ?? []), [tracksQ.data]);
  const stepCount = steps.length;
  const idx = Math.min(stepIndex, Math.max(0, stepCount - 1));
  const currentAt = steps[idx]?.observedAt ?? null;

  // État de la trajectoire au temps choisi (endpoint /track-state) : point
  // courant, rayons documentés, méthode — jamais de point inventé.
  const stateQ = useQuery({
    queryKey: ['event', eventId, 'track-state', currentAt ?? 'none'],
    queryFn: () => eventsApi.trackState(eventId, { at: currentAt as string }),
    enabled: Boolean(currentAt),
    placeholderData: (prev) => prev,
  });

  // Communes affectées au temps choisi (endpoint /commune-impacts) : le filtre
  // « premier impact observé ≤ at » est appliqué côté serveur, les communes ne
  // sont donc jamais colorées d'avance.
  const impactsQ = useQuery({
    queryKey: ['event', eventId, 'commune-impacts', currentAt ?? 'none'],
    queryFn: () => eventsApi.communeImpacts(eventId, { at: currentAt as string }),
    enabled: Boolean(currentAt),
    placeholderData: (prev) => prev,
  });

  const affected = useMemo(() => {
    const map = new Map<string, EventCommuneImpactRow>();
    for (const row of impactsQ.data?.communes ?? []) map.set(row.communeId, row);
    return map;
  }, [impactsQ.data]);

  const trackState = stateQ.data ?? null;
  const currentPoint = trackState?.currentPoint ?? null;
  const impactedCount = impactsQ.data?.count ?? 0;

  // Lecture automatique : avance d'un point observé par pas de temps.
  const intervalMs = SPEEDS.find((s) => s.key === speed)?.intervalMs ?? 800;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStepIndex((prev) => {
        if (steps.length === 0 || prev >= steps.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, steps.length, intervalMs]);

  // La sélection est décorrélée de la position temporelle : on relit la ligne
  // d'impact la plus récente disponible pour la commune sélectionnée.
  const selectedRow =
    selectedId != null && affected.get(selectedId) ? affected.get(selectedId) : null;

  const handleCommuneClick = (communeId: string, name: string) => {
    setSelectedId(communeId);
    setSelectedName(name || null);
  };

  if (tracksQ.isLoading || communesQ.isLoading) return <Spinner />;
  if (tracksQ.isError) {
    return (
      <AlertBanner tone="danger">
        Impossible de charger la trajectoire observée de l&apos;événement.
      </AlertBanner>
    );
  }

  if (stepCount === 0) {
    return (
      <Card
        title="Historique — carte temporelle"
        description="Visualisation communale de l'événement historisé"
      >
        <p className="text-sm text-muted">
          Aucune trajectoire observée (best track IBTrACS) n&apos;est enregistrée pour cet
          événement : la barre temporelle nécessite au moins un point observé daté pour
          positionner les impacts communaux.
        </p>
      </Card>
    );
  }

  const pointWind = currentPoint?.windSpeedKmh ?? null;

  return (
    <Card
      title="Historique — carte temporelle"
      description="Communes colorées uniquement après leur premier impact observé (best track IBTrACS · SID 2022024S09090) ; les descriptions de bulletins ne sont jamais converties en coordonnées."
    >
      {/* Barre temporelle */}
      <div className="mb-3 rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPlaying((v) => !v);
              setStepIndex((prev) => (prev >= steps.length - 1 ? 0 : prev));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/40"
            title={playing ? 'Mettre en pause' : 'Lecture automatique'}
          >
            {playing ? (
              <Pause className="size-3.5 text-brand" />
            ) : (
              <Play className="size-3.5 text-brand" />
            )}
            {playing ? 'Pause' : 'Lecture'}
          </button>
          <button
            type="button"
            disabled={idx <= 0}
            onClick={() => {
              setPlaying(false);
              setStepIndex((prev) => Math.max(0, prev - 1));
            }}
            className="rounded-lg border border-line bg-white p-1.5 text-ink transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Point observé précédent"
          >
            <SkipBack className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={idx >= steps.length - 1}
            onClick={() => {
              setPlaying(false);
              setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
            }}
            className="rounded-lg border border-line bg-white p-1.5 text-ink transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Point observé suivant"
          >
            <SkipForward className="size-3.5" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSpeed(s.key)}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs font-semibold transition',
                  speed === s.key
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-white text-muted hover:text-ink',
                )}
                title={`Vitesse de lecture ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, steps.length - 1)}
            step={1}
            value={idx}
            aria-label="Position temporelle (points observés)"
            onChange={(e) => {
              setPlaying(false);
              setStepIndex(Number(e.target.value));
            }}
            className="w-full accent-brand"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {formatAntananarivoShort(steps[0]?.observedAt)}
            </span>
            <span className="font-semibold text-brand-deep">
              {formatAntananarivo(currentAt)}
            </span>
            <span>{formatAntananarivoShort(steps[steps.length - 1]?.observedAt)}</span>
          </div>
        </div>
      </div>

      {/* Carte + panneau de détail */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="relative h-[460px] overflow-hidden rounded-xl border border-line">
          <HistoricalMap
            communeLayer={communesQ.data ?? null}
            affected={affected}
            steps={steps}
            currentPoint={currentPoint}
            selectedId={selectedId}
            onCommuneClick={handleCommuneClick}
          />
        </div>

        <div className="flex max-h-[460px] flex-col gap-3 overflow-y-auto">
          {/* État de la trajectoire au temps choisi */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              État observé au temps choisi
            </p>
            {!currentPoint ? (
              <p className="mt-2 text-sm text-muted">
                Aucune position observée documentée jusqu&apos;à{' '}
                {formatAntananarivo(currentAt)}.
              </p>
            ) : (
              <div className="mt-1 divide-y divide-line">
                <DetailRow
                  label="Position"
                  value={`${currentPoint.latitude.toFixed(2)}°, ${currentPoint.longitude.toFixed(2)}°`}
                />
                <DetailRow
                  label="Vent soutenu"
                  value={
                    pointWind != null ? (
                      <>
                        {formatNumber(pointWind)} km/h ·{' '}
                        <Badge tone={riskTone(deriveRiskFromWind(pointWind))}>
                          {OBSERVED_RISK_LABELS[deriveRiskFromWind(pointWind)]}
                        </Badge>
                      </>
                    ) : (
                      'Non disponible'
                    )
                  }
                />
                <DetailRow
                  label="Rafales"
                  value={
                    currentPoint.gustSpeedKmh != null
                      ? `${formatNumber(currentPoint.gustSpeedKmh)} km/h`
                      : 'Non disponible'
                  }
                />
                <DetailRow
                  label="Pression"
                  value={
                    currentPoint.pressureHpa != null
                      ? `${formatNumber(currentPoint.pressureHpa)} hPa`
                      : 'Non disponible'
                  }
                />
              </div>
            )}
            {trackState && (trackState.hasRadiusData || trackState.radiusMaxKm != null) && currentPoint ? (
              <div className="mt-2 rounded-lg border border-brand/15 bg-brand-soft/20 px-2.5 py-2 text-xs">
                <p className="font-semibold text-brand-deep">Rayons de vent documentés</p>
                <p className="mt-0.5 text-muted">
                  {trackState.radiusSource
                    ? `Source : ${trackState.radiusSource}`
                    : 'Source : non documentée'}
                  {trackState.radiusMaxKm != null
                    ? ` · max ${formatNumber(trackState.radiusMaxKm)} km`
                    : ''}
                </p>
              </div>
            ) : null}
            {trackState?.currentPoint ? (
              <p className="mt-2 text-[11px] leading-snug text-muted">{trackState.method}</p>
            ) : null}
          </div>

          {/* Synthèse des impacts au temps choisi */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Communes affectées
              </p>
              <Badge tone={impactedCount > 0 ? 'brand' : 'neutral'}>
                {formatNumber(impactedCount)}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {impactedCount === 0
                ? 'Aucune commune dont le premier impact observé est atteint à cette date/heure.'
                : 'Au moins le centre observé a atteint le territoire (voir fiche commune).'}
            </p>
          </div>

          {/* Fiche commune sélectionnée */}
          {selectedId ? (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Commune sélectionnée
              </p>
              <p className="mt-1 font-display text-base text-ink">
                {selectedName ?? selectedId}
              </p>

              {!selectedRow ? (
                <p className="mt-2 text-sm text-muted">
                  Non encore affectée au temps choisi ({formatAntananarivo(currentAt)}).
                </p>
              ) : (
                <div className="mt-1 divide-y divide-line">
                  <DetailRow
                    label="District"
                    value={selectedRow.districtName ?? 'Non disponible'}
                  />
                  <DetailRow
                    label="Premier impact"
                    value={
                      selectedRow.firstAffectedAt
                        ? formatAntananarivo(selectedRow.firstAffectedAt)
                        : 'Non disponible'
                    }
                  />
                  <DetailRow
                    label="Dernier impact"
                    value={
                      selectedRow.lastAffectedAt
                        ? formatAntananarivo(selectedRow.lastAffectedAt)
                        : 'Non disponible'
                    }
                  />
                  <DetailRow label="Risque observé" value={riskBadge(selectedRow.observedRiskLevel)} />
                  <DetailRow
                    label="Nature"
                    value={IMPACT_STATE_LABELS[selectedRow.impactState] ?? selectedRow.impactState}
                  />
                  <DetailRow
                    label="Confiance"
                    value={
                      selectedRow.confidence != null
                        ? `${formatNumber(Math.round(selectedRow.confidence * 100) / 100)}`
                        : 'Non disponible'
                    }
                  />
                  <DetailRow
                    label="Source"
                    value={
                      selectedRow.sourceName ? (
                        selectedRow.sourceUrl ? (
                          <a
                            href={selectedRow.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-brand hover:underline"
                          >
                            {selectedRow.sourceName}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          selectedRow.sourceName
                        )
                      ) : (
                        'Non disponible'
                      )
                    }
                  />
                </div>
              )}

              {selectedRow?.method ? (
                <details className="mt-2 rounded-lg border border-line bg-white px-2.5 py-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-brand-deep">
                    Méthode de détermination
                  </summary>
                  <p className="mt-1 leading-snug text-muted">{selectedRow.method}</p>
                </details>
              ) : null}

              <p className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-muted">
                <MapPin className="mt-0.5 size-3 shrink-0" />
                Le risque observé est documenté avec sa source et son horodatage ; si absent,
                il est affiché « Non disponible » plutôt qu&apos;inventé.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Commune sélectionnée
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                Cliquez une commune sur la carte pour consulter son impact daté (premier /
                dernier impact, risque observé, source, méthode).
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function riskTone(level: ObservedRiskLevel): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (level === 'TRES_ELEVE') return 'danger';
  if (level === 'ELEVE') return 'warning';
  if (level === 'MODERE') return 'info';
  return 'neutral';
}