import { useEffect, useMemo, useState } from 'react';
import { Circle, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  deriveRiskFromWind,
  describeMovementDirection,
  documentedWindRadius,
  formatAntananarivo,
  formatMeasure,
  OBSERVED_RISK_LABELS,
  windRadiusLongLabel,
  windRadiusShortLabel,
} from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

const DEFAULT_SIZE_PX = 48;

const CYCLONE_CENTER_SVG = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="madarisk-cyclone-inner" cx="50%" cy="46%" r="58%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="65%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </radialGradient>
  </defs>
  <g>
    <path d="M 24 4 A 20 20 0 1 1 23.999 4 Z M 24 8.5 A 15.5 15.5 0 1 0 24.001 8.5 Z" fill="#bfdbfe"/>
    <path d="M 24 6.8 A 17.2 17.2 0 1 1 23.999 6.8 Z M 24 11 A 13 13 0 1 0 24.001 11 Z" fill="#93c5fd"/>
    <path d="M 24 9.8 A 14.2 14.2 0 1 1 23.999 9.8 Z M 24 13.2 A 10.8 10.8 0 1 0 24.001 13.2 Z" fill="#60a5fa"/>
    <path d="M 24 12.8 A 11.2 11.2 0 1 1 23.999 12.8 Z M 24 16 A 8 8 0 1 0 24.001 16 Z" fill="#3b82f6"/>
    <circle cx="24" cy="24" r="6.6" fill="url(#madarisk-cyclone-inner)"/>
    <circle cx="24" cy="24" r="2.2" fill="#1e40af"/>
  </g>
