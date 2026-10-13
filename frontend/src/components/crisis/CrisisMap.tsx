import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer } from 'leaflet';
import L from 'leaflet';
import { BookOpen, ChevronDown, ChevronUp, Layers, LocateFixed, RefreshCw, Snowflake } from 'lucide-react';
import type { EventListItem, TrackStatePoint } from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import { RISK_LEVELS } from '@/lib/eventMeta';
import { availableWindRadiusKm, CYCLONE_VIOLET, CYCLONE_VIOLET_DEEP, observedSteps } from '@/lib/historical';
import { useTrackPlayback } from '@/lib/useTrackPlayback';
import {
  communeStyle,
  districtStyle,
  featureId,
  featureName,
  isRiskLevel,
  riskStyle,
  trackPointStyle,
  trackStyle,
} from '@/lib/crisisStyles';
import { cn } from '@/lib/utils';
import { CommuneMapSearch } from '@/components/crisis/CommuneMapSearch';
import { CycloneMarker } from '@/components/events/CycloneMarker';
import { CycloneWindSwath } from '@/components/events/CycloneWindSwath';

type CommuneClickHandler = (communeId: string, name: string) => void;

interface CrisisMapProps {
  riskLayer: FeatureCollection | null;
  communeLayer: FeatureCollection | null;
  districtLayer: FeatureCollection | null;
  /**
   * Vrai lorsque `communeLayer` porte l'exposition calculée de l'événement.
   * Faux quand c'est le repli administratif (aucune exposition disponible) :
   * la légende parle alors de « Limites communales », jamais d'exposition.
   */
  communesAreExposed: boolean;
  weatherLayer: FeatureCollection | null;
  trackLayer: FeatureCollection | null;
  trackPoints: TrackStatePoint[];
  exposedCommuneIds: Set<string>;
  activeEvent: EventListItem | null;
  selectedCommuneId: string | null;
  /** Géométrie de la commune sélectionnée (surbrillance dédiée). */
  selectedCommuneGeometry?: unknown | null;
  onCommuneClick: CommuneClickHandler;
  /** Sélection via la barre de recherche (zoom + panneau détail). */
  onCommuneSearchSelect?: CommuneClickHandler;
  focusTarget: { geometry: unknown; nonce: number } | null;
  mapPhase: string;
  onMapPhaseChange: (phase: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function MapFocus({ target }: { target: { geometry: unknown; nonce: number } | null }) {
  const map = useMap();
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!target || !target.geometry || last.current === target.nonce) return;
    last.current = target.nonce;
    try {
      const layer = L.geoJSON(target.geometry as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 12, duration: 0.8 });
      }
    } catch {
      // géométrie invalide : on ignore
    }
  }, [target, map]);

  return null;
}

function bindFeatureClick(layer: Layer, feature: Feature, handler: CommuneClickHandler) {
  layer.on({
    click: (e) => {
      L.DomEvent.stop(e.originalEvent);
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const id = featureId(props);
      if (id && handler) handler(id, featureName(props));
    },
  });
}

function CrisisMapOverlay({ children, position }: { children: ReactNode; position: 'bottom-left' | 'top-right' | 'top-left' }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-[500]',
        position === 'bottom-left' ? 'bottom-3 left-3' : position === 'top-left' ? 'left-3 top-3' : 'right-3 top-3',
      )}
    >
      {children}
    </div>
  );
}

