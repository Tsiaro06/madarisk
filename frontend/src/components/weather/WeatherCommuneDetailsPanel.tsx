import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { weatherApi } from "@/api";
import { ApiClientError } from "@/api/client";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import {
  addDaysToISO,
  buildForecastSeries,
  buildHistorySeries,
  formatForecastTick,
  formatShortDate,
  getWeatherValue,
  toUtcHourAt,
  isFutureHour,
} from "@/services/weather.service";
import { formatDate } from "@/lib/utils";
import {
  formatWeatherValue,
  WEATHER_METRICS_ORDER,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
  type WeatherViewMode,
} from "@/types/weather";
import type { WeatherMapFeatureProperties } from "@/types";
import { WeatherModeBadge } from "./WeatherModeBadge";

export interface SelectedCommune {
  id: string;
  adminCode: string;
  name: string;
  districtName: string;
}

interface WeatherCommuneDetailsPanelProps {
  commune: SelectedCommune | null;
  point: WeatherMapFeatureProperties | null;
  layerLoading: boolean;
  metric: WeatherMetric;
  mode: WeatherViewMode;
  date: string;
  hour: number | null;
  lastDataAt: string | null;
  lastSyncAt: string | null;
  onClose?: () => void;
}

function isServiceUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiClientError && (err.status === 502 || err.status === 503)
  );
}

function isRateLimited(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 429;
}

