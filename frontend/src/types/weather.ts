import type { WeatherMapFeatureProperties } from "@/types";

export type WeatherMetric =
  | "precipitation"
  | "temperature_2m"
  | "relative_humidity_2m"
  | "pressure_msl"
  | "wind_speed_10m";

export type WeatherViewMode = "OBSERVATION" | "PREVISION" | "HISTORIQUE";

/**
 * Une heure de la courbe d'une commune. `hourAt` est l'instant UTC ;
 * `isForecast` distingue réanalyse (heure passée, valeur observée par le
 * modèle) et prévision (heure à venir). Le backend stocke ces heures dans
 * `weather_hourly`, rafraîchies à chaque synchronisation.
 */
export interface WeatherHourPoint {
  hourAt: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  isForecast: boolean;
}

export const WEATHER_VIEW_MODE_LABELS: Record<WeatherViewMode, string> = {
  OBSERVATION: "Observation",
  PREVISION: "Prévision",
  HISTORIQUE: "Historique",
};

export type WeatherMapPropertyKey =
  | "temperatureC"
  | "humidityPercent"
  | "windSpeedKmh"
  | "precipitationMm"
  | "pressureHpa";

export type WeatherForecastPropertyKey =
  | "temperatureC"
  | "humidityPercent"
  | "precipitationMm"
  | "windSpeedKmh"
  | "pressureHpa";

export interface WeatherBucket {
  label: string;
  color: string;
  match: (value: number) => boolean;
}

export interface WeatherMetricConfig {
  label: string;
  unit: string;
  property: WeatherMapPropertyKey;
  forecastProperty: WeatherForecastPropertyKey;
  buckets: WeatherBucket[];
}

export interface WeatherMapLayerMeta {
  latestObservationAt: string | null;
}

export interface WeatherRefreshResult {
  totalTargeted: number;
  totalSaved: number;
  totalFailed: number;
  failures: { communeId: string; reason: string }[];
}

export type WeatherRefreshState =
  | { status: "RUNNING"; startedAt: string }
  | {
      status: "SUCCESS";
      startedAt: string;
      finishedAt: string;
      result: WeatherRefreshResult;
    }
  | { status: "FAILED"; startedAt: string; finishedAt: string; error: string };

/**
 * Réponse du lancement d'un rafraîchissement.
 *
 * `background` distingue les deux régimes : un district répond dans la seconde
 * (`background: false`), un run national part en tâche de fond et rend la main
 * immédiatement (`background: true`) car il interroge le fournisseur par lots et
 * dure plusieurs minutes.
 */
export interface WeatherRefreshStart {
  refreshId: string;
  state: WeatherRefreshState;
  background: boolean;
}

/**
 * Dernière exécution de synchronisation, telle que rapportée par le backend.
 * `errorsCount` et `errorMessage` sont ce qui distingue un échec discret d'un
 * simple retard : sans eux, un run `PARTIAL` passe pour un succès.
 */
export interface WeatherSyncRun {
  runId: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | null;
  scope: string;
  source: string;
  recordsProcessed: number;
  communesProcessed: number;
  errorsCount: number;
  errorMessage: string | null;
}

/**
 * Observations : la fraîcheur est exprimée en minutes parce que la carte
 * affiche un retard court (« 12 min »). Le backend ne renvoie ici ni
 * `lagHours` ni `maxForecastDay` -- ce sont des propriétés des prévisions, et
 * les déclarer ici en `number | null` ferait passer une valeur absente pour un
 * zéro exploitable.
 */
export interface WeatherObservationStatus {
  lastRun: WeatherSyncRun | null;
  lastSuccessAt: string | null;
  lastDataAt: string | null;
  lagMinutes: number | null;
  status: 'FRESH' | 'STALE' | 'NEVER';
  communesData: number;
}

/**
 * Prévisions : la granularité est l'heure, et le run porte la date couverte.
 */
export interface WeatherForecastStatus {
  lastRun: WeatherSyncRun | null;
  lastSuccessAt: string | null;
  lastDataAt: string | null;
  lagHours: number | null;
  status: 'FRESH' | 'STALE' | 'NEVER';
  communesData: number;
  maxForecastDay: string | null;
}

export interface WeatherQuota {
  /** Jour UTC au format `YYYY-MM-DD`. */
  day: string;
  consumedCalls: number;
  budgetCalls: number;
  remainingCalls: number;
  resetsAt: string;
}

export interface WeatherMonitoring {
  generatedAt: string;
  sources: Array<{
    name: string;
    providerType: string;
    baseUrl: string | null;
    isActive: boolean;
    refreshIntervalMinutes: number;
    keyConfigured: boolean;
  }>;
  /** Budget quotidien Open-Meteo : la cause d'échec la plus invisible. */
  quota: WeatherQuota;
  sync: {
    observations: WeatherObservationStatus;
    forecasts: WeatherForecastStatus;
  };
}

