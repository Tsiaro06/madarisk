import type { Feature } from 'geojson';
import type { CircleMarkerOptions, PathOptions } from 'leaflet';
import type { RiskLevel } from '@/types';
import { RISK_COLORS } from '@/types';
import { BRAND_DEEP } from '@/lib/brandColors';

export type TrackTypeValue = 'OBSERVEE' | 'PREVUE';

/** Trajectoire observée — bleu acier calme */
export const TRACK_OBSERVED_FILL = '#5a7d90';
export const TRACK_OBSERVED_EDGE = '#3d5a6a';
/** Trajectoire prévue — ambre désaturé */
export const TRACK_FORECAST_FILL = '#c47d4a';
export const TRACK_FORECAST_EDGE = '#8a5530';
export const EXPOSED_BORDER = '#475569';
export const SELECTED_BORDER = BRAND_DEEP;
export const NO_RISK_FILL = '#94a3b8';
/** Contours communes hors risque — gris neutre, pas de bleu saturé */
export const NO_EVENT_COMMUNE_FILL = '#94a3b8';

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === 'FAIBLE' || value === 'MODERE' || value === 'ELEVE' || value === 'EXTREME';
}

export function featureId(p: Record<string, unknown>): string {
  return String(p.communeId ?? p.id ?? p.commune_id ?? '');
}

export function featureName(p: Record<string, unknown>): string {
  return String(p.communeName ?? p.commune ?? p.nom ?? p.name ?? '');
}

function featureProps(feature?: Feature | null): Record<string, unknown> {
  return (feature?.properties ?? {}) as Record<string, unknown>;
}

function riskColorOf(props: Record<string, unknown>): string {
  const level = props.riskLevel ?? props.risk_level;
  return isRiskLevel(level) ? RISK_COLORS[level] : NO_RISK_FILL;
}

export function riskStyle(
  feature?: Feature,
  selectedId?: string | null,
  exposedCommuneIds?: Set<string>,
): PathOptions {
  const p = featureProps(feature);
  const color = riskColorOf(p);
  const communeId = featureId(p);
  const isExposed = exposedCommuneIds ? exposedCommuneIds.has(communeId) : false;
  const selected = selectedId != null && communeId === String(selectedId);
  return {
    color: selected ? SELECTED_BORDER : isExposed ? EXPOSED_BORDER : '#cbd5e1',
    weight: selected ? 3.5 : isExposed ? 2 : 1,
    fillColor: color,
    fillOpacity: selected ? 0.72 : isExposed ? 0.48 : 0.32,
    opacity: selected ? 1 : 0.9,
  };
}

export function communeStyle(
  feature?: Feature,
  selectedId?: string | null,
  hasEvent?: boolean,
): PathOptions {
  const p = featureProps(feature);
  const level = hasEvent ? (p.riskLevel ?? p.risk_level) : undefined;
  const color = hasEvent && isRiskLevel(level) ? RISK_COLORS[level] : NO_EVENT_COMMUNE_FILL;
  const selected = selectedId != null && featureId(p) === String(selectedId);
  return {
    color: selected ? SELECTED_BORDER : '#94a3b8',
    weight: selected ? 3.5 : 1,
    fillColor: selected ? BRAND_DEEP : color,
    fillOpacity: selected ? 0.35 : hasEvent && isRiskLevel(level) ? 0.22 : 0.04,
    opacity: selected ? 1 : 0.85,
  };
}

export function trackTypeOf(feature?: Feature | null): TrackTypeValue | null {
  const p = featureProps(feature);
  const type = String(p.trackType ?? '');
  return type === 'OBSERVEE' || type === 'PREVUE' ? type : null;
}

export function trackStyle(feature?: Feature | null): PathOptions {
  const isForecast = trackTypeOf(feature) === 'PREVUE';
  return {
    color: isForecast ? TRACK_FORECAST_FILL : TRACK_OBSERVED_FILL,
    weight: 2.5,
    opacity: 0.75,
    ...(isForecast ? { dashArray: '8 6' } : {}),
  };
}

export function trackPointStyle(trackType: TrackTypeValue | null | undefined): CircleMarkerOptions {
  return trackType === 'PREVUE'
    ? {
        radius: 5,
        color: TRACK_FORECAST_EDGE,
        weight: 2,
        fillColor: TRACK_FORECAST_FILL,
        fillOpacity: 0.9,
      }
    : {
        radius: 5,
        color: TRACK_OBSERVED_EDGE,
        weight: 2,
        fillColor: TRACK_OBSERVED_FILL,
        fillOpacity: 0.9,
      };
}

export function districtStyle(): PathOptions {
  return {
    color: '#94a3b8',
    weight: 1,
    fillColor: '#f8fafc',
    fillOpacity: 0.03,
    dashArray: '4 4',
  };
}
