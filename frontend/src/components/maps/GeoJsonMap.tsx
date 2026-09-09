import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions, LeafletMouseEvent } from 'leaflet';
import L from 'leaflet';
import { RISK_COLORS, RISK_LABELS, type RiskLevel } from '@/types';
import { cn } from '@/lib/utils';

interface GeoJsonMapProps {
  data?: FeatureCollection | null;
  height?: number | string;
  onFeatureClick?: (feature: Feature, layer: Layer) => void;
  selectedId?: string | null;
  className?: string;
  showLegend?: boolean;
}

function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'FAIBLE' || v === 'MODERE' || v === 'ELEVE' || v === 'EXTREME';
}

function styleForFeature(feature?: Feature, selectedId?: string | null): PathOptions {
  const props = feature?.properties as Record<string, unknown> | null;
  const risk = props?.riskLevel ?? props?.risk_level ?? props?.niveau;
  const id = String(props?.id ?? props?.communeId ?? props?.commune_id ?? '');
  const selected = selectedId != null && id === String(selectedId);
  const color = isRiskLevel(risk) ? RISK_COLORS[risk] : '#0a6b6e';
  return {
    color: selected ? '#13262b' : color,
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.75 : 0.55,
  };
}

function FitBounds({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (!data.features?.length) return;
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
    } catch {
      // ignore invalid geometry
    }
  }, [data, map]);
  return null;
}

function featureLabel(feature: Feature): string {
  const p = (feature.properties ?? {}) as Record<string, unknown>;
  return String(p.name ?? p.communeName ?? p.nom ?? p.title ?? p.id ?? 'Entité');
}

export function GeoJsonMap({
  data,
  height = 420,
  onFeatureClick,
  selectedId,
  className,
  showLegend = true,
}: GeoJsonMapProps) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const collection = useMemo<FeatureCollection>(
    () => data ?? { type: 'FeatureCollection', features: [] },
    [data],
  );

  useEffect(() => {
    const layer = geoJsonRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const feature = (l as L.Layer & { feature?: Feature }).feature;
      if (feature && 'setStyle' in l) {
        (l as L.Path).setStyle(styleForFeature(feature, selectedId));
      }
    });
  }, [selectedId, collection]);

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    const risk = p.riskLevel ?? p.risk_level;
    const score = p.riskScore ?? p.risk_score;
    const name = featureLabel(feature);
    const lines = [
      `<strong>${name}</strong>`,
      risk ? `Risque : ${isRiskLevel(risk) ? RISK_LABELS[risk] : String(risk)}` : null,
      score != null ? `Score : ${String(score)}` : null,
    ].filter(Boolean);
    layer.bindPopup(lines.join('<br/>'));
    layer.on({
      click: (e: LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        onFeatureClick?.(feature, layer);
      },
    });
  };

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-brand/15', className)}>
      <div style={{ height }}>
        <MapContainer
          center={[-18.9, 47.5]}
          zoom={6}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GeoJSON
            key={JSON.stringify(collection.features?.length ?? 0) + String(selectedId ?? '')}
            data={collection}
            style={(feature) => styleForFeature(feature, selectedId)}
            onEachFeature={onEachFeature}
            ref={geoJsonRef as never}
          />
          {collection.features.length > 0 ? <FitBounds data={collection} /> : null}
        </MapContainer>
      </div>
      {showLegend ? (
        <div className="absolute bottom-3 left-3 z-[400] rounded-lg border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
          <p className="mb-1.5 font-semibold text-ink">Niveau de risque</p>
          <ul className="space-y-1">
            {(Object.keys(RISK_LABELS) as RiskLevel[]).map((level) => (
              <li key={level} className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-sm"
                  style={{ background: RISK_COLORS[level] }}
                />
                {RISK_LABELS[level]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
