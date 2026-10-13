import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import type { PathOptions } from 'leaflet';
import { BRAND } from '@/lib/brandColors';
import {
  TRACK_FORECAST_EDGE,
  TRACK_FORECAST_FILL,
  TRACK_OBSERVED_EDGE,
  TRACK_OBSERVED_FILL,
} from '@/lib/crisisStyles';
import { formatAntananarivo } from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

const observedDot: PathOptions = {
  color: TRACK_OBSERVED_EDGE,
  weight: 1.5,
  fillColor: TRACK_OBSERVED_FILL,
  fillOpacity: 0.9,
};

const forecastDot: PathOptions = {
  color: TRACK_FORECAST_EDGE,
  weight: 1.5,
  fillColor: TRACK_FORECAST_FILL,
  fillOpacity: 0.9,
};

interface EventTrackLayerProps {
  /** Points de la trajectoire observée, triés chronologiquement. */
  observed: TrackStatePoint[];
  /** Points prévisionnels (aucun mélange avec l'observé), tracé pointillé. */
  forecast: TrackStatePoint[];
  /** Portion déjà parcourue, jusqu'à la position affichée incluse. */
  traveled: Array<[number, number]>;
}

/**
 * Trajectoire historique : la ligne observée, la portion déjà parcourue mise en
 * avant, et un tracé pointillé pour la prévision. Aucune donnée ajoutée.
 */
export function EventTrackLayer({ observed, forecast, traveled }: EventTrackLayerProps) {
  const observedPositions = observed.map(
    (p) => [p.latitude, p.longitude] as [number, number],
  );
  const forecastPositions = forecast.map(
    (p) => [p.latitude, p.longitude] as [number, number],
  );

  return (
    <>
      {forecastPositions.length >= 2 ? (
        <Polyline
          positions={forecastPositions}
          pathOptions={{ color: TRACK_FORECAST_FILL, weight: 2.5, opacity: 0.85, dashArray: '8 6' }}
        />
      ) : null}

      {observedPositions.length >= 2 ? (
        <Polyline
          positions={observedPositions}
          pathOptions={{ color: TRACK_OBSERVED_FILL, weight: 2.5, opacity: 0.6 }}
        />
      ) : null}

      {traveled.length >= 2 ? (
        <Polyline positions={traveled} pathOptions={{ color: BRAND, weight: 3.5, opacity: 0.9 }} />
      ) : null}

      {observed.map((p) => (
        <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={4} pathOptions={observedDot}>
          <Tooltip>
            {formatAntananarivo(p.observedAt)}
            {p.windSpeedKmh != null ? ` · ${p.windSpeedKmh} km/h` : ''}
          </Tooltip>
        </CircleMarker>
      ))}

      {forecast.map((p) => (
        <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={4} pathOptions={forecastDot}>
          <Tooltip>
            Prévu pour {formatAntananarivo(p.forecastFor ?? p.observedAt)}
            {p.windSpeedKmh != null ? ` · ${p.windSpeedKmh} km/h` : ''}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
