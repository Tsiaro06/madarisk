import { RiskLevel, RiskPhase, SeverityLevel } from './event.types';
import { GeoJsonGeometry } from './territory.types';

/** Origine du déclenchement d'un calcul d'exposition. */
export type ExposureTrigger = 'DETECTION' | 'SYNC' | 'MANUAL';

/** Provenance d'une zone d'influence (event_areas.source_type). */
export type AreaSourceType = 'ESTIMATION' | 'TRAJECTOIRE' | 'MANUEL' | 'POLYGONE';

/** Provenance de l'exposition d'une commune (exposed_communes.source_type). */
export type ExposureSourceType = 'SEUIL' | 'ZONE' | 'TRAJECTOIRE' | 'MANUEL';

/** Type de données : réel (seuil dépassé, trajectoire officielle) ou estimation système. */
export type ExposureDataType = 'REEL' | 'ESTIME';

export interface ExposureRun {
  id: string;
  eventId: string;
  trigger: ExposureTrigger;
  areasCreated: number;
  communesUpserted: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface ExposureRecalculationResult {
  eventId: string;
  trigger: ExposureTrigger;
  areasCreated: number;
  areasSkipped: number;
  communesUpserted: number;
  communesExposed: number;
  riskAssessed: number;
  runId: string;
}

export interface CreatedAreaResult {
  id: string | null;
  created: boolean;
}

export interface DetectionCommuneRow {
  communeId: string;
  metric: string | null;
  value: number | null;
  threshold: number | null;
  /**
   * Sévérité propre à la commune, déduite de l'écart au seuil. Permet de
   * n'alerter que les communes dont le dépassement est significatif, plutôt
   * que d'appliquer à toutes la sévérité maximale de l'événement.
   */
  severity: SeverityLevel | null;
}

export interface ExposureLayerProperties {
  communeId: string;
  communeCode: string;
  communeName: string;
  districtName: string;
  population: number | null;
  exposedPopulation: number | null;
  overlapPercent: number | null;
  distanceToTrackKm: number | null;
  sourceType: ExposureSourceType;
  dataType: ExposureDataType;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  updatedAt: string;
}

export interface ExposureLayerFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry;
  properties: ExposureLayerProperties;
}

export interface ExposureLayerGeoJson {
  type: 'FeatureCollection';
  features: ExposureLayerFeature[];
}

/** Zone d'influence telle que renvoyée par le moteur d'exposition. */
export interface ExposureZoneInput {
  phase: RiskPhase;
  riskLevel: RiskLevel;
  radiusKm: number;
  sourceType: AreaSourceType;
  isEstimate: boolean;
  description: string;
  geometry: GeoJsonGeometry;
}
