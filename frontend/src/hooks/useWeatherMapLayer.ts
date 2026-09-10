import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { weatherApi } from "@/api";
import type { WeatherMapFeatureProperties } from "@/types";
import type { WeatherMetric } from "@/types/weather";
import { todayISO } from "@/services/weather.service";

export interface WeatherMapLayerParams {
  metric: WeatherMetric;
  date: string;
  hour: number | null;
  districtId: string;
}

export function useWeatherMapLayer({
  metric,
  date,
  hour,
  districtId,
}: WeatherMapLayerParams) {
  const needsForecast =
    Boolean(date && date > todayISO()) ||
    (date === todayISO() && hour != null);

  const query = useQuery({
    queryKey: [
      "weather",
      "map-layer",
      "page",
      metric,
      date,
      hour ?? "",
      districtId ?? "",
    ],
    queryFn: async () => {
      const params: Record<string, string> = { metric };
      if (date) params.date = date;
      if (hour != null) params.hour = String(hour);
      if (districtId) params.districtId = districtId;
      const res = await weatherApi.mapLayerDetailed(params);
      return { collection: res.data, meta: res.meta };
    },
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    refetchInterval: (q) =>
      needsForecast &&
      (q.state.status === "error" ||
        !q.state.data ||
        q.state.data.collection.features.length === 0)
        ? 60_000
        : false,
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
