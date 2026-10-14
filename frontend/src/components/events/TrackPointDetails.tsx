import {
  deriveRiskFromWind,
  describeMovementDirection,
  documentedWindRadius,
  formatAntananarivo,
  formatMeasure,
  OBSERVED_RISK_LABELS,
  windRadiusShortLabel,
} from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function trackTypeLabel(trackType: TrackStatePoint['trackType']): string {
  return trackType === 'PREVUE' ? 'prévue' : 'observée';
}

/** Statut lisible du point, dans les mots de la source : jamais inventé. */
function statusLabel(point: TrackStatePoint): string {
  return point.trackType === 'PREVUE' ? 'Prévision' : 'Position observée';
}

interface TrackPointDetailsProps {
  /** Point de trajectoire sélectionné : toutes les valeurs viennent de lui. */
  point: TrackStatePoint;
  /** Nom de l'événement, ex. « Batsirai — février 2022 ». */
  eventName: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
}

/**
 * Détail daté et sourcé d'un point de trajectoire, partagé entre le popup du
 * marqueur et celui des pastilles cliquables. Une grandeur absente est écrite
 * « non disponible » — jamais un zéro trompeur.
 */
export function TrackPointDetails({
  point,
  eventName,
  sourceName,
  sourceUrl,
}: TrackPointDetailsProps) {
  const radius = documentedWindRadius(point);
  const direction = describeMovementDirection(point.movementDirection);

  return (
    <div className="min-w-[15rem] space-y-1.5 text-xs">
      <p className="text-sm font-semibold text-ink">{eventName}</p>
      <p className="text-[11px] text-muted">Point de trajectoire sélectionné.</p>
      <dl className="space-y-0.5">
        <Detail
          label="Date et heure"
          value={formatAntananarivo(point.observedAt)}
        />
        <Detail label="Fuseau horaire" value="Madagascar (UTC+3)" />
        <Detail label="Type de trajectoire" value={trackTypeLabel(point.trackType)} />
        <Detail label="Statut" value={statusLabel(point)} />
        <Detail
          label="Vent soutenu"
          value={
            point.windSpeedKmh != null
              ? `${formatMeasure(point.windSpeedKmh, 'km/h')} · ${
                  OBSERVED_RISK_LABELS[deriveRiskFromWind(point.windSpeedKmh)]
                }`
              : 'non disponible'
          }
        />
        <Detail label="Rafales" value={formatMeasure(point.gustSpeedKmh, 'km/h')} />
        <Detail label="Direction de déplacement" value={direction ?? 'non disponible'} />
        <Detail
          label="Vitesse de déplacement"
          value={formatMeasure(point.movementSpeedKmh, 'km/h')}
        />
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
  );
}