</svg>`;

function sizeForZoom(_zoom: number): number {
  return DEFAULT_SIZE_PX;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function useZoomBasedSize(): number {
  const map = useMap();
  const readZoom = () => (typeof map?.getZoom === 'function' ? map.getZoom() : 6);
  const [size, setSize] = useState(() => sizeForZoom(readZoom()));

  useEffect(() => {
    if (typeof map?.on !== 'function' || typeof map?.getZoom !== 'function') return;
    const onZoomEnd = () => setSize(sizeForZoom(map.getZoom()));
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [map]);

  return size;
}

function trackTypeLabel(trackType: TrackStatePoint['trackType']): string {
  return trackType === 'PREVUE' ? 'prévue' : 'observée';
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function displacementLabel(point: TrackStatePoint): string {
  const direction = describeMovementDirection(point.movementDirection);
  const speed = point.movementSpeedKmh != null ? formatMeasure(point.movementSpeedKmh, 'km/h') : null;
  if (direction && speed) return `${direction} · ${speed}`;
  if (direction) return `${direction} · vitesse non disponible`;
  if (speed) return speed;
  return 'non disponible';
}

function TooltipContent({
  point,
  interpolated,
  eventName,
  sourceName,
}: {
  point: TrackStatePoint;
  interpolated: boolean;
  eventName: string;
  sourceName?: string | null;
}) {
  const radius = documentedWindRadius(point);
  const risk = OBSERVED_RISK_LABELS[deriveRiskFromWind(point.windSpeedKmh)];
  return (
    <div className="min-w-[13rem] space-y-0.5">
      <p className="text-sm font-semibold text-ink">{eventName}</p>
      <p className="text-[11px] text-muted">
        Date : {formatAntananarivo(point.observedAt)} (Madagascar, UTC+3)
      </p>
      <p className="text-[11px] text-muted">
        Trajectoire {trackTypeLabel(point.trackType)}
        {interpolated ? ' · position interpolée (affichage)' : ' · point exact'}
      </p>
      <dl className="mt-1 space-y-0.5 text-[11px]">
        <Detail
          label="Vent soutenu"
          value={
            point.windSpeedKmh != null
              ? `${formatMeasure(point.windSpeedKmh, 'km/h')} · ${risk}`
              : 'non disponible'
          }
        />
        <Detail label="Rafales" value={formatMeasure(point.gustSpeedKmh, 'km/h')} />
        <Detail label="Déplacement" value={displacementLabel(point)} />
        <Detail label="Pression" value={formatMeasure(point.pressureHpa, 'hPa')} />
        <Detail
          label="Rayon de vent"
          value={
            radius
              ? `${formatMeasure(radius.km, 'km')} (${windRadiusShortLabel(radius.kind)})`
              : 'non disponible'
          }
        />
        <Detail label="Source" value={sourceName ?? 'non disponible'} />
      </dl>
    </div>
  );
}

interface CycloneMarkerProps {
  position: [number, number];
  point: TrackStatePoint;
  interpolated: boolean;
  eventName: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
}

export function CycloneMarker({
  position,
  point,
  interpolated,
  eventName,
  sourceName,
  sourceUrl,
}: CycloneMarkerProps) {
  const size = useZoomBasedSize();
  const radius = documentedWindRadius(point);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'madarisk-cyclone-icon',
        html: `<div class="madarisk-cyclone-marker">${CYCLONE_CENTER_SVG}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [size],
  );

  const radiusLabelIcon = useMemo(() => {
    if (!radius) return null;
    const html = [
      `<b class="madarisk-cyclone-radius-label__value">${escapeHtml(
        `${windRadiusShortLabel(radius.kind)} · ${formatMeasure(radius.km, 'km')}`,
      )}</b>`,
      `<span class="madarisk-cyclone-radius-label__meta">${escapeHtml(
        `${formatAntananarivo(point.observedAt)} (Madagascar)`,
      )}</span>`,
    ].join('');
    return L.divIcon({
      className: 'madarisk-cyclone-radius-icon',
      html: `<span class="madarisk-cyclone-radius-label">${html}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }, [radius, point.observedAt]);

  const accessibleName = [
    `${eventName} — position observée du centre`,
    `le ${formatAntananarivo(point.observedAt)} (heure de Madagascar)`,
    interpolated ? 'position interpolée pour l’affichage' : 'point observé exact',
  ].join(' · ');

  return (
    <>
      {radiusLabelIcon ? (
        <Marker
          position={position}
          icon={radiusLabelIcon}
          interactive={false}
          keyboard={false}
          zIndexOffset={790}
        />
      ) : null}

      {radius ? (
        <Circle
          center={position}
          radius={radius.km * 1000}
          pathOptions={{
            color: '#2563eb',
            weight: 2,
            dashArray: '8 6',
            fillColor: '#bfdbfe',
            fillOpacity: 0.18,
          }}
        >
          <Tooltip>
            {windRadiusLongLabel(radius.kind)} — {formatMeasure(radius.km, 'km')}
            {point.radiusMeasureType ? ` — ${point.radiusMeasureType}` : ''}
            {point.radiusSource ? ` (source : ${point.radiusSource})` : ''}
          </Tooltip>
        </Circle>
      ) : null}

      <Marker position={position} icon={icon} alt={accessibleName} title={accessibleName} zIndexOffset={800}>
        <Tooltip sticky>
          <TooltipContent
            point={point}
            interpolated={interpolated}
            eventName={eventName}
            sourceName={sourceName}
          />
        </Tooltip>

        <Popup>
          <div className="min-w-[15rem] space-y-1.5 text-xs">
            <p className="text-sm font-semibold text-ink">{eventName}</p>
            <p className="text-[11px] text-muted">
              {interpolated
                ? 'Position interpolée pour l’affichage ; valeurs du point observé de référence.'
                : 'Point observé exact.'}
            </p>
            <dl className="space-y-0.5">
              <Detail
                label="Date et heure"
                value={`${formatAntananarivo(point.observedAt)} (Madagascar, UTC+3)`}
              />
              <Detail label="Type de trajectoire" value={trackTypeLabel(point.trackType)} />
              <Detail
                label="Vent soutenu"
                value={
                  point.windSpeedKmh != null
                    ? formatMeasure(point.windSpeedKmh, 'km/h')
                    : 'non disponible'
                }
              />
              <Detail label="Rafales" value={formatMeasure(point.gustSpeedKmh, 'km/h')} />
              <Detail label="Déplacement" value={displacementLabel(point)} />
              <Detail label="Pression" value={formatMeasure(point.pressureHpa, 'hPa')} />
              <Detail
                label="Rayon de vent"
                value={
                  radius
                    ? `${formatMeasure(radius.km, 'km')} (${windRadiusShortLabel(radius.kind)})${
                        point.radiusMeasureType ? ` — ${point.radiusMeasureType}` : ''
                      }`
                    : 'non disponible'
                }
              />
              <Detail label="Source" value={sourceName ?? 'non disponible'} />
            </dl>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-brand hover:underline"
              >
                Référence de la source
              </a>
            ) : null}
          </div>
        </Popup>
      </Marker>
    </>
  );
}
