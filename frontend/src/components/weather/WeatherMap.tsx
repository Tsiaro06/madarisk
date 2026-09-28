import { useCallback, useEffect, useMemo, useRef } from "react";
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
  focusTarget?: { id: string; nonce: number } | null;
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

function FlyToCommune({
  data,
  target,
}: {
  data: FeatureCollection;
  target: { id: string; nonce: number } | null;
}) {
  const map = useMap();
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!target || last.current === target.nonce) return;
    if (!data.features?.length) return;
    const feature = data.features.find((f: Feature) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return featureId(props) === target.id;
    });
    if (!feature) return;
    last.current = target.nonce;
    try {
      const layer = L.geoJSON(feature as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [60, 60],
          maxZoom: 11,
          duration: 0.9,
        });
      }
    } catch {
      // géométrie invalide : on ignore
    }
  }, [target, data, map]);

  return null;
}

function baseWeight(isSelected: boolean): number {
  return isSelected ? 3 : 1;
}

// Clé de remontage stable pour une FeatureCollection donnée. Permet de ne
// recréer la couche Leaflet que lorsque la géométrie change réellement.
const collectionKeys = new WeakMap<FeatureCollection, number>();
let collectionKeyCounter = 0;

function getCollectionKey(collection: FeatureCollection): number {
  const existing = collectionKeys.get(collection);
  if (existing !== undefined) return existing;
  collectionKeyCounter += 1;
  collectionKeys.set(collection, collectionKeyCounter);
  return collectionKeyCounter;
}

/**
 * react-leaflet applique déjà `setStyle` quand l'identité de la prop `style`
 * change : le recolorage se fait donc en place, sans remontage. En revanche
 * `updateGeoJSON` ne rafraîchit PAS les infobulles, liées une seule fois dans
 * `onEachFeature` : ce composant les met à jour après un changement
 * d'indicateur, sans re-parser les 1579 géométries.
 */
function RefreshTooltips({
  pointLookup,
  metric,
  selectedId,
}: {
  pointLookup: Map<string, WeatherMapFeatureProperties>;
  metric: WeatherMetric;
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    for (const layer of Object.values(
      (map as unknown as { _layers?: Record<string, L.Layer> })._layers ?? {},
    )) {
      if (!(layer instanceof L.GeoJSON)) continue;
      layer.eachLayer((child) => {
        if (!(child instanceof L.Path)) return;
        const feature = (child as L.Path & { feature?: Feature<Geometry> }).feature;
        if (!feature) return;
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const id = featureId(props);
        const value = getWeatherValue(pointLookup.get(id), metric);
        child.setTooltipContent(
          `<strong>${featureName(props)}</strong><br/>${WEATHER_METRIC_CONFIGS[metric].label} : ${formatWeatherValue(metric, value)}`,
        );
        if (selectedId != null && id === String(selectedId)) child.bringToFront();
      });
    }
  }, [map, pointLookup, metric, selectedId]);

  return null;
}

export function WeatherMap({
  communes,
  pointByCommune,
  metric,
  selectedCommuneId,
  focusTarget = null,
  onSelectCommune,
}: WeatherMapProps) {
  const collection = useMemo<FeatureCollection>(
    () => communes ?? { type: "FeatureCollection", features: [] },
    [communes],
  );
  const pointLookup = pointByCommune;
  const selectedId = selectedCommuneId;

  // react-leaflet n'instancie le <GeoJSON> qu'une fois et n'applique ensuite
  // que `setStyle` : la clé de remontage ne doit donc changer que lorsque la
  // GÉOMÉTRIE change, jamais quand l'indicateur ou la sélection changent
  // (sinon les 1579 polygones sont détruits/reparsés à chaque clic).
  const geometryKey = getCollectionKey(collection);

  // Mémoïsé pour que react-leaflet ne re-colore pas les 1579 polygones à
  // chaque rendu du parent, mais uniquement quand metric/value/sélection change.
  const styleFn = useCallback(
    (feature: Feature<Geometry> | undefined) => {
      const props = (feature?.properties ?? {}) as Record<string, unknown>;
      const id = featureId(props);
      const point = pointLookup.get(id);
      const isSelected = selectedId != null && id === String(selectedId);
      return getWeatherStyle(
        metric,
        getWeatherValue(point, metric),
        isSelected,
      );
    },
    [pointLookup, metric, selectedId],
  );

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
            key={geometryKey}
            style={styleFn}
            onEachFeature={onEachFeature}
          />
        ) : null}

        {collection.features.length > 0 ? (
          <RefreshTooltips
            pointLookup={pointLookup}
            metric={metric}
            selectedId={selectedId}
          />
        ) : null}

        {collection.features.length > 0 ? (
          <FitBounds data={collection} />
        ) : null}

        {focusTarget ? (
          <FlyToCommune data={collection} target={focusTarget} />
        ) : null}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
        <WeatherLegend metric={metric} />
      </div>
    </div>
  );
}
