export type TerritoryRiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'EXTREME';
export type TerritoryRiskPhase = 'AVANT' | 'PENDANT' | 'APRES' | 'RETABLISSEMENT';

export interface TerritoryGeoJson {
  type: 'FeatureCollection';
  features: TerritoryFeature[];
}

export interface TerritoryFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
}

export type GeoJsonGeometry =
  | {
      type:
        | 'Point'
        | 'LineString'
        | 'Polygon'
        | 'MultiPoint'
        | 'MultiLineString'
        | 'MultiPolygon'
        | 'GeometryCollection';
      coordinates: unknown;
    }
  | Record<string, unknown>;

export interface DistrictListItem {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  population: number | null;
  vulnerabilityScore: number | null;
  centroid: GeoJsonGeometry | null;
  totalCommunes: number;
  geometry?: GeoJsonGeometry;
}

export interface DistrictDetail extends DistrictListItem {
  totalCommunesWithRisk: number | null;
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
  centroid: GeoJsonGeometry | null;
  geometry?: GeoJsonGeometry;
}

export interface DistrictParent {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
}

export interface RiskSummary {
  riskScore: number | null;
  riskLevel: TerritoryRiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: TerritoryRiskPhase | null;
  assessedAt: string | null;
}

export interface WeatherSummary {
  observedAt: string;
  precipitationMm: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
}

export interface CommuneEvent {
  id: string;
  eventCode: string;
  name: string;
  type: string;
  status: string;
  startedAt: string | null;
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
    centroid: GeoJsonGeometry | null;
  };
  district: DistrictParent | null;
  geometry: GeoJsonGeometry | null;
  weather: WeatherSummary | null;
  risk: RiskSummary | null;
  events: CommuneEvent[];
}

export interface TerritorySearchResult {
  type: 'district' | 'commune';
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  district?: {
    id: string;
    adminCode: string;
    name: string;
  } | null;
}

export interface MapDistrictFeatureProperties {
  districtId: string;
  districtCode: string;
  district: string;
  population: number | null;
  vulnerabilityScore: number | null;
  totalCommunes: number;
  totalCommunesHighRisk: number;
  totalCommunesExtremeRisk: number;
}

export interface MapCommuneFeatureProperties {
  communeId: string;
  communeCode: string;
  commune: string;
  districtId: string;
  districtCode: string;
  district: string;
  population: number | null;
  vulnerabilityScore: number | null;
  riskScore: number | null;
  riskLevel: TerritoryRiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: TerritoryRiskPhase | null;
  assessedAt: string | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