/** Légende repliable : fermée par défaut pour ne pas voler de place à la carte. */
function Legend({
  hasDocumentedRadius,
  hasWindSwath,
}: {
  hasDocumentedRadius: boolean;
  /** Emprise réellement visible : la légende ne l'annonce que si elle est dessinée. */
  hasWindSwath: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (containerRef.current && target instanceof Node && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="pointer-events-auto flex w-max flex-col items-start">
      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {/* Le contenu reste monté pour l'animation : `inert` le sort du
              parcours clavier tant qu'il est replié. */}
          <div
            inert={!open}
            className="mb-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
          >
            <p className="mb-1 text-[10px] tracking-wide text-muted uppercase">Niveau de risque</p>
            <ul className="space-y-1">
              {RISK_LEVELS.map((level) => (
                <li key={level} className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 rounded-sm"
                    style={{ background: RISK_COLORS[level] }}
                  />
                  {RISK_LABELS[level]}
                </li>
              ))}
            </ul>
            <p className="mt-2 mb-1 text-[10px] tracking-wide text-muted uppercase">
              Autres couches
            </p>
            <ul className="space-y-1 text-muted">
              <li className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-4 rounded bg-[#5a7d90]" />
                Trajectoire observée
              </li>
              {hasWindSwath ? (
                <li className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-4 rounded-sm"
                    style={{ background: `${CYCLONE_VIOLET}1f` }}
                  />
                  Emprise documentée des vents (rayons publiés)
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full border-2 border-[#5b21b6] bg-[#7c3aed]" />
                Centre cyclonique (lecture animée)
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-[#c47d4a]" />
                Trajectoire prévue
              </li>
              {hasDocumentedRadius ? (
                <li className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 rounded-full border border-dashed"
                    style={{
                      borderColor: CYCLONE_VIOLET_DEEP,
                      backgroundColor: `${CYCLONE_VIOLET}29`,
                    }}
                  />
                  Zone d&apos;influence : rayon de vent documenté (RSMC)
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <Snowflake className="size-3.5 text-slate-500" /> Observation météo
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm border-2 border-[#475569] bg-white/40" />
                Commune exposée à l&apos;événement sélectionné
              </li>
            </ul>
            {hasWindSwath ? (
              <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-muted">
                L&apos;emprise des vents est l&apos;union des rayons publiés par la source, point par
                point : ce n&apos;est pas un cône d&apos;incertitude.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Masquer la légende' : 'Afficher la légende'}
        title={open ? 'Masquer la légende' : 'Afficher la légende'}
        className={cn(
          'flex items-center gap-1.5 rounded-xl border bg-white/90 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-white',
          open ? 'border-slate-300' : 'border-slate-200/80',
        )}
      >
        <BookOpen className="size-3.5 text-muted" aria-hidden />
        Légende
        {open ? (
          <ChevronUp className="size-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Couches repliables : fermé par défaut pour ne pas voler de place à la carte. */
function LayerControls({
  showRisks,
  showCommunes,
  showDistricts,
  showWeather,
  showEvent,
  showSwath,
  hasEvent,
  communesAreExposed,
  hasDocumentedRadius,
  onChange,
}: {
  showRisks: boolean;
  showCommunes: boolean;
  showDistricts: boolean;
  showWeather: boolean;
  showEvent: boolean;
  showSwath: boolean;
  hasEvent: boolean;
  communesAreExposed: boolean;
  hasDocumentedRadius: boolean;
  onChange: (
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath',
    value: boolean,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (containerRef.current && target instanceof Node && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items: Array<{
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath';
    label: string;
    checked: boolean;
    disabled?: boolean;
  }> = [
    { key: 'risks', label: 'Risques', checked: showRisks, disabled: !hasEvent },
    {
      key: 'communes',
      label: hasEvent && communesAreExposed ? 'Communes exposées' : 'Limites communales',
      checked: showCommunes,
    },
    { key: 'districts', label: 'Districts', checked: showDistricts },
    { key: 'weather', label: 'Météo', checked: showWeather },
    { key: 'event', label: 'Événement actif', checked: showEvent, disabled: !hasEvent },
    {
      key: 'swath',
      label: 'Emprise des vents',
      checked: showSwath,
      disabled: !hasEvent || !hasDocumentedRadius,
    },
  ];

  return (
    <div ref={containerRef} className="pointer-events-auto mt-2 flex w-max flex-col items-end">
      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {/* Le contenu reste monté pour l'animation : `inert` le sort du
              parcours clavier tant qu'il est replié. */}
          <div
            inert={!open}
            className="mb-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
          >
            <p className="mb-1.5 font-semibold text-ink">Couches</p>
            <div className="space-y-1.5">
              {items.map((item) => (
                <label
                  key={item.key}
                  className={cn('flex items-center gap-2', item.disabled && 'opacity-40')}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={item.disabled}
                    onChange={(e) => onChange(item.key, e.target.checked)}
                    className="size-3.5 accent-brand"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Masquer les couches' : 'Afficher les couches'}
        title={open ? 'Masquer les couches' : 'Afficher les couches'}
        className={cn(
          'flex items-center gap-1.5 rounded-xl border bg-white/90 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-white',
          open ? 'border-slate-300' : 'border-slate-200/80',
        )}
      >
        <Layers className="size-3.5 text-muted" aria-hidden />
        Couches
        {open ? (
          <ChevronUp className="size-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        )}
      </button>
    </div>
  );
}

/**
 * Marqueur violet animé du centre cyclonique (salle de crise) : lecture de la
 * trajectoire OBSERVÉE, un segment parcouru toutes les 3 s puis reprise au
 * premier point. Seule la position est interpolée entre deux points vérifiés ;
 * les valeurs affichées restent celles du point observé de référence.
 */
function AnimatedCycloneMarker({
  points,
  eventName,
  sourceName,
  sourceUrl,
}: {
  points: TrackStatePoint[];
  eventName: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
}) {
  const { position, point, interpolated } = useTrackPlayback(points, true);
  if (!position || !point) return null;
  return (
    <CycloneMarker
      position={position}
      point={point}
      interpolated={interpolated}
      eventName={eventName}
      sourceName={sourceName}
      sourceUrl={sourceUrl}
    />
  );
}

export function CrisisMap({
  riskLayer,
  communeLayer,
  districtLayer,
  communesAreExposed,
  weatherLayer,
  trackLayer,
  trackPoints,
  exposedCommuneIds,
  activeEvent,
  selectedCommuneId,
  selectedCommuneGeometry = null,
  onCommuneClick,
  onCommuneSearchSelect,
  focusTarget,
  mapPhase,
  onMapPhaseChange,
  refreshing = false,
  onRefresh,
}: CrisisMapProps) {
  const [showRisks, setShowRisks] = useState(true);
  const [showCommunes, setShowCommunes] = useState(false);
  const [showDistricts, setShowDistricts] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const [showEvent, setShowEvent] = useState(true);
  // Emprise documentée des vents : affichée par défaut (c'est la lecture
  // d'ensemble du cyclone), masquable pour dégager la carte.
  const [showSwath, setShowSwath] = useState(true);

  // Points observés (jamais les points prévus) : base de la lecture animée.
  const observedTrack = useMemo(() => observedSteps(trackPoints), [trackPoints]);

  // Rayon de vent réellement documenté (RSMC) : la zone d'influence du cyclone
  // n'est dessinée — et annoncée en légende — que si une source la publie.
  const hasDocumentedRadius = useMemo(
    () => observedTrack.some((point) => availableWindRadiusKm(point) != null),
    [observedTrack],
  );

  useEffect(() => {
    setShowCommunes(Boolean(activeEvent));
    if (!activeEvent) setShowRisks(false);
  }, [activeEvent]);

  const handleSearchSelect = (communeId: string, name: string) => {
    setShowCommunes(true);
    if (activeEvent) setShowRisks(true);
    (onCommuneSearchSelect ?? onCommuneClick)(communeId, name);
  };

  const handleToggle = (
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath',
    value: boolean,
  ) => {
    if (key === 'risks') setShowRisks(value);
    else if (key === 'communes') setShowCommunes(value);
    else if (key === 'districts') setShowDistricts(value);
    else if (key === 'weather') setShowWeather(value);
    else if (key === 'swath') setShowSwath(value);
    else setShowEvent(value);
  };

  const resetView = () => {
    window.dispatchEvent(new Event('madarisk-reset-view'));
  };

  // Le repli administratif ne compte pas comme une donnée d'exposition : un
  // événement sans exposition reste signalé comme tel, même si ses limites
  // communales sont dessinées en arrière-plan.
  const exposedCommuneFeatureCount = communesAreExposed
    ? (communeLayer?.features?.length ?? 0)
    : 0;

  // Les zones de vigilance (contours régionaux) ne sont plus dessinées en salle
  // de crise : elles ne comptent donc pas comme une donnée affichée ici.
  const eventWithoutData =
    Boolean(activeEvent) &&
    !hasDocumentedRadius &&
    (riskLayer?.features?.length ?? 0) + exposedCommuneFeatureCount === 0;

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

      {/* Le zoom est remonté du coin haut-gauche par défaut vers le coin bas-droit. */}
      <ZoomControl position="bottomright" />

      <MapFocus target={focusTarget} />
      <MapReset />

      {/*
        Emprise documentée des vents, volontairement dessinée en premier : elle
        passe SOUS la sélection, les risques, les limites communales et la
        trajectoire, qui restent cliquables.
      */}
      {showEvent && showSwath ? <CycloneWindSwath points={observedTrack} /> : null}

      {selectedCommuneGeometry ? (
        <GeoJSON
          key={`highlight-${selectedCommuneId ?? 'geo'}`}
          data={
            {
              type: 'Feature',
              properties: {},
              geometry: selectedCommuneGeometry,
            } as Feature<Geometry>
          }
          style={() => ({
            color: '#03224c',
            weight: 3.5,
            fillColor: '#03224c',
            fillOpacity: 0.28,
            opacity: 1,
          })}
          interactive={false}
        />
      ) : null}

      {showRisks && riskLayer ? (
          <GeoJSON
          key={`risk-${selectedCommuneId ?? 'none'}-${riskLayer.features.length}`}
          data={riskLayer}
          style={(feature) => riskStyle(feature, selectedCommuneId, exposedCommuneIds)}
          onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            const level = p.riskLevel ?? p.risk_level;
            layer.bindPopup(
              [
                `<strong>${featureName(p)}</strong>`,
                level ? `Risque : ${isRiskLevel(level) ? RISK_LABELS[level] : String(level)}` : null,
                p.riskScore != null ? `Score : ${String(p.riskScore)}` : null,
              ]
                .filter(Boolean)
                .join('<br/>'),
            );
            bindFeatureClick(layer, feature, onCommuneClick);
          }}
        />
      ) : null}

      {showDistricts && districtLayer ? (
        <GeoJSON
          data={districtLayer}
          style={districtStyle}
          onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            layer.bindPopup(`<strong>${featureName(p) || 'District'}</strong>`);
          }}
        />
      ) : null}

      {showCommunes && communeLayer ? (
        <GeoJSON
          key={`commune-${selectedCommuneId ?? 'none'}-${communeLayer.features.length}`}
          data={communeLayer}
          style={(feature) =>
            communeStyle(feature, selectedCommuneId, Boolean(activeEvent))
          }
          onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            const level = p.riskLevel ?? p.risk_level;
            const hasEvent = Boolean(activeEvent);
            layer.bindPopup(
              [
                `<strong>${featureName(p)}</strong>`,
                hasEvent && isRiskLevel(level)
                  ? `Risque : ${RISK_LABELS[level]}`
                  : null,
                !hasEvent && p.precipitationMm != null
                  ? `Pluie : ${String(p.precipitationMm)} mm`
                  : null,
                !hasEvent && p.windSpeedKmh != null
                  ? `Vent : ${String(p.windSpeedKmh)} km/h`
                  : null,
                hasEvent && !communesAreExposed
                  ? "Aucune exposition calculée pour cet événement"
                  : null,
              ]
                .filter(Boolean)
                .join('<br/>'),
            );
            bindFeatureClick(layer, feature, onCommuneClick);
          }}
        />
      ) : null}

      {showWeather && weatherLayer ? (
        <GeoJSON
          data={weatherLayer}
          pointToLayer={(_, latlng) =>
            L.circleMarker(latlng, {
              radius: 6,
              color: '#8a7355',
              weight: 1,
              fillColor: '#c4b07a',
              fillOpacity: 0.55,
            })
          }
          onEachFeature={(feature, layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            layer.bindTooltip(
              [
                featureName(p),
                p.temperatureC != null ? `Temp : ${String(p.temperatureC)} °C` : null,
                p.precipitationMm != null ? `Pluie : ${String(p.precipitationMm)} mm` : null,
                p.windSpeedKmh != null ? `Vent : ${String(p.windSpeedKmh)} km/h` : null,
              ]
                .filter(Boolean)
                .join('<br/>'),
            );
          }}
        />
      ) : null}

      {showEvent && activeEvent ? (
        <>
          {trackLayer ? (
            <GeoJSON data={trackLayer} style={trackStyle} />
          ) : null}
          {trackPoints.length > 0 ? (
            trackPoints.map((pt) => (
              <CircleMarker
                key={pt.id}
                center={[pt.latitude, pt.longitude]}
                pathOptions={trackPointStyle(pt.trackType)}
              >
                <Tooltip>
                  {pt.trackType === 'OBSERVEE' ? 'Observé' : 'Prévu'} le{' '}
                  {pt.observedAt ? new Date(pt.observedAt).toLocaleString('fr-FR') : '—'}
                </Tooltip>
              </CircleMarker>
            ))
          ) : null}
          {observedTrack.length > 0 ? (
            <AnimatedCycloneMarker
              points={observedTrack}
              eventName={activeEvent.name}
              sourceName={activeEvent.sourceName}
              sourceUrl={activeEvent.sourceUrl}
            />
          ) : null}
        </>
      ) : null}

      <CrisisMapOverlay position="bottom-left">
        <Legend
          hasDocumentedRadius={hasDocumentedRadius}
          hasWindSwath={hasDocumentedRadius && showEvent && showSwath}
        />
      </CrisisMapOverlay>
      <CrisisMapOverlay position="top-right">
        {/* Coin haut-droit aligné à droite : actions, bouton Couches repliable
            puis sélecteur de phase. Le coin bas-droit est réservé au zoom, à
            la légende de droites et à l'attribution OSM. */}
        <div className="flex flex-col items-end">
          <div className="flex flex-col items-end gap-2">
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-white"
                title="Actualiser les données de la carte"
              >
                <RefreshCw className={cn('size-3.5 text-muted', refreshing && 'animate-spin')} />
                Actualiser
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetView}
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-white"
              title="Recentrer sur Madagascar"
            >
              <LocateFixed className="size-3.5 text-muted" /> Recentrer
            </button>
          </div>
          <LayerControls
            showRisks={showRisks}
            showCommunes={showCommunes}
            showDistricts={showDistricts}
            showWeather={showWeather}
            showEvent={showEvent}
            showSwath={showSwath}
            hasEvent={Boolean(activeEvent)}
            communesAreExposed={communesAreExposed}
            hasDocumentedRadius={hasDocumentedRadius}
            onChange={handleToggle}
          />
          {activeEvent ? (
            <div className="pointer-events-auto mt-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className="mb-1.5 font-semibold text-ink">Phase affichée</p>
              <select
                value={mapPhase}
                onChange={(e) => onMapPhaseChange(e.target.value)}
                aria-label="Phase affichée"
                className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
              >
                <option value="">Dernière évaluation</option>
                <option value="AVANT">AVANT</option>
                <option value="PENDANT">PENDANT</option>
                <option value="APRES">APRÈS</option>
                <option value="RETABLISSEMENT">RÉTABLISSEMENT</option>
              </select>
            </div>
          ) : null}
        </div>
      </CrisisMapOverlay>

      <CrisisMapOverlay position="top-left">
        <div className={cn('mt-0', 'lg:mt-0')}>
          <CommuneMapSearch onSelect={handleSearchSelect} />
        </div>
        {eventWithoutData ? (
          <div className="pointer-events-auto mt-2 w-64 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-xs shadow-sm backdrop-blur">
            <p className="font-semibold text-ink">Aucun risque calculé</p>
            <p className="mt-1 text-muted">
              Cet événement n&apos;a pas encore de zone d&apos;influence ni d&apos;exposition
              calculées. Lancez le calcul pour afficher les communes et leurs niveaux de risque.
            </p>
            <Link
              to={`/evenements/${activeEvent?.id}`}
              className="mt-2 inline-block font-medium text-ink underline-offset-2 hover:underline"
            >
              Ouvrir l&apos;événement →
            </Link>
          </div>
        ) : null}
      </CrisisMapOverlay>
    </MapContainer>
  );
}

function MapReset() {
  const map = useMap();
  useEffect(() => {
    const handler = () => map.setView([-19.4, 47.5], 6);
    window.addEventListener('madarisk-reset-view', handler);
    return () => window.removeEventListener('madarisk-reset-view', handler);
  }, [map]);
  return null;
}