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
/**
 * Salle de crise : la trajectoire prévue reprend le rose du bulletin de veille
 * et se dessine par-dessus la zone probable ; les points futurs sont des
 * pastilles blanches à contour rose. La carte historique garde l'ambre sobre.
 */
export const CRISIS_FORECAST_FILL = '#d6336c';
export const CRISIS_FORECAST_POINT_FILL = '#ffffff';
export const EXPOSED_BORDER = '#475569';
export const SELECTED_BORDER = BRAND_DEEP;
export const NO_RISK_FILL = '#94a3b8';
/** Contours communes hors risque — gris neutre, pas de bleu saturé */
export const NO_EVENT_COMMUNE_FILL = '#94a3b8';
/** Zone de position probable du centre (prévision) — violet translucide, contour pointillé. */
export const CONE_FILL = '#8b7cf6';
export const CONE_EDGE = '#7c6cf0';
export const CONE_FILL_OPACITY = 0.25;
/** Communes et districts traversés par la zone probable. */
export const CONE_AREA_FILL = '#f5b942';
export const CONE_AREA_EDGE = '#b8791f';
export const CONE_AREA_FILL_OPACITY = 0.7;

/**
 * Halo de la zone probable : un seul polygone continu. Le contour pointillé
 * distingue la zone prévue de l'emprise observée, dessinée juste en dessous.
 */
export function coneStyle(): PathOptions {
  return {
    color: CONE_EDGE,
    weight: 1.5,
    dashArray: '6 6',
    opacity: 0.9,
    fillColor: CONE_FILL,
    fillOpacity: CONE_FILL_OPACITY,
  };
}

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
  /** Communes traversées par la zone de position probable : signalées en jaune. */
  coneCommuneIds?: ReadonlySet<string>,
): PathOptions {
  const p = featureProps(feature);
  const level = hasEvent ? (p.riskLevel ?? p.risk_level) : undefined;
  const color = hasEvent && isRiskLevel(level) ? RISK_COLORS[level] : NO_EVENT_COMMUNE_FILL;
  const communeId = featureId(p);
  const selected = selectedId != null && communeId === String(selectedId);
  // La commune traversée par la zone probable passe au jaune, sauf si elle est
  // sélectionnée : la sélection reste le signal le plus fort de la carte.
  if (!selected && coneCommuneIds?.has(communeId)) {
    return {
      color: CONE_AREA_EDGE,
      weight: 1.5,
      fillColor: CONE_AREA_FILL,
      fillOpacity: CONE_AREA_FILL_OPACITY,
      opacity: 0.95,
    };
  }
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
    color: isForecast ? CRISIS_FORECAST_FILL : TRACK_OBSERVED_FILL,
    weight: 2.5,
    opacity: 0.75,
    ...(isForecast ? { dashArray: '8 6' } : {}),
  };
}

export function trackPointStyle(trackType: TrackTypeValue | null | undefined): CircleMarkerOptions {
  return trackType === 'PREVUE'
    ? {
        radius: 5,
        color: CRISIS_FORECAST_FILL,
        weight: 2,
        fillColor: CRISIS_FORECAST_POINT_FILL,
        fillOpacity: 1,
      }
    : {
        radius: 5,
        color: TRACK_OBSERVED_EDGE,
        weight: 2,
        fillColor: TRACK_OBSERVED_FILL,
        fillOpacity: 0.9,
      };
}

/** Identifiant de district : le nom des propriétés varie selon l'endpoint. */
export function districtFeatureId(p: Record<string, unknown>): string {
  return String(p.districtId ?? p.district_id ?? p.id ?? '');
}

export function districtStyle(
  feature?: Feature,
  /** Districts traversés par la zone de position probable : signalés en jaune. */
  coneDistrictIds?: ReadonlySet<string>,
): PathOptions {
  const inCone = Boolean(
    coneDistrictIds?.size && coneDistrictIds.has(districtFeatureId(featureProps(feature))),
  );
  if (inCone) {
    return {
      color: CONE_AREA_EDGE,
      weight: 2,
      fillColor: CONE_AREA_FILL,
      fillOpacity: CONE_AREA_FILL_OPACITY,
      dashArray: '4 4',
    };
  }
  return {
    color: '#94a3b8',
    weight: 1,
    fillColor: '#f8fafc',
    fillOpacity: 0.03,
    dashArray: '4 4',
  };
}