export function WeatherCommuneDetailsPanel({
  commune,
  point,
  layerLoading,
  metric,
  mode,
  date,
  hour,
  lastDataAt,
  lastSyncAt,
  onClose,
}: WeatherCommuneDetailsPanelProps) {
  const isHistory = mode === "HISTORIQUE";

  // Série horaire stockée (weather_hourly) : la seule source qui couvre à la
  // fois les heures PASSÉES (réanalyse) et les prochaines (prévision). Elle
  // remplace la courbe de prévisions live, qui ne commence qu'à « maintenant ».
  const hourlyQ = useQuery({
    queryKey: ["weather", "hourly", commune?.id],
    queryFn: () => (commune ? weatherApi.hourly(commune.id) : null),
    enabled: Boolean(commune),
    staleTime: 60_000,
  });

  // Mémoïsé : les deux useMemo ci-dessous l'utilisent comme dépendance, sinon
  // `hourlyQ.data ?? []` produirait un nouveau tableau à chaque rendu et
  // invaliderait la courbe en boucle.
  const hourlySeries = useMemo(() => hourlyQ.data ?? [], [hourlyQ.data]);

  const forecastQ = useQuery({
    queryKey: ["weather", "forecast", commune?.id],
    queryFn: () => (commune ? weatherApi.forecast(commune.id) : null),
    enabled: Boolean(commune) && !isHistory,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    refetchInterval: (q) =>
      !isHistory && q.state.status === "error" && isRateLimited(q.state.error)
        ? 60_000
        : false,
  });

  const historyQ = useQuery({
    queryKey: ["weather", "history", commune?.id, date],
    queryFn: () =>
      commune
        ? weatherApi.history(commune.id, {
            dateFrom: addDaysToISO(date, -6),
            dateTo: addDaysToISO(date, 1),
            page: 1,
            limit: 50,
          })
        : null,
    enabled: Boolean(commune) && isHistory,
  });

  const displayDate = date ? formatShortDate(date) : "—";
  const displayHour =
    hour != null ? `${String(hour).padStart(2, "0")}h` : "Toute la journée";

  const config = WEATHER_METRIC_CONFIGS[metric];

  // Un seul tracé mélange le passé et le futur : `observed` ne porte que les
  // heures déjà écoulées (trait plein) et `forecast` que les heures à venir
  // (pointillé). Recharts ne colorant pas chaque point d'une ligne unique,
  // on projette les deux séries sur la même chronologie.
  //
  // Le découpage passé/futur vient de `isFutureHour` (comparaison à
  // l'horloge), pas de `isForecast` : ce drapeau est figé à l'écriture de la
  // série, donc entre deux runs de 6 h il classe en « prévision » des heures
  // qui sont déjà écoulées.
  const hourlyChart = useMemo(() => {
    const key = config.property;
    return hourlySeries
      .filter((p) => typeof p[key] === "number" && Number.isFinite(p[key]))
      .map((p) => {
        const future = isFutureHour(p.hourAt);
        return {
          time: p.hourAt,
          observed: future ? null : (p[key] as number),
          forecast: future ? (p[key] as number) : null,
          value: p[key] as number,
        };
      });
  }, [hourlySeries, config.property]);

  const chartData = hourlyChart.length > 0
    ? hourlyChart
    : isHistory
      ? buildHistorySeries(historyQ.data?.data ?? [], metric)
      : forecastQ.data
        ? buildForecastSeries(forecastQ.data, metric)
        : [];

  // Valeur à l'heure sélectionnée, lue dans la série horaire : c'est elle qui
  // rend les heures passées consultables (l'API de prévisions ne les contient
  // pas). `hourAt` est en UTC, la saisie est en heure Madagascar.
  const selectedHourPoint = useMemo(() => {
    if (hour == null) return null;
    const target = toUtcHourAt(date, hour);
    return hourlySeries.find((p) => p.hourAt === target) ?? null;
  }, [date, hour, hourlySeries]);

  const selectedHourValue = selectedHourPoint
    ? (selectedHourPoint[config.property] as number | null)
    : isHistory || hour == null || !forecastQ.data
      ? null
      : (() => {
          const cfg = WEATHER_METRIC_CONFIGS[metric];
          const values = forecastQ.data.hourly[cfg.forecastProperty] ?? [];
          const targetPrefix = `${date}T${String(hour).padStart(2, "0")}:`;
          const idx = forecastQ.data.hourly.time.findIndex((t) =>
            t.startsWith(targetPrefix),
          );
          const value = idx >= 0 ? values[idx] : null;
          return typeof value === "number" && Number.isFinite(value) ? value : null;
        })();

  const mainValue =
    hour != null
      ? (selectedHourValue ?? getWeatherValue(point, metric))
      : getWeatherValue(point, metric);

  if (!commune) {
    return (
      <EmptyState
        title="Aucune commune sélectionnée"
        description="Cliquez sur une commune de la carte pour consulter sa météo."
        className="m-3"
      />
    );
  }

  return (
    <div className="space-y-3 p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg text-ink">
              {commune.name}
            </h2>
            <WeatherModeBadge mode={mode} />
          </div>
          {commune.adminCode || commune.districtName ? (
            <p className="text-xs text-muted">
              {[commune.adminCode, commune.districtName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      <p className="text-sm text-muted">
        {displayDate} · {displayHour}
      </p>

      {layerLoading ? (
        <Spinner label="Chargement des données météo…" />
      ) : (
        <>
          <Card className="!p-4">
            <p className="text-xs text-muted">
              {selectedHourPoint
                ? isFutureHour(selectedHourPoint.hourAt)
                  ? `${config.label} prévu à ${displayHour}`
                  : `${config.label} observé à ${displayHour}`
                : isHistory
                  ? `${config.label} observé autour de cette date`
                  : hour != null
                    ? `${config.label} prévu à ${displayHour}`
                    : `${config.label} sélectionné`}
            </p>
            <p className="font-display text-3xl text-ink">
              {formatWeatherValue(metric, mainValue)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {selectedHourPoint
                ? `${isFutureHour(selectedHourPoint.hourAt) ? "Prévision" : "Analyse"} du ${displayDate} · ${displayHour}`
                : !isHistory && hour != null && selectedHourValue != null
                  ? `Prévision du ${displayDate} · ${displayHour}`
                  : point?.observedAt
                    ? `Actualisé le ${formatDate(point.observedAt)}`
                    : "Aucune donnée pour cette commune"}
            </p>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-muted">
              <p>
                <span className="font-medium text-ink">Date de donnée :</span>{" "}
                {point?.observedAt
                  ? formatDate(point.observedAt)
                  : lastDataAt
                    ? formatDate(lastDataAt)
                    : "—"}
              </p>
              <p>
                <span className="font-medium text-ink">
                  Dernière synchronisation :
                </span>{" "}
                {lastSyncAt ? formatDate(lastSyncAt) : "—"}
              </p>
            </div>
          </Card>

          <Card title="Toutes les métriques" className="!p-4">
            <div className="grid grid-cols-2 gap-3">
              {WEATHER_METRICS_ORDER.map((m) => (
                <div key={m} className="rounded-lg bg-brand-soft p-2.5">
                  <p className="text-[11px] text-muted">
                    {WEATHER_METRIC_CONFIGS[m].label}
                  </p>
                  <p className="font-display text-base text-ink">
                    {formatWeatherValue(m, getWeatherValue(point, m))}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title={
              hourlyChart.length > 0
                ? `Météo par heure — ${config.label}`
                : isHistory
                  ? `Historique — ${config.label}`
                  : `Prévisions — ${config.label}`
            }
            description={
              hourlyChart.length > 0
                ? `Relevés horaires, en ${config.unit}`
                : isHistory
                  ? `Observations enregistrées autour du ${displayDate}, en ${config.unit}`
                  : `Prévisions horaires, en ${config.unit}`
            }
            className="!p-4"
          >
            {hourlyChart.length > 0 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={hourlyChart}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={formatForecastTick}
                      tick={{ fontSize: 10 }}
                      minTickGap={32}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(value) => [
                        `${String(value)} ${config.unit}`,
                        config.label,
                      ]}
                      labelFormatter={formatForecastTick}
                    />
                    <Line
                      type="monotone"
                      dataKey="observed"
                      name={`${config.label} observé`}
                      stroke="#03224c"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name={`${config.label} prévu`}
                      stroke="#0d9488"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-1 text-[11px] text-muted">
                  Trait plein : heures écoulées (analyse du modèle). Pointillé
                  vert : prévision.
                </p>
              </div>
            ) : isHistory ? (
              historyQ.isLoading ? (
                <Spinner label="Chargement de l'historique…" />
              ) : historyQ.isError ? (
                <EmptyState
                  title="Historique indisponible"
                  description={
                    historyQ.error instanceof Error
                      ? historyQ.error.message
                      : "Échec du chargement des observations passées."
                  }
                />
              ) : chartData.length === 0 ? (
                <EmptyState
                  title="Aucune observation pour cette période"
                  description="Aucune donnée d’observation n’est enregistrée autour de cette date pour cette commune."
                />
              ) : (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={formatForecastTick}
                        tick={{ fontSize: 10 }}
                        minTickGap={32}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={52} />
                      <Tooltip
                        formatter={(value) => [
                          `${String(value)} ${config.unit}`,
                          config.label,
                        ]}
                        labelFormatter={formatForecastTick}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={config.label}
                        stroke="#03224c"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : forecastQ.isLoading ? (
              <Spinner label="Chargement des prévisions…" />
            ) : forecastQ.isError ? (
              <EmptyState
                title={
                  isRateLimited(forecastQ.error) ||
                  isServiceUnavailable(forecastQ.error)
                    ? "Prévisions indisponibles"
                    : "Erreur de chargement"
                }
                description={
                  isRateLimited(forecastQ.error)
                    ? "La limite de requêtes est atteinte. Réessayez dans environ une heure."
                    : isServiceUnavailable(forecastQ.error)
                      ? "Les prévisions ne répondent pas actuellement. Réessayez plus tard."
                      : forecastQ.error instanceof Error
                        ? forecastQ.error.message
                        : "Vérifiez votre connexion."
                }
              />
            ) : chartData.length === 0 ? (
              <EmptyState title="Aucune prévision disponible" />
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={formatForecastTick}
                      tick={{ fontSize: 10 }}
                      minTickGap={32}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(value) => [
                        `${String(value)} ${config.unit}`,
                        config.label,
                      ]}
                      labelFormatter={formatForecastTick}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={config.label}
                      stroke="#03224c"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
