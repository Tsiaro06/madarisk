import { AlertTriangle, MapPinned, Siren, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import type { KpiDatum } from '@/data/dashboardView';
import { TrendBadge } from './TrendBadge';

const ICONS: Record<KpiDatum['icon'], ComponentType<{ className?: string }>> = {
  siren: Siren,
  alert: AlertTriangle,
  users: Users,
  map: MapPinned,
};

interface KpiCardProps {
  datum: KpiDatum;
  index?: number;
  className?: string;
}

export function KpiCard({ datum, index = 0, className }: KpiCardProps) {
  const Icon = ICONS[datum.icon];
  const empty = datum.value == null;

  return (
    <article
      className={cn('dash-card dash-card-hover dash-rise p-5', className)}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="dash-label">{datum.label}</span>
        <TrendBadge value={datum.trend.value} label={datum.trend.label} />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="dash-figure text-[var(--dash-text)]">
          {empty ? '—' : formatNumber(datum.value)}
          {datum.unit && !empty ? (
            <span className="ml-1 text-base font-medium text-[var(--dash-text-muted)]">
              {datum.unit}
            </span>
          ) : null}
        </p>
        <span
          aria-hidden="true"
          className="mb-1 grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--dash-navy)] text-white"
        >
          <Icon className="size-5" />
        </span>
      </div>

      <p className="mt-2 truncate text-xs text-[var(--dash-text-muted)]">{datum.hint}</p>
    </article>
  );
}