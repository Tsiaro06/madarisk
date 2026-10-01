import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { weatherApi } from "@/api";
import type { WeatherMapFeatureProperties } from "@/types";
import { todayISO } from "@/services/weather.service";

export interface WeatherMapLayerParams {
  date: string;
  hour: number | null;
  districtId: string;
}

export function useWeatherMapLayer({
  date,
  hour,
  districtId,
}: WeatherMapLayerParams) {
  const needsForecast =
    Boolean(date && date > todayISO()) ||
    (date === todayISO() && hour != null);

  // `metric` n'est volontairement pas dans la queryKey : la couche renvoyée
  // par /weather/map-layer contient déjà toutes les métriques dans
  // `properties`. L'inclure ici forcerait un refetch de ~870 Ko à chaque
  // changement d'indicateur alors que la réponse est identique.
  //
  // Quand une HEURE est choisie (passée ou future), on bascule sur
  // /weather/hourly-layer : la couche donne la valeur EXACTE de cette heure
  // (réanalyse pour le passé, prévision pour l'avenir), stockée dans
  // `weather_hourly` — alors que /weather/map-layer avec une date passée
  // agrège toutes les observations du jour jusqu'à cette heure.
  const usesHourlyLayer = hour != null;
  const query = useQuery({
    queryKey: [
      "weather",
      "map-layer",
      "page",
      date,
      hour ?? "",
      districtId ?? "",
      usesHourlyLayer ? "hourly" : "live",
    ],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (date) params.date = date;
      if (hour != null) params.hour = String(hour);
      if (districtId) params.districtId = districtId;
      if (usesHourlyLayer) {
        const collection = await weatherApi.hourlyLayer(params);
        return { collection, meta: null };
      }
      const res = await weatherApi.mapLayerDetailed(params);
      return { collection: res.data, meta: res.meta };
    },
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    // Le backend se synchronise toutes les heures, mais la page doit refléter
    // l'observation fraîche sans action manuelle : on rafraîchit au retour sur
    // l'onglet (c'est le cas « je reprends le lendemain ») puis périodiquement
    // tant que l'onglet est visible. `refetchOnWindowFocus` est désactivé
    // globalement dans App.tsx, il faut donc le réactiver ici explicitement.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (q) => {
      if (needsForecast && !q.state.data?.collection.features.length) return 60_000;
      if (typeof document !== "undefined" && document.hidden) return false;
      return 5 * 60_000;
    },
    refetchIntervalInBackground: false,
  });

  const layer = query.data?.collection ?? null;
  const latestObservationAt = query.data?.meta?.latestObservationAt ?? null;

  const pointByCommune = useMemo(() => {
    const map = new Map<string, WeatherMapFeatureProperties>();
    if (!layer) return map;
    for (const feature of layer.features) {
      const props = feature.properties as unknown as
        WeatherMapFeatureProperties | undefined;
      if (props?.communeId) map.set(props.communeId, props);
    }
    return map;
  }, [layer]);

  return { query, layer, pointByCommune, latestObservationAt };
}
