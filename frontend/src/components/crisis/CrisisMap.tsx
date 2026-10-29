import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import { BookOpen, ChevronDown, ChevronUp, Layers, LocateFixed, RefreshCw, Snowflake } from 'lucide-react';
import type {
  EventCommuneAlertRow,
  EventCommuneAlertsSummary,
  EventListItem,
  TrackStatePoint,
} from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import { RISK_LEVELS } from '@/lib/eventMeta';
import {
  availableWindRadiusKm,
  COMMUNE_ALERT_COLORS,
  COMMUNE_ALERT_LEGEND_ORDER,
  COMMUNE_ALERT_LABELS,
  CYCLONE_VIOLET,
  CYCLONE_VIOLET_DEEP,
  formatAntananarivo,
  observedSteps,
} from '@/lib/historical';
import {
  communeStyle,
  CONE_AREA_FILL,
  CONE_EDGE,
  CONE_FILL,
  CRISIS_FORECAST_FILL,
  districtFeatureId,
  districtStyle,
  featureId,
  featureName,
  isRiskLevel,
  riskStyle,
  trackPointStyle,
  trackStyle,
} from '@/lib/crisisStyles';
import {
  buildCone,
  conePointsFromTrack,
  FORECAST_CONE_LABEL,
  FORECAST_CONE_NOTE,
  intersectingFeatureIds,
} from '@/lib/forecastCone';
import { cn } from '@/lib/utils';
import { useTrackPlayback } from '@/lib/useTrackPlayback';
import { CommuneMapSearch } from '@/components/crisis/CommuneMapSearch';
import { CommuneAlertLayer } from '@/components/crisis/CommuneAlertLayer';
import { ForecastConeLayer } from '@/components/crisis/ForecastConeLayer';
import { CycloneMarker } from '@/components/events/CycloneMarker';
import { CycloneWindSwath } from '@/components/events/CycloneWindSwath';
import { TrackPointDetails } from '@/components/events/TrackPointDetails';

type CommuneClickHandler = (communeId: string, name: string) => void;

/**
 * Position de lecture de la trajectoire, pilotée par la page : une seule horloge
 * fait avancer le marqueur cyclone le long des points observés, en boucle. Les
 * valeurs affichées restent celles du point observé de référence (`point`).
 */
export interface MapPlayback {
  position: [number, number] | null;
  point: TrackStatePoint | null;
  nextPoint: TrackStatePoint | null;
  interpolated: boolean;
}

/** Ensemble vide partagé : évite de recalculer / réallouer sans zone probable. */
const NO_IDS: ReadonlySet<string> = new Set<string>();

/** Map vide partagée : aucune alerte communale à afficher. */
const NO_ALERTS: ReadonlyMap<string, EventCommuneAlertRow> = new Map();

/**
 * Style de mise en évidence de la commune sélectionnée. Fonction de RÉFÉRENCE
 * stable : `react-leaflet` rejoue `setStyle` quand la prop `style` change
 * d'identité, et la carte est re-rendue à chaque image de la lecture animée.
 */
