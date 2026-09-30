import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

interface TrendBadgeProps {
  /** Variation en pourcentage. `null` ou `undefined` masque complètement le badge. */
  value: number | null;
  label?: string;
  /** Force le rendu « baisse » (rouge) sur une hausse, utile pour les risques. */
  invert?: boolean;
  className?: string;
}

export function TrendBadge({ value, label, invert = false, className }: TrendBadgeProps) {
  if (value == null || !Number.isFinite(value)) return null;

  const rising = value > 0;
  const flat = value === 0;
  const good = invert ? !rising : rising;
  const Icon = rising ? TrendingUp : TrendingDown;

  return (
    <span
      title={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        flat
          ? 'bg-[var(--dash-accent-soft)] text-[var(--dash-ink-soft)]'
          : good
            ? 'bg-[var(--dash-positive)]/12 text-[var(--dash-positive)]'
            : 'bg-[var(--dash-negative)]/12 text-[var(--dash-negative)]',
        className,
      )}
    >
      {flat ? null : <Icon className="size-3.5" aria-hidden="true" />}
      {rising ? '+' : ''}
      {formatNumber(value)} %
    </span>
  );
}