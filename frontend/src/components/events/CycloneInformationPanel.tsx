import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import {
  availableWindRadiusKm,
  deriveRiskFromWind,
  describeMovementDirection,
  formatAntananarivo,
  formatMeasure,
  OBSERVED_RISK_LABELS,
} from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

interface DetailRowProps {
  label: string;
  value: ReactNode;
}

/** Ligne « libellé / valeur » réutilisée par les panneaux de l'historique. */
export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

interface CycloneInformationPanelProps {
  /** Point observé de référence (jamais une valeur inventée). */
  point: TrackStatePoint | null;
  /** Point observé suivant, pour situer l'interpolation. */
  nextPoint: TrackStatePoint | null;
  /** Vrai lorsque le repère affiché est interpolé entre `point` et `nextPoint`. */
  interpolated: boolean;
  /** Méthode documentée (issue de l'API). */
  method: string | null;
  /** Rayon documenté, source et type de mesure. */
  hasRadiusData: boolean;
  radiusSource: string | null;
  radiusMeasureType: string | null;
}

/**
 * Panneau d'information du cyclone : reprend le point observé courant et
 * signale explicitement les valeurs absentes plutôt que de les estimer.
 */
export function CycloneInformationPanel({
  point,
  nextPoint,
  interpolated,
  method,
  hasRadiusData,
  radiusSource,
  radiusMeasureType,
}: CycloneInformationPanelProps) {
  const wind = point?.windSpeedKmh ?? null;
  const radiusKm = availableWindRadiusKm(point);

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        État observé au temps choisi
      </p>

      {!point ? (
        <p className="mt-1 text-xs text-muted">
          Trajectoire historique détaillée non disponible pour cette période.
        </p>
      ) : (
        <>
          <div className="mt-1 divide-y divide-line">
            <DetailRow
              label="Date et heure"
              value={`${formatAntananarivo(point.observedAt)} (UTC+3)`}
            />
            <DetailRow
              label="Position"
              value={
                interpolated && nextPoint
                  ? 'interpolée entre deux points observés'
                  : 'point observé exact'
              }
            />
            <DetailRow
              label="Vent soutenu"
              value={
                wind != null ? (
                  <>
                    {formatMeasure(wind, 'km/h')} ·{' '}
                    <Badge tone={riskTone(deriveRiskFromWind(wind))}>
                      {OBSERVED_RISK_LABELS[deriveRiskFromWind(wind)]}
                    </Badge>
                  </>
                ) : (
                  'non disponible'
                )
              }
            />
            <DetailRow label="Rafales" value={formatMeasure(point.gustSpeedKmh, 'km/h')} />
            <DetailRow label="Pression" value={formatMeasure(point.pressureHpa, 'hPa')} />
            <DetailRow
              label="Déplacement"
              value={
                describeMovementDirection(point.movementDirection) ??
                'direction non disponible'
              }
            />
            <DetailRow
              label="Vitesse de déplacement"
              value={formatMeasure(point.movementSpeedKmh, 'km/h')}
            />
            <DetailRow
              label="Rayon de vent"
              value={radiusKm != null ? formatMeasure(radiusKm, 'km') : 'non disponible'}
            />
          </div>

          {interpolated && nextPoint ? (
            <p className="mt-2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] leading-snug text-muted">
              Position interpolée à des fins d’affichage entre{' '}
              {formatAntananarivo(point.observedAt)} et {formatAntananarivo(nextPoint.observedAt)}.
              Les valeurs affichées proviennent du point observé de référence.
            </p>
          ) : null}

          {radiusKm != null || hasRadiusData ? (
            <div className="mt-2 rounded-lg border border-brand/15 bg-brand-soft/20 px-2.5 py-2 text-[11px]">
              <p className="font-semibold text-brand-deep">Rayon de vent documenté</p>
              <p className="mt-0.5 text-muted">
                {radiusMeasureType ?? 'Type de mesure non précisé'}
                {radiusSource ? ` · source : ${radiusSource}` : ' · source non documentée'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Aucun rayon de vent fiable dans les données vérifiées : seuls le centre observé et la
              trajectoire sont affichés, ainsi que les impacts communaux enregistrés.
            </p>
          )}

          {method ? <p className="mt-2 text-[11px] leading-snug text-muted">{method}</p> : null}
        </>
      )}
    </div>
  );
}

function riskTone(
  level: ReturnType<typeof deriveRiskFromWind>,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (level === 'TRES_ELEVE') return 'danger';
  if (level === 'ELEVE') return 'warning';
  if (level === 'MODERE') return 'info';
  if (level === 'FAIBLE') return 'success';
  return 'neutral';
}