const HIGHLIGHT_STYLE: () => PathOptions = () => ({
  color: '#03224c',
  weight: 3.5,
  fillColor: '#03224c',
  fillOpacity: 0.28,
  opacity: 1,
});

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
  /** Niveaux d'alerte communaux actifs à `alertAt`, indexés par communeId. */
  communeAlerts?: ReadonlyMap<string, EventCommuneAlertRow> | null;
  /** Répartition par niveau + sources, affichée dans la légende. */
  alertSummary?: EventCommuneAlertsSummary | null;
  /** Instant consulté (ISO-8601) auquel se rapportent les niveaux affichés. */
  alertAt?: string | null;
  /**
   * Lecture de la trajectoire pilotée par la page : position courante du
   * marqueur et point observé de référence. `null` = la carte anime elle-même.
   */
  playback?: MapPlayback | null;
  /**
   * Déplace la lecture sur un point cliqué : le cyclone s'y place et poursuit
   * la trajectoire depuis ce point (sans repartir du début).
   */
  onSeekTrackPoint?: (point: TrackStatePoint) => void;
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
  hasProbableZone,
  alertSummary,
  alertsVisible,
  alertAt,
}: {
  hasDocumentedRadius: boolean;
  /** Emprise réellement visible : la légende ne l'annonce que si elle est dessinée. */
  hasWindSwath: boolean;
  /** Zone de position probable réellement dessinée (points de prévision datés). */
  hasProbableZone: boolean;
  /** Répartition des alertes communales à l'instant consulté (null : pas de données). */
  alertSummary: EventCommuneAlertsSummary | null;
  /** La couche d'alerte est-elle réellement dessinée sur la carte ? */
  alertsVisible: boolean;
  /** Instant consulté auquel se rapportent les niveaux affichés. */
  alertAt: string | null;
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
            {alertSummary ? (
              <>
                <p className="mt-2 mb-1 text-[10px] tracking-wide text-muted uppercase">
                  Niveaux d&apos;alerte cyclonique
                </p>
                <ul className="space-y-1">
                  {COMMUNE_ALERT_LEGEND_ORDER.map((level) => (
                    <li key={level} className="flex items-center gap-2">
                      <span
                        className="inline-block size-3 shrink-0 rounded-sm"
                        style={{ background: COMMUNE_ALERT_COLORS[level] }}
                      />
                      <span className="flex-1">{COMMUNE_ALERT_LABELS[level]}</span>
                      <span className="tabular-nums text-muted">
                        {alertSummary.levels[level]}
                      </span>
                    </li>
                  ))}
                </ul>
                {alertSummary.estimated > 0 ? (
                  <p className="mt-1 text-[10px] leading-snug text-amber-700">
                    {alertSummary.estimated} commune(s) colorée(s) par estimation spatiale :
                    niveau hérité d&apos;un district ou d&apos;une région, non publié à
                    l&apos;échelle communale (pointillés sur la carte).
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  {alertsVisible ? '' : 'Couche masquée. '}
                  Niveaux actifs au {alertAt ? formatAntananarivo(alertAt) : '—'} (heure de
                  Madagascar).
                </p>
                {alertSummary.sources.length > 0 ? (
                  <p className="mt-1 border-t border-line pt-1.5 text-[10px] leading-snug text-muted">
                    Sources : {alertSummary.sources.join(' · ')}
                  </p>
                ) : null}
              </>
            ) : null}
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
                    className="inline-block h-3 w-4 rounded-sm border border-dashed"
                    style={{ borderColor: CYCLONE_VIOLET_DEEP, background: `${CYCLONE_VIOLET}2e` }}
                  />
                  Emprise documentée des vents (rayons publiés)
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full border-2 border-[#5b21b6] bg-[#7c3aed]" />
                Centre cyclonique (lecture animée)
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed"
                  style={{ borderColor: CRISIS_FORECAST_FILL }}
                />
                Trajectoire prévue
              </li>
              {hasProbableZone ? (
                <li className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-4 rounded-sm border border-dashed"
                    style={{ borderColor: CONE_EDGE, background: `${CONE_FILL}40` }}
                  />
                  {FORECAST_CONE_LABEL}
                </li>
              ) : null}
              {hasProbableZone ? (
                <li className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 rounded-sm"
                    style={{ background: CONE_AREA_FILL }}
                  />
                  Commune ou district traversé par la zone probable
                </li>
              ) : null}
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
                Emprise documentée : les disques des rayons publiés et leurs liaisons entre mesures
                consécutives sont réunis en une seule surface, du premier au dernier point
                documenté. Aucun rayon n&apos;est mesuré entre deux points datés — ce n&apos;est pas
                un cône d&apos;incertitude.
              </p>
            ) : null}
            {hasProbableZone ? (
              <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-muted">
                {FORECAST_CONE_NOTE}
              </p>
            ) : null}
            {alertSummary ? (
              <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-muted">
                Les couleurs d&apos;alerte viennent uniquement d&apos;informations datées et
                sourcées (bulletin officiel, impact observé, estimation signalée) — jamais
                d&apos;une distance au cyclone. Une commune hors alerte reste grise.
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
  showCone,
  showAlerts,
  hasEvent,
  communesAreExposed,
  hasDocumentedRadius,
  hasProbableZone,
  hasAlertData,
  onChange,
}: {
  showRisks: boolean;
  showCommunes: boolean;
  showDistricts: boolean;
  showWeather: boolean;
  showEvent: boolean;
  showSwath: boolean;
  showCone: boolean;
  showAlerts: boolean;
  hasEvent: boolean;
  communesAreExposed: boolean;
  hasDocumentedRadius: boolean;
  hasProbableZone: boolean;
  hasAlertData: boolean;
  onChange: (
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath' | 'cone' | 'alerts',
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
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath' | 'cone' | 'alerts';
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
    {
      key: 'cone',
      label: 'Zone probable du centre',
      checked: showCone,
      disabled: !hasEvent || !hasProbableZone,
    },
    {
      key: 'alerts',
      label: 'Alertes cycloniques (communes)',
      checked: showAlerts,
      disabled: !hasAlertData,
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
            className="mb-1.5 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Couches</p>
              <span className="text-[10px] text-muted">Affichage carte</span>
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <label
                  key={item.key}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-canvas',
                    item.disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={item.disabled}
                    onChange={(e) => onChange(item.key, e.target.checked)}
                    className="size-3.5 accent-brand"
                  />
                  <span className="text-ink">{item.label}</span>
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
 * Marqueur violet animé du centre cyclonique (repli) : lecture de la trajectoire
 * OBSERVÉE, un segment parcouru toutes les 3 s puis reprise au premier point.
 * Utilisé quand la page ne pilote pas la lecture ; seule la position est
 * interpolée entre deux points vérifiés, les valeurs restent celles du point de
 * référence.
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
  communeAlerts = null,
  alertSummary = null,
  alertAt = null,
  playback = null,
  onSeekTrackPoint,
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
  // Zone de position probable du centre (trajectoire prévue) : affichée par
  // défaut, mais elle n'existe que si l'événement porte des points de prévision
  // dont l'échéance est datable.
  const [showCone, setShowCone] = useState(true);
  // Niveaux d'alerte communaux : affichés par défaut dès que l'événement en
  // porte (c'est la lecture « qui est sous alerte, quand »).
  const [showAlerts, setShowAlerts] = useState(true);

  // Points observés (jamais les points prévus) : base de l'emprise documentée et
  // du choix par défaut du point consulté.
  const observedTrack = useMemo(() => observedSteps(trackPoints), [trackPoints]);

  // Rayon de vent réellement documenté (RSMC) : la zone d'influence du cyclone
  // n'est dessinée — et annoncée en légende — que si une source la publie.
  const hasDocumentedRadius = useMemo(
    () => observedTrack.some((point) => availableWindRadiusKm(point) != null),
    [observedTrack],
  );

  // Points de prévision : seuls ceux dont l'échéance est datable portent une
  // erreur de position, donc un cercle. Un point sans `forecastFor` est écarté.
  const forecastTrack = useMemo(
    () => trackPoints.filter((point) => point.trackType === 'PREVUE'),
    [trackPoints],
  );

  // Zone de position probable du centre : recalculée quand les points de
  // prévision changent (autre cyclone, autre bulletin) — jamais pendant la
  // lecture animée, qui ne travaille que sur la trajectoire observée.
  const forecastCone = useMemo(
    () => (showEvent ? buildCone(conePointsFromTrack(forecastTrack)) : null),
    [showEvent, forecastTrack],
  );

  // Communes / districts traversés par la zone : le test d'intersection (Turf)
  // n'est lancé qu'après un pré-filtre par boîte englobante, et le résultat est
  // mémorisé tant que la zone ou la couche ne changent pas.
  const coneCommuneIds = useMemo(
    () =>
      forecastCone && showCommunes && communeLayer
        ? intersectingFeatureIds(forecastCone, communeLayer)
        : NO_IDS,
    [forecastCone, showCommunes, communeLayer],
  );
  const coneDistrictIds = useMemo(
    () =>
      forecastCone && showDistricts && districtLayer
        ? intersectingFeatureIds(forecastCone, districtLayer, districtFeatureId)
        : NO_IDS,
    [forecastCone, showDistricts, districtLayer],
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
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event' | 'swath' | 'cone' | 'alerts',
    value: boolean,
  ) => {
    if (key === 'risks') setShowRisks(value);
    else if (key === 'communes') setShowCommunes(value);
    else if (key === 'districts') setShowDistricts(value);
    else if (key === 'weather') setShowWeather(value);
    else if (key === 'swath') setShowSwath(value);
    else if (key === 'cone') setShowCone(value);
    else if (key === 'alerts') setShowAlerts(value);
    else setShowEvent(value);
  };

  const resetView = () => {
    window.dispatchEvent(new Event('madarisk-reset-view'));
  };

  // Niveaux d'alerte communaux : la couche ne colore les communes que si
  // l'événement porte des données d'alerte ET que la couche est affichée.
  const alertMap = communeAlerts ?? NO_ALERTS;
  const hasAlertData = Boolean(alertSummary?.eventHasAlertData);
  const alertsVisible = hasAlertData && showAlerts && showCommunes && Boolean(communeLayer);

  /*
   * Clé stable de la couche communale : ni l'instant consulté, ni la sélection
   * n'y figurent. Seul un changement d'événement ou de données la reconstitue
   * (react-leaflet ne rejoue pas `data` autrement). Les polygones ne sont donc
   * jamais retirés entre deux points consultés — seuls les styles changent.
   */
  const communeLayerKey = `${activeEvent?.id ?? 'none'}-${communeLayer?.features?.length ?? 0}`;

  /*
   * Style administratif (hors mode alerte) : mémorisé pour rester stable tant
   * que la sélection et la couche ne changent pas, afin que react-leaflet
   * applique un `setStyle` ciblé plutôt qu'une reconstruction.
   */
  const communeStyleFor = useCallback(
    (feature?: Feature) =>
      communeStyle(feature, selectedCommuneId, Boolean(activeEvent), coneCommuneIds),
    [selectedCommuneId, activeEvent, coneCommuneIds],
  );

  /*
   * Styles risque / district : même précaution de stabilité que la couche
   * communale. La carte est re-rendue à chaque image de la lecture animée ;
   * une référence recréée déclencherait un `setStyle` global inutile.
   */
  const riskStyleFor = useCallback(
    (feature?: Feature) => riskStyle(feature, selectedCommuneId, exposedCommuneIds),
    [selectedCommuneId, exposedCommuneIds],
  );
  const districtStyleFor = useCallback(
    (feature?: Feature) => districtStyle(feature, coneDistrictIds),
    [coneDistrictIds],
  );

  /*
   * Pastilles de trajectoire mémorisées : la lecture fait re-rendre la carte à
   * chaque image mais ces pastilles ne changent qu'au passage d'un point au
   * suivant. Évite un `setStyle` inutile sur chaque pastille à chaque image.
   */
  const activePointId = playback?.point?.id ?? null;
  const trackPointNodes = useMemo(
    () =>
      trackPoints.map((pt) => {
        const selected = pt.id === activePointId;
        return (
          <CircleMarker
            key={pt.id}
            center={[pt.latitude, pt.longitude]}
            pathOptions={trackPointStyle(pt.trackType, selected)}
            eventHandlers={
              onSeekTrackPoint ? { click: () => onSeekTrackPoint(pt) } : undefined
            }
          >
            <Tooltip>
              {pt.trackType === 'OBSERVEE' ? 'Observé' : 'Prévu'} le{' '}
              {formatAntananarivo(pt.observedAt)} (Madagascar)
            </Tooltip>
            <Popup>
              <TrackPointDetails
                point={pt}
                eventName={activeEvent?.name ?? ''}
                sourceName={activeEvent?.sourceName}
                sourceUrl={activeEvent?.sourceUrl}
              />
            </Popup>
          </CircleMarker>
        );
      }),
    [trackPoints, activePointId, onSeekTrackPoint, activeEvent],
  );

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

      {/*
        Zone de position probable du centre (trajectoire prévue), dessinée elle
        aussi sous les couches administratives : le jaune des communes et
        districts traversés reste ainsi lisible par-dessus la zone.
      */}
      {showEvent && showCone && forecastCone ? (
        <ForecastConeLayer
          key={`cone-${forecastTrack.length}-${forecastTrack[0]?.id ?? 'none'}-${
            forecastTrack.at(-1)?.id ?? 'none'
          }`}
          cone={forecastCone}
        />
      ) : null}

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
          style={HIGHLIGHT_STYLE}
          interactive={false}
        />
      ) : null}

      {showRisks && riskLayer ? (
          <GeoJSON
          key={`risk-${selectedCommuneId ?? 'none'}-${riskLayer.features.length}`}
          data={riskLayer}
          style={riskStyleFor}
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
          style={districtStyleFor}
          onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            layer.bindPopup(`<strong>${featureName(p) || 'District'}</strong>`);
          }}
        />
      ) : null}

      {showCommunes && communeLayer && alertsVisible ? (
        <CommuneAlertLayer
          key={`communes-alerts-${communeLayerKey}`}
          data={communeLayer}
          alerts={alertMap}
          selectedId={selectedCommuneId}
          onCommuneClick={onCommuneClick}
        />
      ) : showCommunes && communeLayer ? (
        <GeoJSON
          key={`communes-${communeLayerKey}`}
          data={communeLayer}
          style={communeStyleFor}
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
          {trackPointNodes}
          {playback?.position && playback.point ? (
            <CycloneMarker
              position={playback.position}
              point={playback.point}
              interpolated={playback.interpolated}
              eventName={activeEvent.name}
              sourceName={activeEvent.sourceName}
              sourceUrl={activeEvent.sourceUrl}
            />
          ) : observedTrack.length > 0 ? (
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
          hasProbableZone={forecastCone !== null && showEvent && showCone}
          alertSummary={alertSummary ?? null}
          alertsVisible={alertsVisible}
          alertAt={alertAt ?? null}
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
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-white"
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
            showCone={showCone}
            showAlerts={showAlerts}
            hasEvent={Boolean(activeEvent)}
            communesAreExposed={communesAreExposed}
            hasDocumentedRadius={hasDocumentedRadius}
            hasProbableZone={forecastCone !== null}
            hasAlertData={hasAlertData}
            onChange={handleToggle}
          />
          {activeEvent ? (
            <div className="pointer-events-auto mt-2 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-sm backdrop-blur">
              <p className="mb-1.5 text-sm font-semibold text-ink">Phase affichée</p>
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