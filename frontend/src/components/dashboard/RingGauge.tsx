import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { DASH, DASH_NAVY } from '@/lib/dashboardTheme';

interface RingGaugeProps {
  /** Pourcentage de remplissage, attendu entre 0 et 100. */
  value: number;
  size?: number;
  thickness?: number;
  /** Alias de `thickness`, avec le nom utilisé par les jauges du dashboard. */
  strokeWidth?: number;
  /** Couleur de l'anneau de valeur. Par défaut, le dégradé bleu du thème. */
  color?: string;
  /** Couleur de la piste non remplie. Par défaut, la teinte navy du thème. */
  trackColor?: string;
  /** Contenu de la bulle centrale ; prime sur `bubbleLabel`. */
  children?: ReactNode;
  /** Texte dans la bulle centrale ; par défaut le pourcentage. */
  bubbleLabel?: string;
  /** Classes CSS de la bulle centrale, pour l'adapter au panneau d'accueil. */
  bubbleClassName?: string;
  /** Ligne de détail sous la jauge, ex. « 4 653 sur 5 952 communes ». */
  detail?: string;
  /** Libellé accessible ; remplace le pourcentage par défaut. */
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export function RingGauge({
  value,
  size = 200,
  thickness,
  strokeWidth,
  color,
  trackColor,
  children,
  bubbleLabel,
  bubbleClassName,
  detail,
  label,
  ariaLabel,
  className,
}: RingGaugeProps) {
  const gradientId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const ringThickness = thickness ?? strokeWidth ?? 12;
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const radius = 50 - ringThickness / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      className={cn('flex flex-col items-center', className)}
      role="img"
      aria-label={ariaLabel ?? label ?? `${formatNumber(Math.round(percent))} %`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          className="-rotate-90"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={DASH_NAVY.a38} />
              <stop offset="100%" stopColor={DASH.navy} />
            </linearGradient>
          </defs>

          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth={ringThickness}
            stroke={trackColor ?? undefined}
            className={trackColor ? undefined : 'stroke-(--dash-navy-08)'}
          />

          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color ?? `url(#${gradientId})`}
            strokeWidth={ringThickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={mounted ? offset : circumference}
            className="dash-ring-value"
            style={{ transitionDelay: '120ms' }}
          />
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div
            className={cn(
              'grid place-items-center rounded-full bg-white ring-1 ring-(--dash-navy-14) text-center',
              bubbleClassName,
            )}
            style={bubbleClassName ? undefined : { width: size * 0.46, height: size * 0.46 }}
          >
            <div>
              {children ?? (
                <p
                  className="font-[Outfit] font-bold leading-none tracking-tight text-(--dash-navy)"
                  style={{ fontSize: size * 0.17 }}
                >
                  {bubbleLabel ?? `${formatNumber(Math.round(percent))}%`}
                </p>
              )}
              {!children && !bubbleLabel ? (
                <p
                  className="mt-1 leading-none text-(--dash-navy-72)"
                  style={{ fontSize: Math.max(9, size * 0.05) }}
                >
                  couvert
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {detail ? (
        <p className="mt-4 text-center text-sm font-medium text-(--dash-text-soft)">
          {detail}
        </p>
      ) : null}
    </div>
  );
}