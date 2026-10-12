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

export type ImpactState =
  | 'NOT_REACHED'
  | 'CENTER_CROSSED'
  | 'WIND_IMPACT'
  | 'RAIN_IMPACT'
  | 'FLOOD_IMPACT'
  | 'IMPACT_ESTIMATED'
  | 'UNKNOWN';

export type ObservedRiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'TRES_ELEVE' | 'INCONNU';

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

export interface TrackStatePoint extends EventTrack {
  radius34ktKm: number | null;
  radius50ktKm: number | null;
  radius64ktKm: number | null;
  radiusMaxKm: number | null;
  radiusSource: string | null;
  radiusMeasureType: string | null;
  radiusQuality: string | null;
  dataQuality: string | null;
  confidence: number | null;
}

export interface TrackState {
  eventId: string;
  at: string;
  hasRadiusData: boolean;
  radiusSource: string | null;
  radiusMeasureType: string | null;
  radiusMaxKm: number | null;
  currentPoint: TrackStatePoint | null;
  previousPoints: TrackStatePoint[];
  upToAtCount: number;
  totalPoints: number;
  method: string;
}

export interface EventCommuneImpactRow {
  communeId: string;
  communeName: string;
  communeCode: string | null;
  districtId: string | null;
  districtName: string | null;
  firstAffectedAt: string | null;
  lastAffectedAt: string | null;
  impactState: ImpactState;
  observedRiskLevel: ObservedRiskLevel;
  forecastRiskLevel: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number | null;
  method: string | null;
  notes: string | null;
}

export interface CommuneImpactsResult {
  eventId: string;
  at: string;
  count: number;
  hasRadiusData: boolean;
  radiusKm: number | null;
  radiusSource: string | null;
  method: string;
  communes: EventCommuneImpactRow[];
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
  overlapPercent: number | null;
  sourceType: 'SEUIL' | 'ZONE' | 'TRAJECTOIRE' | 'MANUEL';
  dataType: 'REEL' | 'ESTIME';
  updatedAt: string;
}

export interface ExposureCalculationResult {
  totalCommunesCalculated: number;
  totalIntersecting: number;
  totalExposedCommuneCount: number;
  totalExposedPopulation: number | null;
}
