import { GeoJsonGeometry } from './territory.types';

export interface WeatherProvider {
  getCurrent(latitude: number, longitude: number): Promise<WeatherCurrent>;
  getForecast(latitude: number, longitude: number): Promise<WeatherForecast>;
}

export interface WeatherCurrent {
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

export interface WeatherForecast {
  generatedAt: string;
  timezone: string;
  latitude: number;
  longitude: number;
  current: WeatherCurrent;
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

export interface WeatherMapPoint {
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

export interface WeatherRefreshResult {
  totalTargeted: number;
  totalSaved: number;
  totalFailed: number;
  failures: { communeId: string; reason: string }[];
}

export interface WeatherDgmIngestResult {
  dekadLabel: string;
  observedAt: string;
  gridPoints: number;
  communesSampled: number;
  alreadyPresent: number;
  communesWithoutValue: number;
  saved: number;
}

export interface WeatherMapGeoJson {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    id: string;
    geometry: GeoJsonGeometry;
    properties: WeatherMapPoint;
  }[];
}
