import { useEffect, useMemo, useState } from 'react';
import { Circle, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  availableWindRadiusKm,
  CYCLONE_VIOLET,
  CYCLONE_VIOLET_DEEP,
  deriveRiskFromWind,
  describeMovementDirection,
  formatAntananarivo,
  formatMeasure,
  OBSERVED_RISK_LABELS,
} from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

const MIN_SIZE_PX = 34;
const MAX_SIZE_PX = 48;

/**
 * Spirale purement décorative : aucune donnée n'y est encodée, seule la
 * rotation CSS anime le marqueur (coupée par `prefers-reduced-motion`).
 */
const SPIRAL_SVG = `
<svg class="madarisk-cyclone-marker__spin" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M16 3 A13 13 0 0 1 29 16 A11 11 0 0 1 16 27 A9 9 0 0 1 7 16 A7 7 0 0 1 16 9 A5 5 0 0 1 21 16 A3 3 0 0 1 16 19"
    stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function sizeForZoom(zoom: number): number {
  return Math.round(Math.min(MAX_SIZE_PX, Math.max(MIN_SIZE_PX, 34 + (zoom - 4) * 3)));
}

/** Taille du marqueur (34–48 px) suivant le zoom, sans recréer la carte. */
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
  const radiusKm = availableWindRadiusKm(point);
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
          value={radiusKm != null ? formatMeasure(radiusKm, 'km') : 'non disponible'}
        />
        <Detail label="Source" value={sourceName ?? 'non disponible'} />
      </dl>
    </div>
  );
}

interface CycloneMarkerProps {
  /** Position [lat, lng] : exacte, ou interpolée entre deux points vérifiés. */
  position: [number, number];
  /** Point observé de référence : toutes les valeurs viennent de lui. */
  point: TrackStatePoint;
  /** Vrai lorsque la position est interpolée (donnée inchangée). */
  interpolated: boolean;
  /** Nom de l'événement, ex. « Batsirai — février 2022 ». */
  eventName: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
}

/**
 * Marqueur violet animé du centre observé. Les valeurs du tooltip/du popup
 * viennent du point importé ; la position peut être interpolée entre deux
 * points vérifiés pour la fluidité, sans jamais inventer de mesure.
 */
export function CycloneMarker({
  position,
  point,
  interpolated,
  eventName,
  sourceName,
  sourceUrl,
}: CycloneMarkerProps) {
  const size = useZoomBasedSize();
  const radiusKm = availableWindRadiusKm(point);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'madarisk-cyclone-icon',
        html: `<div class="madarisk-cyclone-marker">${SPIRAL_SVG}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [size],
  );

  const accessibleName = [
    `${eventName} — position observée du centre`,
    `le ${formatAntananarivo(point.observedAt)} (heure de Madagascar)`,
    interpolated ? 'position interpolée pour l’affichage' : 'point observé exact',
  ].join(' · ');

  return (
    <>
      {/*
        Zone d'influence du cyclone : le rayon de vent documenté (RSMC) est
        dessiné en anneau rempli pour rester lisible comme sur les cartes de
        vigilance, tout en gardant un contour pointillé qui la distingue des
        zones administratives pleines. Aucune donnée inventée : le cercle
        n'existe que lorsqu'une source publie le rayon.

        L'anneau est centré sur la position AFFICHÉE (`position`, éventuellement
        interpolée entre deux points vérifiés) et suit donc le déplacement de
        l'œil au lieu de sauter d'un point observé au suivant. Son RAYON, lui,
        reste celui publié pour le point observé de référence : il n'est jamais
        interpolé, la taille ne change donc qu'à l'arrivée sur un point daté.
      */}
      {radiusKm != null ? (
        <Circle
          center={position}
          radius={radiusKm * 1000}
          pathOptions={{
            color: CYCLONE_VIOLET_DEEP,
            weight: 2,
            dashArray: '8 6',
            fillColor: CYCLONE_VIOLET,
            fillOpacity: 0.16,
          }}
        >
          <Tooltip>
            {point.radiusMeasureType ?? 'Rayon de vent documenté'} — {radiusKm} km
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
                  radiusKm != null
                    ? `${formatMeasure(radiusKm, 'km')}${point.radiusMeasureType ? ` — ${point.radiusMeasureType}` : ''}`
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
