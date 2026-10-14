import { useEffect, useRef } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import { featureId, featureName } from '@/lib/crisisStyles';
import { alertStyle, alertTooltipElement } from '@/components/crisis/communeAlertStyle';
import type { EventCommuneAlertRow } from '@/types';

/**
 * Style neutre (GRIS) appliqué à la création de la couche. Sa RÉFÉRENCE doit
 * rester stable : `react-leaflet` rejoue `setStyle` dès que la prop `style`
 * change d'identité — un style recréé à chaque rendu (lecture animée : une image
 * par trame) effacerait les niveaux d'alerte posés par l'effet ci-dessous, d'où
 * un clignotement « apparaît / disparaît ». Les vraies couleurs sont appliquées
 * commune par commune, via `setStyle` ciblé.
 */
function baseAlertStyle(): PathOptions {
  return alertStyle(undefined, false);
}

interface CommuneAlertLayerProps {
  /** Limites communales (géométries administratives) servant de support. */
  data: FeatureCollection | null;
  /** Niveaux d'alerte actifs, indexés par communeId. */
  alerts: ReadonlyMap<string, EventCommuneAlertRow>;
  selectedId: string | null;
  onCommuneClick: (communeId: string, name: string) => void;
}

/**
 * Couche des niveaux d'alerte cyclonique par commune. Chaque couleur vient d'une
 * ligne d'alerte datée et sourcée ; une commune sans alerte active reste GRISE.
 * Aucune commune n'est colorée par sa seule distance au cyclone.
 */
export function CommuneAlertLayer({
  data,
  alerts,
  selectedId,
  onCommuneClick,
}: CommuneAlertLayerProps) {
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const node = l as L.Layer & { feature?: Feature };
      if (!node.feature || !('setStyle' in l)) return;
      const props = (node.feature.properties ?? {}) as Record<string, unknown>;
      const id = featureId(props);
      const row = alerts.get(id);
      const name = row?.communeName || featureName(props);
      const selected = selectedId != null && id === selectedId;
      (l as L.Path).setStyle(alertStyle(row, selected));
      const marker = l as L.Layer & { setTooltipContent?: (content: unknown) => void };
      if (typeof marker.setTooltipContent === 'function') {
        marker.setTooltipContent(alertTooltipElement(name, row));
      }
    });
  }, [alerts, selectedId]);

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
      style={baseAlertStyle}
      onEachFeature={onEachFeature}
    />
  );
}
