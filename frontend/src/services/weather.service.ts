import type { PathOptions } from "leaflet";
import type { WeatherForecastData } from "@/types";
import {
  getWeatherColor,
  NO_DATA_BORDER,
  NO_DATA_COLOR,
  SELECTED_BORDER,
  WEATHER_METRICS_ORDER,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
} from "@/types/weather";

export { getWeatherValue } from "@/types/weather";

export const WEATHER_METRIC_OPTIONS = WEATHER_METRICS_ORDER.map((metric) => ({
  value: metric,
  label: `${WEATHER_METRIC_CONFIGS[metric].label} (${WEATHER_METRIC_CONFIGS[metric].unit})`,
}));

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}h`,
}));

export function getWeatherStyle(
  metric: WeatherMetric,
  value: number | null,
  isSelected: boolean,
): PathOptions {
  if (isSelected) {
    return {
      color: SELECTED_BORDER,
      weight: 3,
      fillColor: getWeatherColor(metric, value),
      fillOpacity: 0.85,
    };
  }
  if (value == null) {
    return {
      color: NO_DATA_BORDER,
      weight: 1,
      fillColor: NO_DATA_COLOR,
      fillOpacity: 0.45,
    };
  }
  return {
    color: "#334155",
    weight: 1,
    fillColor: getWeatherColor(metric, value),
    fillOpacity: 0.75,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysToISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function addDaysToToday(days: number, from = todayISO()): string {
  return addDaysToISO(from, days);
}

export function dateMaxFromLatest(
  latestObservationAt: string | null,
): string | null {
  if (!latestObservationAt) return null;
  return toISODate(new Date(latestObservationAt));
}

export function isAfterMax(dateISO: string, maxISO: string | null): boolean {
  return maxISO != null && dateISO > maxISO;
}

export interface WeatherForecastPoint {
  time: string;
  value: number | null;
}

export function buildForecastSeries(
  forecast: WeatherForecastData,
  metric: WeatherMetric,
): WeatherForecastPoint[] {
  const cfg = WEATHER_METRIC_CONFIGS[metric];
  const values = forecast.hourly[cfg.forecastProperty] ?? [];
  return forecast.hourly.time.map((time, i) => ({
    time,
    value: values[i] ?? null,
  }));
}

export function formatShortDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function formatForecastTick(time: unknown): string {
  const d = new Date(String(time));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h`;
}
