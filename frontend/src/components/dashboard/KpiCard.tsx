import { cn } from '@/lib/utils';
import { TrendBadge } from './TrendBadge';

interface KpiCardProps {
  /** Libellé de l'indicateur. */
  label: string;
  /** Valeur déjà formatée par les données du dashboard. */
  value: string;
  /** Unité affichée après la valeur. */
  unit?: string;
  /** Variation en % par rapport à la période précédente. */
  delta?: number | null;
  /**
   * Sens favorable de la variation. `false` pour un indicateur où une hausse
   * est défavorable (nombre d'alertes, de communes exposées).
   */
  positiveIsGood?: boolean;
  /** Mise en avant de la carte. */
  highlight?: boolean;
  /** Classes CSS additionnelles, ex. `dash-rise-3` pour l'animation. */
  animationClassName?: string;
  index?: number;
  className?: string;
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  positiveIsGood = true,
  highlight = false,
  animationClassName,
  index = 0,
  className,
}: KpiCardProps) {
  const empty = value === '';

  return (
    <article
      className={cn(
        'dash-card dash-card-hover p-5',
        animationClassName ?? 'dash-rise',
        highlight && 'ring-2 ring-(--dash-navy)',
        className,
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="dash-label">{label}</span>
        {delta != null ? (
          <TrendBadge
            value={delta}
            invert={!positiveIsGood}
            label={`${delta > 0 ? '+' : ''}${delta} %`}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="dash-figure text-(--dash-text)">
          {empty ? '—' : value}
          {unit && !empty ? (
            <span className="ml-1 text-base font-medium text-(--dash-text-muted)">{unit}</span>
          ) : null}
        </p>
      </div>
    </article>
  );
}