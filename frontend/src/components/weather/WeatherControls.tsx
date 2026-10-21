import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn, formatDate, syncRunStatusLabel } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  addDaysToToday,
  formatShortDate,
  getObservationFreshness,
  HOUR_OPTIONS,
  isAfterMax,
  todayISO,
  WEATHER_METRIC_OPTIONS,
} from "@/services/weather.service";
import type { WeatherMetric, WeatherViewMode } from "@/types/weather";
import { WeatherModeBadge } from "./WeatherModeBadge";
import { AdministrativeInterventionPanel } from "@/components/admin/AdministrativeInterventionPanel";

interface DistrictOption {
  value: string;
  label: string;
}

interface WeatherControlsProps {
  metric: WeatherMetric;
  date: string;
  hour: number | null;
  mode: WeatherViewMode;
  districtId: string;
  districts: DistrictOption[];
  maxDate: string | null;
  lastDataAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus?: string | null;
  /** Jour local de la donnée réellement servie pour la date consultée. */
  dataDay?: string | null;
  /** L'utilisateur peut relancer une synchronisation (ADMIN / SUPER_ADMIN). */
  canRefresh?: boolean;
  onMetricChange: (metric: WeatherMetric) => void;
  onDateChange: (date: string) => void;
  onHourChange: (hour: number | null) => void;
  onDistrictChange: (districtId: string) => void;
  isRefreshing: boolean;
  refreshProgress: string | null;
  onRefresh: () => void;
}

export function WeatherControls({
  metric,
  date,
  hour,
  mode,
  districtId,
  districts,
  maxDate,
  lastDataAt,
  lastSyncAt,
  lastSyncStatus,
  dataDay = null,
  canRefresh = false,
  onMetricChange,
  onDateChange,
  onHourChange,
  onDistrictChange,
  isRefreshing,
  refreshProgress,
  onRefresh,
}: WeatherControlsProps) {
  const today = todayISO();
  const freshness = getObservationFreshness({ consultedDate: date, dataDay, mode });
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

      <div className="rounded-lg bg-brand-soft/60 px-3 py-2.5">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">
          Période consultée
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">
            {date ? formatShortDate(date) : "—"}
            {hour != null ? ` · ${String(hour).padStart(2, "0")}h` : ""}
          </span>
          <WeatherModeBadge mode={mode} />
        </div>
      </div>

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

      <div className="space-y-1.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-muted">
        <p>
          <span className="font-medium text-ink">Date des données :</span>{" "}
          {lastDataAt ? formatDate(lastDataAt) : "—"}
        </p>
        {freshness.dataDay && mode === "OBSERVATION" ? (
          <p>
            <span className="font-medium text-ink">Jour affiché :</span>{" "}
            {formatShortDate(freshness.dataDay)}
            {freshness.isCurrentDay ? " (à jour)" : ""}
          </p>
        ) : null}
        <p>
          <span className="font-medium text-ink">Synchronisation :</span>{" "}
          {lastSyncAt
            ? `${formatDate(lastSyncAt)}${
                syncRunStatusLabel(lastSyncStatus)
                  ? ` (${syncRunStatusLabel(lastSyncStatus)})`
                  : ""
              }`
            : "—"}
        </p>
      </div>

      {freshness.isBehind ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-medium">
              La carte n’affiche pas encore la météo d’aujourd’hui.
            </p>
            <p className="mt-0.5">
              Les données les plus récentes datent du{" "}
              {formatShortDate(freshness.dataDay ?? date)}. La synchronisation du
              jour n’a pas encore eu lieu
              {canRefresh
                ? " — relancez-la ci-dessous pour obtenir la météo du jour."
                : "."}
            </p>
          </div>
        </div>
      ) : null}

      <AdministrativeInterventionPanel compact>
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
            ? "Relance…"
            : districtId
              ? "Relancer la synchronisation de ce district"
              : "Relancer la synchronisation nationale"}
        </Button>
        <p className="mt-1.5 text-xs text-muted">
          {refreshProgress ??
            "Synchronise les observations récentes pour toutes les communes."}
        </p>
      </AdministrativeInterventionPanel>
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
