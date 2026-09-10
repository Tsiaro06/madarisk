import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import {
  addDaysToToday,
  formatShortDate,
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
  const shortcuts = [1, 3].map((days) => ({
    days,
    label: `+${days} jour${days > 1 ? "s" : ""}`,
    value: addDaysToToday(days, today),
  }));

  const [dateText, setDateText] = useState(() => isoToFrench(date));

  useEffect(() => {
    setDateText(isoToFrench(date));
  }, [date]);

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
          type="text"
          inputMode="numeric"
          label="Date"
          value={dateText}
          maxLength={10}
          placeholder="JJ/MM/AAAA"
          onChange={(e) => {
            const masked = maskFrenchDate(e.target.value);
            setDateText(masked);
            const iso = frenchToISO(masked);
            if (iso) onDateChange(iso);
          }}
          onBlur={() => {
            const iso = frenchToISO(dateText);
            if (iso && maxDate && iso > maxDate) {
              setDateText(isoToFrench(date));
              return;
            }
            setDateText(iso ? isoToFrench(iso) : isoToFrench(date));
          }}
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoToFrench(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function maskFrenchDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function frenchToISO(fr: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr ?? "");
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}
