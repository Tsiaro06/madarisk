import type { DetectionOperator } from '../types/automation.types';
import type { SeverityLevel } from '../types/event.types';
import type { HazardDetectionRule } from '../types/automation.types';

export const OBSERVATION_METRIC_ALIASES: Record<string, string> = {
  precipitation: 'precipitation_mm',
  precip: 'precipitation_mm',
  precipitation_mm: 'precipitation_mm',
  rain: 'rainfall_24h_mm',
  rainfall: 'rainfall_24h_mm',
  rainfall_24h: 'rainfall_24h_mm',
  rainfall_24h_mm: 'rainfall_24h_mm',
  temperature: 'temperature_c',
  temperature_2m: 'temperature_c',
  temperature_c: 'temperature_c',
  humidity: 'humidity_percent',
  relative_humidity: 'humidity_percent',
  humidity_percent: 'humidity_percent',
  wind: 'wind_speed_kmh',
  wind_speed: 'wind_speed_kmh',
  wind_speed_10m: 'wind_speed_kmh',
  wind_speed_kmh: 'wind_speed_kmh',
  wind_gusts: 'wind_gusts_kmh',
  wind_gusts_kmh: 'wind_gusts_kmh',
  pressure: 'pressure_hpa',
  surface_pressure: 'pressure_hpa',
  pressure_hpa: 'pressure_hpa',
};

export const FORECAST_METRIC_ALIASES: Record<string, string> = {
  precipitation: 'precipitation_sum_mm',
  precip: 'precipitation_sum_mm',
  precipitation_sum_mm: 'precipitation_sum_mm',
  rain: 'precipitation_sum_mm',
  rainfall: 'precipitation_sum_mm',
  temperature: 'temperature_max_c',
  temperature_2m: 'temperature_max_c',
  temperature_max: 'temperature_max_c',
  temperature_max_c: 'temperature_max_c',
  temperature_min: 'temperature_min_c',
  temperature_min_c: 'temperature_min_c',
  humidity: 'relative_humidity_avg',
  relative_humidity: 'relative_humidity_avg',
  relative_humidity_avg: 'relative_humidity_avg',
  wind: 'wind_speed_max_kmh',
  wind_speed: 'wind_speed_max_kmh',
  wind_speed_max: 'wind_speed_max_kmh',
  wind_speed_10m: 'wind_speed_max_kmh',
  wind_speed_max_kmh: 'wind_speed_max_kmh',
  wind_gusts: 'wind_gusts_max_kmh',
  wind_gusts_max_kmh: 'wind_gusts_max_kmh',
  pressure: 'pressure_avg_hpa',
  surface_pressure: 'pressure_avg_hpa',
  pressure_avg_hpa: 'pressure_avg_hpa',
};

export const WIND_METRICS = new Set([
  'wind_speed_kmh',
  'wind_gusts_kmh',
  'wind_speed_max_kmh',
  'wind_gusts_max_kmh',
]);

export const PRESSURE_METRICS = new Set(['pressure_hpa', 'pressure_avg_hpa']);

export const RAIN_METRICS = new Set([
  'precipitation_mm',
  'rainfall_24h_mm',
  'precipitation_sum_mm',
]);

export function normalizeMetric(metric: string): string {
  return metric.trim().toLowerCase();
}

export function metricToObservationColumn(metric: string): string | null {
  return OBSERVATION_METRIC_ALIASES[normalizeMetric(metric)] ?? null;
}

export function metricToForecastColumn(metric: string): string | null {
  return FORECAST_METRIC_ALIASES[normalizeMetric(metric)] ?? null;
}

export function applyOperator(
  operator: DetectionOperator,
  value: number,
  threshold: number,
  thresholdMax: number | null,
): boolean {
  switch (operator) {
    case 'GT':
      return value > threshold;
    case 'GE':
      return value >= threshold;
    case 'LT':
      return value < threshold;
    case 'LE':
      return value <= threshold;
    case 'EQ':
      return value === threshold;
    case 'BETWEEN':
      return thresholdMax !== null && value >= threshold && value <= thresholdMax;
    default:
      return false;
  }
}

export function intensityScore(value: number, rule: HazardDetectionRule): number {
  if (rule.operator === 'BETWEEN' && rule.thresholdMax !== null) {
    const distanceLower = Math.max(0, value - rule.threshold);
    const distanceUpper = Math.max(0, rule.thresholdMax - value);
    const excess = Math.max(distanceLower, distanceUpper);
    const span = Math.max(routeSpan(rule), 1);
    return clampScore(Math.round((excess / span) * 100));
  }

  if (rule.operator === 'GT' || rule.operator === 'GE' || rule.operator === 'EQ') {
    const base = Math.abs(rule.threshold) > 0 ? Math.abs(rule.threshold) : 1;
    return clampScore(Math.round((Math.max(0, value - rule.threshold) / base) * 100));
  }

  if (rule.operator === 'LT' || rule.operator === 'LE') {
    const base = Math.abs(rule.threshold) > 0 ? Math.abs(rule.threshold) : 1;
    return clampScore(Math.round((Math.max(0, rule.threshold - value) / base) * 100));
  }

  return 0;
}

function routeSpan(rule: HazardDetectionRule): number {
  const lower = Math.abs(rule.threshold);
  const upper = Math.abs(rule.thresholdMax ?? rule.threshold);
  return Math.max(lower, upper, 1) * 2;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function severityForScore(
  severityRules: { level: SeverityLevel; min: number }[],
  score: number,
): SeverityLevel {
  const ordered = [...severityRules].sort((a, b) => a.min - b.min);
  let level: SeverityLevel = 'FAIBLE';
  for (const rule of ordered) {
    if (score >= rule.min) level = rule.level;
  }
  return level;
}

export function detectionKeyFor(hazardType: string, geoKey: string): string {
  return `${hazardType}:${geoKey}`;
}

const HAZARD_SHORT: Record<string, string> = {
  CYCLONE: 'CYCL',
  INONDATION: 'INON',
  SECHERESSE: 'SECH',
  FORTE_PLUIE: 'FPLU',
  VENT_VIOLENT: 'VENT',
  GLISSEMENT_TERRAIN: 'GLIS',
  FEU_VEGETATION: 'FEUV',
  VAGUE_DE_CHALEUR: 'VCHA',
  AUTRE: 'AUTR',
};

export function hazardShortCode(hazardType: string): string {
  return HAZARD_SHORT[hazardType] ?? 'AUTR';
}

export function frenchHazardName(hazardType: string): string {
  const names: Record<string, string> = {
    CYCLONE: 'Cyclone',
    INONDATION: 'Inondation',
    SECHERESSE: 'Sécheresse',
    FORTE_PLUIE: 'Forte pluie',
    VENT_VIOLENT: 'Vent violent',
    GLISSEMENT_TERRAIN: 'Glissement de terrain',
    FEU_VEGETATION: 'Feu de végétation',
    VAGUE_DE_CHALEUR: 'Vague de chaleur',
    AUTRE: 'Événement météo',
  };
  return names[hazardType] ?? hazardType;
}

export function eventCodeFor(hazardType: string, geoKey: string, now: Date): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const geoShort = geoKey.slice(-8).toUpperCase();
  const stamp = now.getTime().toString(36).slice(-4).toUpperCase();
  return `${hazardShortCode(hazardType)}_${ymd}_${geoShort}_${stamp}`;
}

export function eventNameFor(hazardType: string, scopeLabel: string, isPrevision: boolean): string {
  const base = `${frenchHazardName(hazardType)} — ${scopeLabel}`;
  return isPrevision ? `${base} (prévision)` : base;
}
