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
  buildForecastSeries,
  formatForecastTick,
  getWeatherValue,
} from "@/services/weather.service";
import { formatDate } from "@/lib/utils";
import {
  formatWeatherValue,
  WEATHER_METRICS_ORDER,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
} from "@/types/weather";
import type { WeatherMapFeatureProperties } from "@/types";

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
  date: string;
  hour: number | null;
  onClose?: () => void;
}

function isServiceUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiClientError && (err.status === 502 || err.status === 503)
  );
}

export function WeatherCommuneDetailsPanel({
  commune,
  point,
  layerLoading,
  metric,
  date,
  hour,
  onClose,
}: WeatherCommuneDetailsPanelProps) {
  const forecastQ = useQuery({
    queryKey: ["weather", "forecast", commune?.id],
    queryFn: () => (commune ? weatherApi.forecast(commune.id) : null),
    enabled: Boolean(commune),
  });

  const displayDate = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";
  const displayHour =
    hour != null ? `${String(hour).padStart(2, "0")}h` : "Toute la journée";

  const mainValue = getWeatherValue(point, metric);
  const config = WEATHER_METRIC_CONFIGS[metric];

  if (!commune) {
    return (
      <EmptyState
        title="Aucune commune sélectionnée"
        description="Cliquez sur une commune de la carte pour consulter sa météo."
        className="m-3"
      />
    );
  }

  const chartData = forecastQ.data
    ? buildForecastSeries(forecastQ.data, metric)
    : [];

  return (
    <div className="space-y-3 p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg text-ink">
            {commune.name}
          </h2>
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
            <p className="text-xs text-muted">{config.label} sélectionné</p>
            <p className="font-display text-3xl text-ink">
              {formatWeatherValue(metric, mainValue)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {point?.observedAt
                ? `Actualisé le ${formatDate(point.observedAt)}`
                : "Aucune observation"}
            </p>
            <p className="mt-0.5 text-xs text-muted">Source : Open-Meteo</p>
          </Card>

          <Card title="Toutes les métriques" className="!p-4">
            <div className="grid grid-cols-2 gap-3">
              {WEATHER_METRICS_ORDER.map((m) => (
                <div key={m} className="rounded-lg bg-brand-soft/60 p-2.5">
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
            title={`Prévisions — ${config.label}`}
            description={`Horaires Open-Meteo, en ${config.unit}`}
            className="!p-4"
          >
            {forecastQ.isLoading ? (
              <Spinner label="Chargement des prévisions…" />
            ) : forecastQ.isError ? (
              <EmptyState
                title={
                  isServiceUnavailable(forecastQ.error)
                    ? "Service météo indisponible"
                    : "Erreur de chargement"
                }
                description={
                  isServiceUnavailable(forecastQ.error)
                    ? "La source de prévisions ne répond pas actuellement. Réessayez plus tard."
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
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
                      stroke="#0a6b6e"
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
