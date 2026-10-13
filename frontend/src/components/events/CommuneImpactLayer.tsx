import { useEffect, useRef } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import { featureId, featureName } from '@/lib/crisisStyles';
import {
  formatAntananarivo,
  NOT_AFFECTED_FILL,
  OBSERVED_RISK_COLORS,
  OBSERVED_RISK_LABELS,
} from '@/lib/historical';
import type { EventCommuneImpactRow } from '@/types';

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
    color: selected ? '#0f172a' : 'rgba(255, 255, 255, 0.75)',
    weight: selected ? 2.4 : 0.8,
    fillColor: fill,
    fillOpacity: selected ? 0.72 : 0.55,
    opacity: 1,
  };
}

interface CommuneImpactLayerProps {
  data: FeatureCollection | null;
  /** Impacts documentés à la date courante, indexés par communeId. */
  affected: Map<string, EventCommuneImpactRow>;
  selectedId: string | null;
  onCommuneClick: (communeId: string, name: string) => void;
}

function impactTooltipElement(name: string, row: EventCommuneImpactRow | undefined): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-[11px] leading-snug';

  const title = document.createElement('strong');
  title.textContent = name || 'Commune';
  el.appendChild(title);

  if (!row) {
    const neutral = document.createElement('div');
    neutral.textContent = 'Aucun impact documenté à cette date.';
    el.appendChild(neutral);
    return el;
  }

  const risk = document.createElement('div');
  risk.textContent = `Risque observé : ${OBSERVED_RISK_LABELS[row.observedRiskLevel]}`;
  el.appendChild(risk);

  const first = document.createElement('div');
  first.textContent = `Premier impact : ${
    row.firstAffectedAt ? formatAntananarivo(row.firstAffectedAt) : 'non disponible'
  }`;
  el.appendChild(first);

  if (row.sourceName) {
    const source = document.createElement('div');
    source.textContent = `Source : ${row.sourceName}`;
    el.appendChild(source);
  }

  return el;
}

/**
 * Couche communale de l'historique : une commune se colore uniquement parce
 * qu'un impact daté la désigne, jamais par une distance arbitraire au cyclone.
 */
export function CommuneImpactLayer({
  data,
  affected,
  selectedId,
  onCommuneClick,
}: CommuneImpactLayerProps) {
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const node = l as L.Layer & { feature?: Feature };
      if (!node.feature || !('setStyle' in l)) return;
      const props = (node.feature.properties ?? {}) as Record<string, unknown>;
      const id = featureId(props);
      const row = affected.get(id);
      const name = row?.communeName || featureName(props);
      const selected = selectedId != null && id === selectedId;
      (l as L.Path).setStyle(impactedCommuneStyle(row, selected));
      const marker = l as L.Layer & { setTooltipContent?: (content: unknown) => void };
      if (typeof marker.setTooltipContent === 'function') {
        marker.setTooltipContent(impactTooltipElement(name, row));
      }
    });
  }, [affected, selectedId]);

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const name = featureName(props);
    layer.bindTooltip(name || 'Commune', { sticky: true });
    layer.on('click', (event) => {
      L.DomEvent.stop(event.originalEvent);
      onCommuneClick(featureId(props), name);
    });
  };

  return (
    <GeoJSON
      ref={layerRef as never}
      data={data ?? { type: 'FeatureCollection', features: [] }}
      style={neutralCommuneStyle}
      onEachFeature={onEachFeature}
    />
  );
}
