import type { PathOptions } from "leaflet";
import type { WeatherForecastData, WeatherObservation } from "@/types";
import {
  getWeatherColor,
  NO_DATA_BORDER,
  NO_DATA_COLOR,
  SELECTED_BORDER,
  WEATHER_METRICS_ORDER,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
  type WeatherViewMode,
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
      className: "madarisk-commune-pulse",
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

/**
 * Instant UTC correspondant à (date, heure) en heure de Madagascar (UTC+3).
 * Le backend stocke `weather_hourly.hour_at` en UTC : une heure de prévision
 * saisie dans le sélecteur doit être comparée à `hourAt`, pas à l'heure locale.
 */
export function toUtcHourAt(dateISO: string, hour: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 3)).toISOString();
}

/**
 * Vrai si l'heure de la série est encore à venir.
 *
 * `isForecast` est figé au moment de l'écriture de la série : un run de 6 h y
 * classe en « prévision » toutes les heures de 6 h à 12 h, et rien ne les
 * réécrit avant le run suivant (toutes les 6 h). Lu tel quel à 8 h, le drapeau
 * dirait encore « prévision » pour des heures écoulées — le pointillé et le
 * libellé « Prévision » seraient alors faux. On le confronte donc à
 * l'horloge du navigateur, qui est la seule source à jour entre deux runs.
 */
export function isFutureHour(hourAt: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(hourAt);
  return Number.isFinite(t) ? t > nowMs : false;
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

export interface ObservationFreshness {
  /** Jour local de la donnée servie, ou `null` si inconnu / prévision. */
  dataDay: string | null;
  /** Vrai si la donnée servie provient bien du jour consulté. */
  isCurrentDay: boolean;
  /**
   * Vrai si la carte « aujourd'hui » affiche en réalité une journée antérieure
   * (la synchronisation du jour n'a pas eu lieu). C'est le cas à signaler
   * franchement : la carte n'est pas vide, donc rien ne semble anormal.
   */
  isBehind: boolean;
}

/**
 * Fraîcheur de la couche d'observation servie pour une date consultée.
 *
 * La page ouvre sur « aujourd'hui » et sert la dernière observation
 * disponible : sans synchronisation le jour même, cet « aujourd'hui » contient
 * en réalité la veille. Comparer le jour effectif de la donnée (`dataDay`,
 * calculé par le backend en heure de Madagascar) à la date consultée permet de
 * l'annoncer explicitement plutôt que de laisser croire à de la donnée du jour.
 *
 * `mode` restreint la lecture : en prévision ou en historique volontaire, il n'y
 * a pas de « retard » à signaler.
 */
export function getObservationFreshness(input: {
  consultedDate: string;
  dataDay: string | null;
  mode: WeatherViewMode;
  today?: string;
}): ObservationFreshness {
  const today = input.today ?? todayISO();
  const dataDay = input.dataDay ?? null;

  if (input.mode !== "OBSERVATION" || dataDay === null) {
    return { dataDay, isCurrentDay: false, isBehind: false };
  }

  const isCurrentDay = dataDay === input.consultedDate;
  const isToday = input.consultedDate === today;

  return {
    dataDay,
    isCurrentDay,
    isBehind: isToday && !isCurrentDay,
  };
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

export function buildHistorySeries(
  observations: WeatherObservation[],
  metric: WeatherMetric,
): WeatherForecastPoint[] {
  const cfg = WEATHER_METRIC_CONFIGS[metric];
  const key = cfg.property;
  return observations
    .filter((obs) => Number.isFinite(obs[key] as number))
    .map((obs) => ({ time: obs.observedAt, value: obs[key] as number }));
}

export function getWeatherViewMode(
  date: string,
  hour: number | null,
  today = todayISO(),
): WeatherViewMode {
  if (date > today) return "PREVISION";
  if (date === today && hour != null) return "PREVISION";
  if (date === today) return "OBSERVATION";
  return "HISTORIQUE";
}

export function formatShortDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function formatForecastTick(time: unknown): string {
  const d = new Date(String(time));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h`;
}
