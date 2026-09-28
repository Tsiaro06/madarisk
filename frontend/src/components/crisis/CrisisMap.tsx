import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer } from 'leaflet';
import L from 'leaflet';
import { Layers, LocateFixed, RefreshCw, Snowflake } from 'lucide-react';
import type { EventListItem, EventTrack } from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import { RISK_LEVELS } from '@/lib/eventMeta';
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

type CommuneClickHandler = (communeId: string, name: string) => void;

interface CrisisMapProps {
  riskLayer: FeatureCollection | null;
  communeLayer: FeatureCollection | null;
  districtLayer: FeatureCollection | null;
  weatherLayer: FeatureCollection | null;
  trackLayer: FeatureCollection | null;
  trackPoints: EventTrack[];
  areasLayer: FeatureCollection | null;
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

function Legend() {
  return (
    <div className="pointer-events-auto rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <p className="mb-1.5 font-semibold text-ink">Légende</p>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Niveau de risque</p>
      <ul className="space-y-1">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ background: RISK_COLORS[level] }} />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
      <p className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-muted">Autres couches</p>
      <ul className="space-y-1 text-muted">
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded bg-[#5a7d90]" />
          Trajectoire observée
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-[#c47d4a]" />
          Trajectoire prévue
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border-2 border-[#b07070] bg-[#b07070]/20" />
          Zone d&apos;influence
        </li>
        <li className="flex items-center gap-2">
          <Snowflake className="size-3.5 text-slate-500" /> Observation météo
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border-2 border-[#475569] bg-white/40" />
          Commune exposée à l&apos;événement sélectionné
        </li>
      </ul>
    </div>
  );
}

function LayerControls({
  showRisks,
  showCommunes,
  showDistricts,
  showWeather,
  showEvent,
  hasEvent,
  onChange,
}: {
  showRisks: boolean;
  showCommunes: boolean;
  showDistricts: boolean;
  showWeather: boolean;
  showEvent: boolean;
  hasEvent: boolean;
  onChange: (
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event',
    value: boolean,
  ) => void;
}) {
  const items: Array<{
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event';
    label: string;
    checked: boolean;
    disabled?: boolean;
  }> = [
    { key: 'risks', label: 'Risques', checked: showRisks, disabled: !hasEvent },
    { key: 'communes', label: hasEvent ? 'Communes exposées' : 'Limites communes', checked: showCommunes },
    { key: 'districts', label: 'Districts', checked: showDistricts },
    { key: 'weather', label: 'Météo', checked: showWeather },
    { key: 'event', label: 'Événement actif', checked: showEvent, disabled: !hasEvent },
  ];
  return (
    <div className="pointer-events-auto rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
        <Layers className="size-3.5 text-muted" /> Couches
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <label key={item.key} className={cn('flex items-center gap-2', item.disabled && 'opacity-40')}>
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
  );
}

export function CrisisMap({
  riskLayer,
  communeLayer,
  districtLayer,
  weatherLayer,
  trackLayer,
  trackPoints,
  areasLayer,
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
    key: 'risks' | 'communes' | 'districts' | 'weather' | 'event',
    value: boolean,
  ) => {
    if (key === 'risks') setShowRisks(value);
    else if (key === 'communes') setShowCommunes(value);
    else if (key === 'districts') setShowDistricts(value);
    else if (key === 'weather') setShowWeather(value);
    else setShowEvent(value);
  };

  const resetView = () => {
    window.dispatchEvent(new Event('madarisk-reset-view'));
  };

  const eventWithoutData =
    Boolean(activeEvent) &&
    (riskLayer?.features?.length ?? 0) + (communeLayer?.features?.length ?? 0) === 0;

  return (
    <MapContainer
      center={[-19.4, 47.5]}
      zoom={6}
      minZoom={4}
      scrollWheelZoom
      zoomControl
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapFocus target={focusTarget} />
      <MapReset />

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
            color: '#2f5f78',
            weight: 3.5,
            fillColor: '#3d7a9a',
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
          {areasLayer ? (
            <GeoJSON
              data={areasLayer}
              style={() => ({
                color: '#b07070',
                weight: 1.5,
                fillColor: '#b07070',
                fillOpacity: 0.1,
              })}
            />
          ) : null}
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
        </>
      ) : null}

      <CrisisMapOverlay position="bottom-left">
        <Legend />
      </CrisisMapOverlay>
      <CrisisMapOverlay position="top-right">
        <LayerControls
          showRisks={showRisks}
          showCommunes={showCommunes}
          showDistricts={showDistricts}
          showWeather={showWeather}
          showEvent={showEvent}
          hasEvent={Boolean(activeEvent)}
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

      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex flex-col items-end gap-2">
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