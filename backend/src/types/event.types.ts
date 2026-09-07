import { GeoJsonGeometry } from './territory.types';

export type EventType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'SECHERESSE'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'GLISSEMENT_TERRAIN'
  | 'FEU_VEGETATION'
  | 'AUTRE';

export const EVENT_TYPES: EventType[] = [
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'AUTRE',
];

export type EventStatus = 'BROUILLON' | 'PREVISION' | 'ACTIF' | 'SUIVI' | 'CLOTURE';

export const EVENT_STATUSES: EventStatus[] = [
  'BROUILLON',
  'PREVISION',
  'ACTIF',
  'SUIVI',
  'CLOTURE',
];

export type SeverityLevel = 'FAIBLE' | 'MODEREE' | 'ELEVEE' | 'EXTREME';

export const SEVERITY_LEVELS: SeverityLevel[] = ['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME'];

export type TrackType = 'OBSERVEE' | 'PREVUE';

export const TRACK_TYPES: TrackType[] = ['OBSERVEE', 'PREVUE'];

export type RiskPhase = 'AVANT' | 'PENDANT' | 'APRES' | 'RETABLISSEMENT';

export const RISK_PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];

export type RiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'EXTREME';

export const RISK_LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

export const EVENT_STATUS_FLOW: EventStatus[] = [
  'BROUILLON',
  'PREVISION',
  'ACTIF',
  'SUIVI',
  'CLOTURE',
];

export interface Event {
  id: string;
  eventCode: string;
  name: string;
  type: EventType;
  status: EventStatus;
  severity: SeverityLevel;
  description: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  startedAt: string | null;
  expectedEndAt: string | null;
  endedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventListItem {
  id: string;
  eventCode: string;
  name: string;
  type: EventType;
  status: EventStatus;
  severity: SeverityLevel;
  description: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  startedAt: string | null;
  expectedEndAt: string | null;
  endedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventStats {
  totalTrackPoints: number;
  totalAreas: number;
  totalExposedCommunes: number;
  exposedPopulation: number | null;
}

export interface EventRiskDistribution {
  FAIBLE?: number;
  MODERE?: number;
  ELEVE?: number;
  EXTREME?: number;
}

export interface EventDetail extends Event {
  stats: EventStats;
  riskDistribution: EventRiskDistribution | null;
  alerts: EventAlert[];
}

export interface EventAlert {
  id: string;
  title: string;
  type: string;
  status: string;
  severity: SeverityLevel;
  publishedAt: string | null;
}

export interface EventTrack {
  id: string;
  eventId: string;
  observedAt: string;
  forecastFor: string | null;
  trackType: TrackType;
  latitude: number;
  longitude: number;
  windSpeedKmh: number | null;
  gustSpeedKmh: number | null;
  pressureHpa: number | null;
  precipitationMm: number | null;
  movementDirection: string | null;
  movementSpeedKmh: number | null;
  createdAt: string;
}

export interface TrackGeoJson {
  type: 'FeatureCollection';
  features: EventTrackFeature[];
}

export interface EventTrackFeature {
  type: 'Feature';
  id?: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
}

export interface EventArea {
  id: string;
  eventId: string;
  phase: RiskPhase;
  riskLevel: RiskLevel;
  radiusKm: number | null;
  validFrom: string | null;
  validTo: string | null;
  source: string | null;
  createdAt: string;
  geometry: GeoJsonGeometry;
}

export interface AreaGeoJson {
  type: 'FeatureCollection';
  features: EventAreaFeature[];
}

export interface EventAreaFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
}

export interface ExposedCommuneRow {
  communeId: string;
  communeCode: string;
  communeName: string;
  districtId: string;
  districtCode: string;
  districtName: string;
  distanceToTrackKm: number | null;
  isInsideInfluenceArea: boolean;
  exposedPopulation: number | null;
  population: number | null;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
}

export interface ExposureCalculationResult {
  totalCommunesCalculated: number;
  totalIntersecting: number;
  totalExposedCommuneCount: number;
  totalExposedPopulation: number | null;
}
