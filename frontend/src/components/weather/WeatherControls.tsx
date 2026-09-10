import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import {
  addDaysToToday,
  HOUR_OPTIONS,
  isAfterMax,
  todayISO,
  WEATHER_METRIC_OPTIONS,
} from "@/services/weather.service";
import type { WeatherMetric } from "@/types/weather";

interface DistrictOption {
  value: string;
  label: string;
}

interface WeatherControlsProps {
  metric: WeatherMetric;
  date: string;
  hour: number | null;
  districtId: string;
  districts: DistrictOption[];
  maxDate: string | null;
  onMetricChange: (metric: WeatherMetric) => void;
  onDateChange: (date: string) => void;
  onHourChange: (hour: number | null) => void;
  onDistrictChange: (districtId: string) => void;
  canRefresh: boolean;
  isRefreshing: boolean;
  refreshProgress: string | null;
  onRefresh: () => void;
}

export function WeatherControls({
  metric,
  date,
  hour,
  districtId,
  districts,
  maxDate,
  onMetricChange,
  onDateChange,
  onHourChange,
  onDistrictChange,
  canRefresh,
  isRefreshing,
  refreshProgress,
  onRefresh,
}: WeatherControlsProps) {
  const today = todayISO();
  const shortcuts = [1, 3, 7].map((days) => ({
    days,
    label: `+${days} jour${days > 1 ? "s" : ""}`,
    value: addDaysToToday(days, today),
  }));

  return (
    <div className="space-y-4">
      <Select
        label="Indicateur météo"
        value={metric}
        onChange={(e) => onMetricChange(e.target.value as WeatherMetric)}
        options={WEATHER_METRIC_OPTIONS}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          type="date"
          label="Date"
          value={date}
          max={maxDate ?? undefined}
          onChange={(e) => onDateChange(e.target.value)}
        />
        <Select
          label="Heure"
          value={hour != null ? String(hour) : ""}
          onChange={(e) =>
            onHourChange(e.target.value ? Number(e.target.value) : null)
          }
          options={HOUR_OPTIONS}
          placeholder="Toute la journée"
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Raccourcis</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isAfterMax(today, maxDate)}
            onClick={() => onDateChange(today)}
          >
            Aujourd’hui
          </Button>
          {shortcuts.map((s) => (
            <Button
              key={s.days}
              variant="outline"
              size="sm"
              disabled={isAfterMax(s.value, maxDate)}
              onClick={() => onDateChange(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
        {maxDate ? (
          <p className="mt-1.5 text-xs text-muted">
            Données disponibles jusqu’au {formatShortDate(maxDate)}.
          </p>
        ) : null}
      </div>

      <Select
        label="District"
        value={districtId}
        onChange={(e) => onDistrictChange(e.target.value)}
        options={districts}
        placeholder="Tous les districts"
      />

      {canRefresh ? (
        <div className="border-t border-brand/10 pt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
            {isRefreshing
              ? "Rafraîchissement…"
              : districtId
                ? "Rafraîchir ce district"
                : "Rafraîchir tout le pays"}
          </Button>
          <p className="mt-1.5 text-xs text-muted">
            {refreshProgress ??
              "Synchronise les observations récentes (Open-Meteo) pour toutes les communes."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function formatShortDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
