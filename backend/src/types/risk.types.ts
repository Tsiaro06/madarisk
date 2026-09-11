import { RiskLevel, RiskPhase, SeverityLevel } from './event.types';
import { GeoJsonGeometry } from './territory.types';

export interface RiskFactors {
  rainScore: number;
  windScore: number;
  proximityScore: number;
  vulnerabilityScore: number;
  exposureScore: number;
}

export interface RiskPresentation {
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
}

export interface RiskAssessmentResult {
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  factors: RiskFactors;
  explanation: string[];
  assessedAt: string;
}

export interface RiskConfiguration {
  id: string;
  name: string;
  rainWeight: number;
  windWeight: number;
  proximityWeight: number;
  vulnerabilityWeight: number;
  exposureWeight: number;
  lowThreshold: number;
  moderateThreshold: number;
  highThreshold: number;
  extremeThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiskWeights {
  rainWeight: number;
  windWeight: number;
  proximityWeight: number;
  vulnerabilityWeight: number;
  exposureWeight: number;
}

export interface RiskThresholds {
  lowThreshold: number;
  moderateThreshold: number;
  highThreshold: number;
  extremeThreshold: number;
}

export interface RiskAssessment {
  id: string;
  communeId: string;
  eventId: string | null;
  riskConfigurationId: string | null;
  phase: RiskPhase;
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  factors: RiskFactors;
  explanation: string[];
  modelVersion: string;
  assessedAt: string;
  createdAt: string;
}

export interface PriorityCommune {
  communeId: string;
  communeCode: string;
  communeName: string;
  districtId: string;
  districtName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  population: number | null;
  assessedAt: string;
}

export interface RiskRecalculationResult {
  phase: RiskPhase;
  totalCommunes: number;
  assessments: RiskAssessment[];
}

export interface RiskContext {
  communeId: string;
  vulnerabilityScore: number | null;
  population: number | null;
  rainfall24hMm: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  insideArea: boolean;
  distanceKm: number | null;
  severity: SeverityLevel | null;
  areaRadiusKm: number | null;
}

export interface RiskMapProperties {
  communeId: string;
  communeName: string;
  districtName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  explanation: string[];
}

export interface RiskMapFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry;
  properties: RiskMapProperties;
}

export interface RiskMapGeoJson {
  type: 'FeatureCollection';
  features: RiskMapFeature[];
}
