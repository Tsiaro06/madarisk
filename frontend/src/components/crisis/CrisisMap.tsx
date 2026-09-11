import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import { Layers, LocateFixed, Snowflake, Waves } from 'lucide-react';
import type { EventListItem, RiskLevel } from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import { RISK_LEVELS } from '@/lib/eventMeta';
import { cn } from '@/lib/utils';

type CommuneClickHandler = (communeId: string, name: string) => void;

interface CrisisMapProps {
  riskLayer: FeatureCollection | null;
  communeLayer: FeatureCollection | null;
  weatherLayer: FeatureCollection | null;
  trackLayer: FeatureCollection | null;
  areasLayer: FeatureCollection | null;
  exposedCommuneIds: Set<string>;
  activeEvent: EventListItem | null;
  selectedCommuneId: string | null;
  onCommuneClick: CommuneClickHandler;
  focusTarget: { geometry: unknown; nonce: number } | null;
  mapPhase: string;
  onMapPhaseChange: (phase: string) => void;
}

function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'FAIBLE' || v === 'MODERE' || v === 'ELEVE' || v === 'EXTREME';
}

function featureId(p: Record<string, unknown>): string {
  return String(p.communeId ?? p.id ?? p.commune_id ?? '');
}

function featureName(p: Record<string, unknown>): string {
  return String(p.communeName ?? p.commune ?? p.nom ?? p.name ?? '');
}

function riskStyle(
  feature?: Feature,
  selectedId?: string | null,
  exposedCommuneIds?: Set<string>,
): PathOptions {
  const p = (feature?.properties ?? {}) as Record<string, unknown>;
  const level = p.riskLevel ?? p.risk_level;
  const color = isRiskLevel(level) ? RISK_COLORS[level] : '#0a6b6e';
  const communeId = featureId(p);
  const isExposed = exposedCommuneIds ? exposedCommuneIds.has(communeId) : false;
  const selected = selectedId != null && communeId === String(selectedId);
  return {
    color: selected ? '#0f2a2e' : isExposed ? '#111827' : '#9ca3af',
    weight: selected ? 3 : isExposed ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.8 : isExposed ? 0.85 : 0.55,
  };
}

function communeStyle(feature?: Feature, selectedId?: string | null): PathOptions {
  const p = (feature?.properties ?? {}) as Record<string, unknown>;
  const level = p.riskLevel ?? p.risk_level;
  const color = isRiskLevel(level) ? RISK_COLORS[level] : '#0a6b6e';
  const selected = selectedId != null && featureId(p) === String(selectedId);
  return {
    color: selected ? '#0f2a2e' : '#0a6b6e',
    weight: selected ? 3 : 1,
    fillColor: color,
    fillOpacity: isRiskLevel(level) ? 0.3 : 0.08,
  };
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
    <div className="pointer-events-auto rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
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
          <Waves className="size-3.5 text-brand" /> Trajectoire événement
        </li>
        <li className="flex items-center gap-2">
          <Snowflake className="size-3.5 text-accent" /> Observation météo
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border-2 border-[#111827]" />
          Commune touchée par l’événement actif
        </li>
      </ul>
    </div>
  );
}