const percipitationStart = "#d6d6d6";
const coldBlue = "#2b7ce8";
const mediumBlue = "#2f80ed";
const deepBlue = "#1639a8";
const violet = "#7b2ff7";
const lightBlue = "#7cc4f0";
const green = "#2f9e44";
const lightGreen = "#a9d18f";
const yellow = "#f4c430";
const orange = "#f08c00";
const red = "#e03131";

export const WEATHER_METRIC_CONFIGS: Record<
  WeatherMetric,
  WeatherMetricConfig
> = {
  precipitation: {
    label: "Pluie",
    unit: "mm",
    property: "precipitationMm",
    forecastProperty: "precipitationMm",
    buckets: [
      { label: "0 mm", color: percipitationStart, match: (v) => v === 0 },
      { label: "0 à 2 mm", color: lightBlue, match: (v) => v > 0 && v <= 2 },
      { label: "2 à 10 mm", color: mediumBlue, match: (v) => v > 2 && v <= 10 },
      { label: "10 à 30 mm", color: deepBlue, match: (v) => v > 10 && v <= 30 },
      { label: "> 30 mm", color: violet, match: (v) => v > 30 },
    ],
  },
  temperature_2m: {
    label: "Température",
    unit: "°C",
    property: "temperatureC",
    forecastProperty: "temperatureC",
    buckets: [
      { label: "< 18 °C", color: coldBlue, match: (v) => v < 18 },
      { label: "18 à 24 °C", color: green, match: (v) => v >= 18 && v < 24 },
      { label: "24 à 30 °C", color: yellow, match: (v) => v >= 24 && v < 30 },
      { label: "30 à 35 °C", color: orange, match: (v) => v >= 30 && v < 35 },
      { label: "≥ 35 °C", color: red, match: (v) => v >= 35 },
    ],
  },
  relative_humidity_2m: {
    label: "Humidité",
    unit: "%",
    property: "humidityPercent",
    forecastProperty: "humidityPercent",
    buckets: [
      { label: "< 40 %", color: yellow, match: (v) => v < 40 },
      {
        label: "40 à 60 %",
        color: lightGreen,
        match: (v) => v >= 40 && v < 60,
      },
      { label: "60 à 80 %", color: green, match: (v) => v >= 60 && v < 80 },
      { label: "≥ 80 %", color: coldBlue, match: (v) => v >= 80 },
    ],
  },
  pressure_msl: {
    label: "Pression",
    unit: "hPa",
    property: "pressureHpa",
    forecastProperty: "pressureHpa",
    buckets: [
      { label: "< 1005 hPa", color: violet, match: (v) => v < 1005 },
      {
        label: "1005 à 1015 hPa",
        color: coldBlue,
        match: (v) => v >= 1005 && v < 1015,
      },
      {
        label: "1015 à 1025 hPa",
        color: green,
        match: (v) => v >= 1015 && v < 1025,
      },
      { label: "≥ 1025 hPa", color: orange, match: (v) => v >= 1025 },
    ],
  },
  wind_speed_10m: {
    label: "Vent",
    unit: "km/h",
    property: "windSpeedKmh",
    forecastProperty: "windSpeedKmh",
    buckets: [
      { label: "< 10 km/h", color: green, match: (v) => v < 10 },
      { label: "10 à 25 km/h", color: yellow, match: (v) => v >= 10 && v < 25 },
      { label: "25 à 45 km/h", color: orange, match: (v) => v >= 25 && v < 45 },
      { label: "≥ 45 km/h", color: red, match: (v) => v >= 45 },
    ],
  },
};

export const NO_DATA_COLOR = "#e2e8f0";
export const NO_DATA_BORDER = "#94a3b8";
export const SELECTED_BORDER = "#0f2a2e";

export function getWeatherValue(
  point: WeatherMapFeatureProperties | null | undefined,
  metric: WeatherMetric,
): number | null {
  if (!point) return null;
  const value = point[WEATHER_METRIC_CONFIGS[metric].property];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getWeatherColor(
  metric: WeatherMetric,
  value: number | null,
): string {
  if (value == null) return NO_DATA_COLOR;
  const bucket = WEATHER_METRIC_CONFIGS[metric].buckets.find((b) =>
    b.match(value),
  );
  return bucket?.color ?? NO_DATA_COLOR;
}

export function formatWeatherValue(
  metric: WeatherMetric,
  value: number | null,
): string {
  if (value == null) return "—";
  const { unit } = WEATHER_METRIC_CONFIGS[metric];
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

export const WEATHER_METRICS_ORDER: WeatherMetric[] = [
  "precipitation",
  "temperature_2m",
  "relative_humidity_2m",
  "pressure_msl",
  "wind_speed_10m",
];
