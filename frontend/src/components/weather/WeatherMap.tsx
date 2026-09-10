import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { getWeatherStyle, getWeatherValue } from "@/services/weather.service";
import {
  formatWeatherValue,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
} from "@/types/weather";
import type { WeatherMapFeatureProperties } from "@/types";
import { WeatherLegend } from "@/components/weather/WeatherLegend";

interface WeatherMapProps {
  communes: FeatureCollection | null;
  pointByCommune: Map<string, WeatherMapFeatureProperties>;
  metric: WeatherMetric;
  selectedCommuneId: string | null;
  onSelectCommune: (communeId: string, communeName: string) => void;
}

function featureName(props: Record<string, unknown>): string {
  return String(
    props.commune ?? props.communeName ?? props.nom ?? props.name ?? "",
  );
}

function featureId(props: Record<string, unknown>): string {
  return String(props.communeId ?? props.id ?? "");
}

function FitBounds({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (!data.features?.length) return;
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid())
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
    } catch {
      // géométrie invalide : on ignore
    }
  }, [data, map]);
  return null;
}

function baseWeight(isSelected: boolean): number {
  return isSelected ? 3 : 1;
}

export function WeatherMap({
  communes,
  pointByCommune,
  metric,
  selectedCommuneId,
  onSelectCommune,
}: WeatherMapProps) {
  const collection = useMemo<FeatureCollection>(
    () => communes ?? { type: "FeatureCollection", features: [] },
    [communes],
  );
  const pointLookup = pointByCommune;
  const selectedId = selectedCommuneId;

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const id = featureId(props);
    const name = featureName(props);
    const point = pointLookup.get(id);
    const value = getWeatherValue(point, metric);
    const isSelected = selectedId != null && id === String(selectedId);

    layer.bindTooltip(
      `<strong>${name}</strong><br/>${WEATHER_METRIC_CONFIGS[metric].label} : ${formatWeatherValue(metric, value)}`,
      { sticky: true },
    );

    layer.on({
      mouseover: () => {
        if (!isSelected && "setStyle" in layer) {
          (layer as L.Path).setStyle({ weight: 2.5 });
        }
      },
      mouseout: () => {
        if (!isSelected && "setStyle" in layer) {
          (layer as L.Path).setStyle({ weight: baseWeight(false) });
        }
      },
      click: (e: LeafletMouseEvent) => {
        L.DomEvent.stop(e.originalEvent);
        if (id) onSelectCommune(id, name);
      },
    });
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[-19.4, 47.5]}
        zoom={6}
        minZoom={4}
        scrollWheelZoom
        zoomControl
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {collection.features.length > 0 ? (
          <GeoJSON
            data={collection}
            key={`${collection.features.length}-${metric}-${String(selectedId ?? "")}`}
            style={(feature) => {
              const props = (feature?.properties ?? {}) as Record<
                string,
                unknown
              >;
              const point = pointLookup.get(featureId(props));
              const isSelected =
                selectedId != null && featureId(props) === String(selectedId);
              return getWeatherStyle(
                metric,
                getWeatherValue(point, metric),
                isSelected,
              );
            }}
            onEachFeature={onEachFeature}
          />
        ) : null}

        {collection.features.length > 0 ? (
          <FitBounds data={collection} />
        ) : null}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
        <WeatherLegend metric={metric} />
      </div>
    </div>
  );
}