function LayerControls({
  showRisks,
  showCommunes,
  showWeather,
  showEvent,
  hasEvent,
  onChange,
}: {
  showRisks: boolean;
  showCommunes: boolean;
  showWeather: boolean;
  showEvent: boolean;
  hasEvent: boolean;
  onChange: (key: 'risks' | 'communes' | 'weather' | 'event', value: boolean) => void;
}) {
  const items: Array<{ key: 'risks' | 'communes' | 'weather' | 'event'; label: string; checked: boolean; disabled?: boolean }> = [
    { key: 'risks', label: 'Risques', checked: showRisks },
    { key: 'communes', label: hasEvent ? 'Communes exposées' : 'Limites communes', checked: showCommunes },
    { key: 'weather', label: 'Météo', checked: showWeather },
    { key: 'event', label: 'Événement actif', checked: showEvent, disabled: !hasEvent },
  ];
  return (
    <div className="pointer-events-auto rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
        <Layers className="size-3.5 text-brand" /> Couches
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
  weatherLayer,
  trackLayer,
  areasLayer,
  exposedCommuneIds,
  activeEvent,
  selectedCommuneId,
  onCommuneClick,
  focusTarget,
  mapPhase,
  onMapPhaseChange,
}: CrisisMapProps) {
  const [showRisks, setShowRisks] = useState(true);
  const [showCommunes, setShowCommunes] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const [showEvent, setShowEvent] = useState(true);

  useEffect(() => {
    setShowCommunes(Boolean(activeEvent));
  }, [activeEvent]);

  const handleToggle = (key: 'risks' | 'communes' | 'weather' | 'event', value: boolean) => {
    if (key === 'risks') setShowRisks(value);
    else if (key === 'communes') setShowCommunes(value);
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

      {showRisks && riskLayer ? (
          <GeoJSON
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

      {showCommunes && communeLayer ? (
        <GeoJSON
          data={communeLayer}
          style={(feature) => communeStyle(feature, selectedCommuneId)}
          onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
            const p = (feature.properties ?? {}) as Record<string, unknown>;
            const level = p.riskLevel ?? p.risk_level;
            layer.bindPopup(
              [
                `<strong>${featureName(p)}</strong>`,
                level ? `Risque : ${isRiskLevel(level) ? RISK_LABELS[level] : String(level)}` : null,
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
              radius: 7,
              color: '#b4531f',
              weight: 1.5,
              fillColor: '#f4c430',
              fillOpacity: 0.85,
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
                color: '#e03131',
                weight: 2,
                fillColor: '#e03131',
                fillOpacity: 0.15,
              })}
            />
          ) : null}
          {trackLayer ? (
            <GeoJSON
              data={trackLayer}
              pointToLayer={(_, latlng) =>
                L.circleMarker(latlng, {
                  radius: 5,
                  color: '#0f2a2e',
                  weight: 2,
                  fillColor: '#0a6b6e',
                  fillOpacity: 1,
                })
              }
              style={(feature) => {
                const g = feature?.geometry;
                const isLine = g?.type !== 'Point';
                return isLine
                  ? { color: '#0a6b6e', weight: 3, opacity: 0.9 }
                  : { color: 'transparent' };
              }}
            />
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
          showWeather={showWeather}
          showEvent={showEvent}
          hasEvent={Boolean(activeEvent)}
          onChange={handleToggle}
        />
        {activeEvent ? (
          <div className="pointer-events-auto mt-2 rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
            <p className="mb-1.5 font-semibold text-ink">Phase affichée</p>
            <select
              value={mapPhase}
              onChange={(e) => onMapPhaseChange(e.target.value)}
              className="w-full rounded-lg border border-brand/20 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
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

      {eventWithoutData ? (
        <CrisisMapOverlay position="top-left">
          <div className="pointer-events-auto w-64 rounded-xl border border-white/60 bg-white/95 px-3 py-2.5 text-xs shadow-md backdrop-blur">
            <p className="font-semibold text-ink">Aucun risque calculé</p>
            <p className="mt-1 text-muted">
              Cet événement n&apos;a pas encore de zone d&apos;influence ni d&apos;exposition
              calculées. Lancez le calcul pour afficher les communes et leurs niveaux de risque.
            </p>
            <Link
              to={`/evenements/${activeEvent?.id}`}
              className="mt-2 inline-block font-medium text-brand hover:underline"
            >
              Ouvrir l&apos;événement →
            </Link>
          </div>
        </CrisisMapOverlay>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 right-3 z-[500]">
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/60 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-ink shadow-md backdrop-blur transition hover:bg-white"
          title="Recentrer sur Madagascar"
        >
          <LocateFixed className="size-3.5 text-brand" /> Recentrer
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