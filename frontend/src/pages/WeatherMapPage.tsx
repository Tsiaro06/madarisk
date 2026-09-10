import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Settings2, X } from "lucide-react";
import { territoriesApi, weatherApi } from "@/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { WeatherMap } from "@/components/weather/WeatherMap";
import { WeatherControls } from "@/components/weather/WeatherControls";
import {
  WeatherCommuneDetailsPanel,
  type SelectedCommune,
} from "@/components/weather/WeatherCommuneDetailsPanel";
import { useWeatherMapLayer } from "@/hooks/useWeatherMapLayer";
import { canManageOps } from "@/lib/roles";
import { addDaysToToday, todayISO } from "@/services/weather.service";
import { useAuthStore } from "@/stores/authStore";
import type { WeatherMetric } from "@/types/weather";
import type { FeatureCollection } from "geojson";

export function WeatherMapPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const canRefresh = canManageOps(role);
  const [metric, setMetric] = useState<WeatherMetric>("precipitation");
  const [date, setDate] = useState<string>(todayISO());
  const [hour, setHour] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);

  const districtsQ = useQuery({
    queryKey: ["weather", "districts"],
    queryFn: async () => {
      const [p1, p2] = await Promise.all([
        territoriesApi.districts({ page: 1, limit: 100 }),
        territoriesApi.districts({ page: 2, limit: 100 }),
      ]);
      return [...p1.data, ...p2.data];
    },
    staleTime: 60_000,
  });

  const communesQ = useQuery({
    queryKey: ["weather", "communes", "map", districtId ?? ""],
    queryFn: () => territoriesApi.mapCommunes(districtId ? { districtId } : {}),
    staleTime: 60_000,
  });

  const weather = useWeatherMapLayer({ metric, date, hour, districtId });

  const selectedFeature = useMemo(() => {
    if (!selectedId || !communesQ.data) return null;
    return (
      communesQ.data.features.find((f) => {
        const p = f.properties as Record<string, unknown> | null;
        return p?.communeId === selectedId;
      }) ?? null
    );
  }, [selectedId, communesQ.data]);

  const selectedCommune: SelectedCommune | null = useMemo(() => {
    if (!selectedFeature) return null;
    const p = (selectedFeature.properties ?? {}) as Record<string, unknown>;
    return {
      id: String(p.communeId),
      adminCode: String(p.communeCode ?? ""),
      name: String(p.commune ?? p.communeName ?? "Commune"),
      districtName: String(p.district ?? ""),
    };
  }, [selectedFeature]);

  const selectedPoint = selectedId
    ? (weather.pointByCommune.get(selectedId) ?? null)
    : null;

  const districtOptions = useMemo(
    () =>
      (districtsQ.data ?? []).map((d) => ({
        value: d.id,
        label: d.name,
      })),
    [districtsQ.data],
  );

  const maxDate = addDaysToToday(3);

  const futureDate = date > todayISO();
  const hourForecastView = futureDate || (date === todayISO() && hour != null);

  const forecastUnavailable =
    hourForecastView &&
    !weather.query.isLoading &&
    weather.layer !== null &&
    weather.layer.features.length === 0;

  const layerHadNoData = useRef(true);
  useEffect(() => {
    const nowHasData = (weather.layer?.features?.length ?? 0) > 0;
    if (hourForecastView && nowHasData && layerHadNoData.current) {
      void qc.invalidateQueries({ queryKey: ["weather", "forecast"] });
    }
    layerHadNoData.current = !nowHasData;
  }, [hourForecastView, weather.layer?.features?.length, qc]);

  const communesData = communesQ.data as FeatureCollection | null;

  const selectCommune = (id: string) => {
    setSelectedId(id);
    setMobileDetails(true);
  };

  const handleRefresh = async () => {
    if (refreshing || !canRefresh) return;
    const districts = districtsQ.data ?? [];
    if (!districtId && districts.length === 0) {
      toast(
        "Liste des districts non chargée — réessayez dans un instant.",
        "error",
      );
      return;
    }
    setRefreshing(true);
    setRefreshProgress(null);
    let ok = 0;
    let failed = 0;
    try {
      if (districtId) {
        setRefreshProgress("Rafraîchissement du district…");
        await weatherApi.refresh({ districtId });
        ok = 1;
      } else {
        for (const d of districts) {
          setRefreshProgress(
            `District ${ok + failed + 1}/${districts.length}…`,
          );
          try {
            await weatherApi.refresh({ districtId: d.id });
            ok += 1;
          } catch {
            failed += 1;
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ["weather", "map-layer"] });
      toast(
        failed > 0
          ? `Rafraîchissement terminé : ${ok} district(s) à jour, ${failed} en échec.`
          : "Rafraîchissement des données météo terminé.",
        ok > 0 ? "success" : "error",
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Échec du rafraîchissement météo.",
        "error",
      );
    } finally {
      setRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const controls = (
    <WeatherControls
      metric={metric}
      date={date}
      hour={hour}
      districtId={districtId}
      districts={districtOptions}
      maxDate={maxDate}
      onMetricChange={setMetric}
      onDateChange={setDate}
      onHourChange={setHour}
      onDistrictChange={(id) => {
        setDistrictId(id);
        setSelectedId(null);
      }}
      canRefresh={canRefresh}
      isRefreshing={refreshing}
      refreshProgress={refreshProgress}
      onRefresh={handleRefresh}
    />
  );

  const detailsPanel = (
    <WeatherCommuneDetailsPanel
      commune={selectedCommune}
      point={selectedPoint}
      layerLoading={weather.query.isLoading}
      metric={metric}
      date={date}
      hour={hour}
      onClose={mobileDetails ? () => setMobileDetails(false) : undefined}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-brand/10 bg-white/80 px-3 backdrop-blur sm:px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/")}
          className="shrink-0"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Retour au dashboard</span>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg text-ink">Météo</h1>
          <p className="hidden truncate text-xs text-muted sm:block">
            Observations et prévisions par commune — indépendant des événements
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-2 lg:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileFilters((v) => !v)}
          >
            <Settings2 className="size-4" /> Filtres
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileDetails((v) => !v)}
          >
            <Info className="size-4" /> Détails
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-brand/10 bg-canvas p-3 lg:block">
          <Card title="Filtres">{controls}</Card>
        </aside>

        <main className="relative min-w-0 flex-1">
          {communesQ.isLoading && !communesQ.data ? (
            <div className="grid h-full place-items-center">
              <Spinner label="Chargement de la carte…" />
            </div>
          ) : (
            <WeatherMap
              communes={communesData}
              pointByCommune={weather.pointByCommune}
              metric={metric}
              selectedCommuneId={selectedId}
              onSelectCommune={selectCommune}
            />
          )}

          {forecastUnavailable ? (
            <div className="absolute left-1/2 top-3 z-30 w-[min(26rem,90vw)] -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-sm text-amber-800 shadow-sm">
              Prévisions momentanément indisponibles : la limite de requêtes
              Open-Meteo est atteinte. Réessai automatique quelques minutes.
            </div>
          ) : null}

          {mobileFilters ? (
            <div
              className="absolute inset-0 z-40 flex justify-start bg-black/30 lg:hidden"
              onClick={() => setMobileFilters(false)}
            >
              <div
                className="h-full w-[min(22rem,92vw)] overflow-y-auto bg-canvas p-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileFilters(false)}
                    aria-label="Fermer les filtres"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <Card title="Filtres">{controls}</Card>
              </div>
            </div>
          ) : null}

          {mobileDetails ? (
            <div
              className="absolute inset-0 z-40 flex justify-end bg-black/30 lg:hidden"
              onClick={() => setMobileDetails(false)}
            >
              <div
                className="h-full w-[min(26rem,92vw)] overflow-y-auto rounded-l-xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {detailsPanel}
              </div>
            </div>
          ) : null}
        </main>

        <aside className="hidden w-[24rem] shrink-0 overflow-y-auto border-l border-brand/10 bg-canvas p-3 lg:block">
          {detailsPanel}
        </aside>
      </div>
    </div>
  );
}
