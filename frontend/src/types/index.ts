export type RiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'EXTREME';
export type RiskPhase = 'AVANT' | 'PENDANT' | 'APRES' | 'RETABLISSEMENT';
export type EventStatus = 'BROUILLON' | 'PREVISION' | 'ACTIF' | 'SUIVI' | 'CLOTURE';
export type EventType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'SECHERESSE'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'GLISSEMENT_TERRAIN'
  | 'FEU_VEGETATION'
  | 'AUTRE';
export type SeverityLevel = 'FAIBLE' | 'MODEREE' | 'ELEVEE' | 'EXTREME';
export type AlertStatus = 'BROUILLON' | 'PUBLIEE' | 'ARCHIVEE' | 'EXPIREE';
export type AlertType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'SECHERESSE'
  | 'INFORMATION'
  | 'URGENCE';

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SanitizedUser {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: import('./roles').UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: SanitizedUser;
}

export interface DashboardSummary {
  activeEvents: number;
  forecastEvents: number;
  activeAlerts: number;
  totalDistricts: number;
  totalCommunes: number;
  extremeRiskCommunes: number;
  highRiskCommunes: number;
  exposedPopulation: number | null;
  lastUpdatedAt: string | null;
  pendingMatchings?: number;
  latestAlerts: Array<{
    id: string;
    title: string;
    type: string;
    severity: string;
    status: string;
    eventId: string | null;
    districtId: string | null;
    communeId: string | null;
    publishedAt: string | null;
  }>;
  priorityCommunes: PriorityCommune[];
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

export interface RiskDistribution {
  FAIBLE: number;
  MODERE: number;
  ELEVE: number;
  EXTREME: number;
  SANS_RISQUE: number;
}

export interface EventsTimelineEntry {
  date: string;
  total: number;
  byType: Record<string, number>;
}

export interface DistrictListItem {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  population: number | null;
  vulnerabilityScore: number | null;
  totalCommunes: number;
}

export interface CommuneListItem {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  postalCode: string | null;
  population: number | null;
  vulnerabilityScore: number | null;
  districtId: string;
  districtCode: string;
  districtName: string;
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

export interface AlertListRow {
  id: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  type: AlertType;
  severity: SeverityLevel;
  status: AlertStatus;
  title: string;
  message: string;
  createdBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventName: string | null;
  districtName: string | null;
  communeName: string | null;
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  FAIBLE: '#2F9E44',
  MODERE: '#F4C430',
  ELEVE: '#F08C00',
  EXTREME: '#E03131',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  FAIBLE: 'Faible',
  MODERE: 'Modéré',
  ELEVE: 'Élevé',
  EXTREME: 'Extrême',
};

export interface TerritorySearchResult {
  type: 'district' | 'commune';
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  district?: { id: string; adminCode: string; name: string } | null;
}

export interface CommuneWeatherSummary {
  observedAt: string;
  precipitationMm: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
}

export interface CommuneRiskSummary {
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: RiskPhase | null;
  assessedAt: string | null;
}

export interface CommuneEventRef {
  id: string;
  eventCode: string;
  name: string;
  type: string;
  status: string;
  startedAt: string | null;
}

export interface GeoJsonPoint {
  type: string;
  coordinates: unknown;
  [key: string]: unknown;
}

export interface CommuneDetail {
  commune: {
    id: string;
    adminCode: string;
    name: string;
    normalizedName: string;
    postalCode: string | null;
    population: number | null;
    vulnerabilityScore: number | null;
    centroid: GeoJsonPoint | null;
  };
  district: {
    id: string;
    adminCode: string;
    name: string;
    normalizedName: string;
  } | null;
  geometry: unknown | null;
  weather: CommuneWeatherSummary | null;
  risk: CommuneRiskSummary | null;
  events: CommuneEventRef[];
}

export interface WeatherObservation {
  id: string;
  communeId: string | null;
  eventId: string | null;
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  createdAt: string;
}

export interface WeatherCurrentData {
  observedAt: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
}

export interface WeatherForecastData {
  generatedAt: string;
  timezone: string;
  latitude: number;
  longitude: number;
  current: WeatherCurrentData;
  hourly: {
    time: string[];
    temperatureC: (number | null)[];
    humidityPercent: (number | null)[];
    precipitationMm: (number | null)[];
    rainMm: (number | null)[];
    windSpeedKmh: (number | null)[];
    windDirectionDeg: (number | null)[];
    surfacePressureHpa: (number | null)[];
    weatherCode: (number | null)[];
  };
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
  factors: {
    rainScore: number;
    windScore: number;
    proximityScore: number;
    vulnerabilityScore: number;
    exposureScore: number;
  };
  explanation: string[];
  modelVersion: string;
  assessedAt: string;
  createdAt: string;
}

export interface RiskMapFeatureProperties {
  communeId: string;
  communeName: string;
  districtName: string;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  explanation: string[] | null;
  assessedAt: string | null;
}

export interface CommuneMapFeatureProperties {
  communeId: string;
  communeCode: string;
  commune: string;
  districtId: string;
  districtCode: string;
  district: string;
  population: number | null;
  vulnerabilityScore: number | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: RiskPhase | null;
  assessedAt: string | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
}

export interface WeatherMapFeatureProperties {
  communeId: string;
  communeName: string;
  districtId: string;
  districtName: string;
  longitude: number;
  latitude: number;
  observedAt: string | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
}
