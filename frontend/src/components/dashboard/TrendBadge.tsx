import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

interface TrendBadgeProps {
  /** Variation en pourcentage. `null` ou `undefined` masque complètement le badge. */
  value: number | null;
  label?: string;
  /** Force la teinte « forte » (noir) sur une hausse, utile pour les risques. */
  invert?: boolean;
  className?: string;
}

/**
 * Badge d'évolution monochrome. Le sens de la variation est porté par la
 * flèche et par le texte (accessibles), la hiérarchie visuelle par la
 * densité : bleu marine pour une hausse, noir pour une baisse.
 */
export function TrendBadge({ value, label, invert = false, className }: TrendBadgeProps) {
  if (value == null || !Number.isFinite(value)) return null;

  const rising = value > 0;
  const flat = value === 0;
  const strong = invert ? rising : !rising;
  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  const direction = flat ? 'stable' : rising ? 'en hausse' : 'en baisse';

  return (
    <span
      title={label ? `${direction} — ${label}` : direction}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        flat
          ? 'bg-(--dash-navy-08) text-(--dash-navy-80)'
          : strong
            ? 'bg-(--dash-black) text-white'
            : 'bg-(--dash-navy) text-white',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{direction} — </span>
      {rising ? '+' : ''}
      {formatNumber(value)} %
    </span>
  );
}