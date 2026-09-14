import type { Feature } from 'geojson';
import type { CircleMarkerOptions, PathOptions } from 'leaflet';
import type { RiskLevel } from '@/types';
import { RISK_COLORS } from '@/types';

export type TrackTypeValue = 'OBSERVEE' | 'PREVUE';

export const TRACK_OBSERVED_FILL = '#047857';
export const TRACK_OBSERVED_EDGE = '#065f46';
export const TRACK_FORECAST_FILL = '#ea580c';
export const TRACK_FORECAST_EDGE = '#7c2d12';
export const EXPOSED_BORDER = '#111827';
export const SELECTED_BORDER = '#065f46';
export const NO_RISK_FILL = '#94a3b8';
export const NO_EVENT_COMMUNE_FILL = '#047857';

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
    color: selected ? SELECTED_BORDER : isExposed ? EXPOSED_BORDER : '#9ca3af',
    weight: selected ? 3 : isExposed ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.8 : isExposed ? 0.85 : 0.55,
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
    color: selected ? SELECTED_BORDER : NO_EVENT_COMMUNE_FILL,
    weight: selected ? 3 : 1,
    fillColor: color,
    fillOpacity: hasEvent && isRiskLevel(level) ? 0.3 : 0.08,
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
    weight: 3,
    opacity: 0.9,
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
        fillOpacity: 1,
      }
    : {
        radius: 5,
        color: TRACK_OBSERVED_EDGE,
        weight: 2,
        fillColor: TRACK_OBSERVED_FILL,
        fillOpacity: 1,
      };
}

export function districtStyle(): PathOptions {
  return {
    color: '#64748b',
    weight: 1.5,
    fillColor: '#f8fafc',
    fillOpacity: 0.05,
    dashArray: '4 4',
  };
}