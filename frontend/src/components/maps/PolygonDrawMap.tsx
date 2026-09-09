import { useQuery } from '@tanstack/react-query';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMapEvents,
} from 'react-leaflet';
import type { Dispatch, SetStateAction } from 'react';
import type { LatLngExpression } from 'leaflet';
import { territoriesApi } from '@/api';

interface PolygonDrawMapProps {
  points: [number, number][];
  onChange: Dispatch<SetStateAction<[number, number][]>>;
  height?: number | string;
  variant?: 'polygon' | 'track';
}

function ClickCollector({ onAdd }: { onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onAdd(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export function PolygonDrawMap({
  points,
  onChange,
  height = 260,
  variant = 'polygon',
}: PolygonDrawMapProps) {
  const districtsQ = useQuery({
    queryKey: ['territories', 'map-districts'],
    queryFn: () => territoriesApi.mapDistricts(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand/15">
      <div style={{ height }}>
        <MapContainer
          center={[-19.4, 47.5]}
          zoom={6}
          minZoom={4}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {districtsQ.data ? (
            <GeoJSON
              data={districtsQ.data}
              interactive={false}
              style={{
                color: '#64748b',
                weight: 1,
                fill: false,
                fillOpacity: 0,
              }}
            />
          ) : null}
          <ClickCollector
            onAdd={(lat, lng) => onChange((prev) => [...prev, [lat, lng] as [number, number]])}
          />
          {variant === 'track' && points.length >= 2 ? (
            <Polyline
              positions={points as LatLngExpression[]}
              pathOptions={{ color: '#0a6b6e', dashArray: '6 6', weight: 2 }}
            />
          ) : null}
          {variant === 'polygon' && points.length >= 3 ? (
            <Polygon
              positions={points as LatLngExpression[]}
              pathOptions={{ color: '#0a6b6e', weight: 2, fillColor: '#0a6b6e', fillOpacity: 0.25 }}
            />
          ) : null}
          {points.map(([lat, lng], i) => (
            <CircleMarker
              key={i}
              center={[lat, lng]}
              radius={5}
              pathOptions={{
                color: '#0a6b6e',
                weight: 2,
                fillColor: '#0a6b6e',
                fillOpacity: 1,
              }}
            />
          ))}
        </MapContainer>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg border border-white/60 bg-white/95 px-2.5 py-1.5 text-xs text-muted shadow-md backdrop-blur">
        {points.length === 0
          ? 'Cliquez sur la carte pour poser les points'
          : `${points.length} point${points.length > 1 ? 's' : ''} posé${points.length > 1 ? 's' : ''}`}
      </div>
    </div>
  );
}