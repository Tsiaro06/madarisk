import { GeoJsonGeometry } from './territory.types';
import { AutomationRunStatus } from './automation.types';

export interface WeatherProvider {
  getCurrent(latitude: number, longitude: number): Promise<WeatherCurrent>;
  getForecast(latitude: number, longitude: number): Promise<WeatherForecast>;

  /** Lot d'observations « current » pour plusieurs communes (batch, ex : Open-Meteo). */
  getCurrentBatch?(communes: BatchCommuneInput[]): Promise<WeatherCurrentBatchItem[]>;

  /** Lot de prévisions quotidiennes agrégées pour plusieurs communes (batch). */
  getForecastDailyBatch?(communes: BatchCommuneInput[]): Promise<WeatherForecastDailyItem[]>;
}

export interface BatchCommuneInput {
  id: string;
  latitude: number;
  longitude: number;
}

export interface WeatherCurrentBatchItem {
  communeId: string;
  latitude: number;
  longitude: number;
  current: WeatherCurrent;
}

export interface WeatherCurrent {
  observedAt: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
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
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  createdAt: string;
}

export interface WeatherForecastDay {
  day: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  relativeHumidityAvg: number | null;
  precipitationSumMm: number | null;
  windSpeedMaxKmh: number | null;
  windGustsMaxKmh: number | null;
  windDirectionDeg: number | null;
  pressureAvgHpa: number | null;
  weatherCode: string | null;
}

export interface WeatherForecastDailyItem {
  communeId: string;
  latitude: number;
  longitude: number;
  days: WeatherForecastDay[];
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
  windGustsKmh: number | null;
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

export interface CommuneInfo {
  id: string;
  name: string;
  districtId: string;
  districtName: string;
  latitude: number;
  longitude: number;
}

export type WeatherSyncScope = 'OBSERVATIONS' | 'FORECASTS' | 'OBSERVATIONS_AND_FORECASTS';

export interface WeatherSyncTriggerResult {
  status: AutomationRunStatus;
  started: boolean;
  joinedExisting: boolean;
  runs: {
    scope: Exclude<WeatherSyncScope, 'OBSERVATIONS_AND_FORECASTS'>;
    runId: string;
    status: AutomationRunStatus;
  }[];
}

export interface WeatherSyncRunInfo {
  runId: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: AutomationRunStatus | null;
  scope: string;
  source: string;
  recordsProcessed: number;
  communesProcessed: number;
  errorsCount: number;
  errorMessage: string | null;
}

export interface WeatherMonitoringInfo {
  generatedAt: string;
  sources: {
    name: string;
    providerType: string;
    baseUrl: string | null;
    isActive: boolean;
    refreshIntervalMinutes: number;
    keyConfigured: boolean;
  }[];
  sync: {
    observations: {
      lastRun: WeatherSyncRunInfo | null;
      lastSuccessAt: string | null;
      lastDataAt: string | null;
      lagMinutes: number | null;
      status: 'FRESH' | 'STALE' | 'NEVER';
      communesData: number;
    };
    forecasts: {
      lastRun: WeatherSyncRunInfo | null;
      lastSuccessAt: string | null;
      lastDataAt: string | null;
      lagHours: number | null;
      status: 'FRESH' | 'STALE' | 'NEVER';
      communesData: number;
      maxForecastDay: string | null;
    };
  };
}
