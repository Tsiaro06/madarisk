import { GeoJSON } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { RISK_COLORS, RISK_LABELS, type RiskLevel } from '@/types';
import { formatAntananarivo, vigilanceLabel } from '@/lib/historical';

const NEUTRAL_VIGILANCE_COLOR = '#64748b';

/** Niveau de risque documenté d'une zone (enum backend), sinon `null`. */
function vigilanceLevel(feature?: Feature | null): RiskLevel | null {
  const props = (feature?.properties ?? {}) as Record<string, unknown>;
  const raw = props.riskLevel;
  return typeof raw === 'string' && raw in RISK_COLORS ? (raw as RiskLevel) : null;
}

function vigilanceColor(feature?: Feature | null): string {
  const level = vigilanceLevel(feature);
  return level ? RISK_COLORS[level] : NEUTRAL_VIGILANCE_COLOR;
}

/**
 * Contour tireté + remplissage très clair : cette couche est PRÉVISIONNELLE
 * (vigilance du bulletin). Elle doit rester visuellement distincte des communes
 * colorées par un impact observé.
 */
function vigilanceStyle(feature?: Feature): PathOptions {
  const color = vigilanceColor(feature);
  return {
    color,
    weight: 2,
    dashArray: '7 5',
    fillColor: color,
    fillOpacity: 0.13,
    opacity: 0.95,
  };
}

function line(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

function tooltipElement(feature: Feature<Geometry>): HTMLElement {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const level = vigilanceLevel(feature);

  const el = document.createElement('div');
  el.className = 'text-[11px] leading-snug';

  const title = document.createElement('strong');
  title.textContent =
    vigilanceLabel(typeof props.description === 'string' ? props.description : null) ??
    (level ? `Zone de vigilance — ${RISK_LABELS[level]}` : 'Zone de vigilance');
  el.appendChild(title);

  el.appendChild(line(`Niveau : ${level ? RISK_LABELS[level] : 'non précisé'} (prévision)`));
  if (typeof props.phase === 'string' && props.phase) {
    el.appendChild(line(`Phase : ${props.phase}`));
  }
  if (props.validFrom || props.validTo) {
    el.appendChild(
      line(
        `Validité : ${formatAntananarivo(
          typeof props.validFrom === 'string' ? props.validFrom : null,
        )} → ${formatAntananarivo(typeof props.validTo === 'string' ? props.validTo : null)}`,
      ),
    );
  }
  if (typeof props.source === 'string' && props.source) {
    el.appendChild(line(`Source : ${props.source}`));
  }
  if (typeof props.description === 'string' && props.description) {
    const description = document.createElement('div');
    description.className = 'mt-1 max-w-[16rem] text-muted';
    description.textContent = props.description;
    el.appendChild(description);
  }
  return el;
}

interface VigilanceZoneLayerProps {
  data: FeatureCollection | null;
}

/**
 * Zones de vigilance du bulletin prévisionnel (alertes rouge / jaune / verte) :
 * couche documentaire indépendante du curseur temporel, dessinée sous les
 * communes pour ne jamais se substituer à un impact observé.
 */
export function VigilanceZoneLayer({ data }: VigilanceZoneLayerProps) {
  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    layer.bindTooltip(tooltipElement(feature), { sticky: true });
  };

  return (
    <GeoJSON
      data={data ?? { type: 'FeatureCollection', features: [] }}
      style={vigilanceStyle}
      onEachFeature={onEachFeature}
    />
  );
}
