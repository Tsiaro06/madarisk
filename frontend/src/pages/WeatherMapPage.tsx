import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Info, Settings2, X } from "lucide-react";
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
import { WeatherModeBadge } from "@/components/weather/WeatherModeBadge";
import { RefreshDataButton } from "@/components/ui/RefreshDataButton";
import { useWeatherMapLayer } from "@/hooks/useWeatherMapLayer";
import { AdministrativeActionConfirmDialog } from "@/components/ui/AdministrativeActionConfirmDialog";
import { canManageOps } from "@/lib/roles";
import {
  addDaysToToday,
  getWeatherViewMode,
  todayISO,
} from "@/services/weather.service";
import { useAuthStore } from "@/stores/authStore";
import type { WeatherMetric } from "@/types/weather";
import type { FeatureCollection } from "geojson";

export function WeatherMapPage() {
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
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant: 'warning' | 'destructive' | 'primary';
    actionLabel: string;
    onConfirm: () => void;
    contextLabel?: string;
    contextValue?: string;
  }>({ open: false, title: '', variant: 'warning', actionLabel: '', onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, open: false }));

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

  const monitoringQ = useQuery({
    queryKey: ["weather", "monitoring"],
    queryFn: () => weatherApi.monitoring(),
    staleTime: 60_000,
  });

  const weather = useWeatherMapLayer({ metric, date, hour, districtId });

  const mode = getWeatherViewMode(date, hour);

  const sourceName =
    monitoringQ.data?.sources.find((s) => s.isActive)?.name ??
    monitoringQ.data?.sources[0]?.name ??
    "Open-Meteo";
  const lastSyncAt = monitoringQ.data?.sync.observations.lastSuccessAt ?? null;
  const lastDataAt = weather.latestObservationAt ?? lastSyncAt;

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

  const layerEmpty =
    !weather.query.isLoading &&
    weather.layer !== null &&
    weather.layer.features.length === 0;

  const noDataForHistory = mode === "HISTORIQUE" && layerEmpty;
  const noDataForObservation =
    mode === "OBSERVATION" && layerEmpty && !forecastUnavailable;

  const staleHours =
    typeof lastSyncAt === "string"
      ? Math.max(0, Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 3_600_000))
      : null;

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
        setRefreshProgress("Synchronisation du district…");
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
          ? `Synchronisation terminée : ${ok} district(s) à jour, ${failed} en échec.`
          : "Synchronisation des données météo terminée.",
        ok > 0 ? "success" : "error",
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Échec de la synchronisation météo.",
        "error",
      );
    } finally {
      setRefreshing(false);
      setRefreshProgress(null);
      closeConfirm();
    }
  };

  const requestRefresh = () => {
    if (refreshing || !canRefresh) return;
    const districtName = districtId
      ? (districtOptions.find((d) => d.value === districtId)?.label ?? '')
      : '';
    setConfirmState({
      open: true,
      title: districtId
        ? 'Relancer la synchronisation des observations météo de ce district\u00a0?'
        : 'Relancer la synchronisation nationale des observations météo\u00a0?',
      variant: 'warning',
      actionLabel: 'Confirmer la synchronisation',
      onConfirm: () => void handleRefresh(),
      contextLabel: districtId ? 'District' : 'Territoire',
      contextValue: districtId ? districtName : 'National',
    });
  };

  const controls = (
    <WeatherControls
      metric={metric}
      date={date}
      hour={hour}
      mode={mode}
      districtId={districtId}
      districts={districtOptions}
      maxDate={maxDate}
      sourceName={sourceName}
      lastDataAt={lastDataAt}
      lastSyncAt={lastSyncAt}
      onMetricChange={setMetric}
      onDateChange={setDate}
      onHourChange={setHour}
      onDistrictChange={(id) => {
        setDistrictId(id);
        setSelectedId(null);
      }}
      isRefreshing={refreshing}
      refreshProgress={refreshProgress}
      onRefresh={requestRefresh}
    />
  );

  const detailsPanel = (
    <WeatherCommuneDetailsPanel
      commune={selectedCommune}
      point={selectedPoint}
      layerLoading={weather.query.isLoading}
      metric={metric}
      mode={mode}
      date={date}
      hour={hour}
      sourceName={sourceName}
      lastDataAt={lastDataAt}
      lastSyncAt={lastSyncAt}
      onClose={mobileDetails ? () => setMobileDetails(false) : undefined}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-brand/10 bg-white/80 px-3 backdrop-blur sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">
            Observations et prévisions par commune
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 lg:flex">
            <Database className="size-3.5 text-muted" />
            <span className="text-xs text-muted">
              {sourceName}
              {lastDataAt ? (
                <span className="ml-1 hidden xl:inline">
                  · à jour au {new Date(lastDataAt).toLocaleDateString("fr-FR")}
                </span>
              ) : null}
            </span>
          </div>
          <WeatherModeBadge mode={mode} />
          <RefreshDataButton
            queryKey={["weather", "map-layer", "page"]}
            onRefresh={() => void qc.refetchQueries({ queryKey: ["weather"] })}
          />
          <div className="flex shrink-0 gap-2 lg:hidden">
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

          {weather.query.isError ? (
            <div className="absolute left-1/2 top-3 z-30 w-[min(26rem,90vw)] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50/95 px-3 py-2 text-sm text-red-800 shadow-sm">
              Impossible de charger la couche météo pour ces paramètres. Vérifiez la
              connexion ou réessayez dans quelques minutes.
            </div>
          ) : staleHours !== null && staleHours >= 24 ? (
            <div className="absolute left-1/2 top-3 z-30 w-[min(30rem,90vw)] -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-sm text-amber-800 shadow-sm">
              Données météo potentiellement périmées : dernière synchronisation des
              observations il y a {staleHours} h. Lancez un rafraîchissement pour actualiser.
            </div>
          ) : forecastUnavailable ? (
            <div className="absolute left-1/2 top-3 z-30 w-[min(26rem,90vw)] -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-sm text-amber-800 shadow-sm">
              Prévisions momentanément indisponibles : la limite de requêtes
              Open-Meteo est atteinte. Réessai automatique dans quelques minutes.
            </div>
          ) : noDataForHistory || noDataForObservation ? (
            <div className="absolute left-1/2 top-3 z-30 w-[min(26rem,90vw)] -translate-x-1/2 rounded-lg border border-sky-300 bg-sky-50/95 px-3 py-2 text-sm text-sky-800 shadow-sm">
              {noDataForHistory
                ? "Aucune observation enregistrée pour cette date. Sélectionnez une date plus récente ou effectuez un rafraîchissement."
                : "Aucune observation météo disponible pour aujourd’hui. Effectuez un rafraîchissement pour synchroniser les données."}
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
      <AdministrativeActionConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        actionLabel={confirmState.actionLabel}
        isPending={refreshing}
        onConfirm={confirmState.onConfirm}
        contextLabel={confirmState.contextLabel}
        contextValue={confirmState.contextValue}
      />
    </div>
  );
}
