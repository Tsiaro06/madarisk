import { useEffect, useId, useState } from 'react';
import { cn, formatNumber } from '@/lib/utils';

interface RingGaugeProps {
  /** Pourcentage de remplissage, attendu entre 0 et 100. */
  value: number;
  size?: number;
  thickness?: number;
  variant?: 'hero' | 'plain';
  /** Texte dans la bulle centrale ; par défaut le pourcentage. */
  bubbleLabel?: string;
  /** Ligne de détail sous la jauge, ex. « 4 653 sur 5 952 ». */
  detail?: string;
  ariaLabel?: string;
  className?: string;
}

export function RingGauge({
  value,
  size = 200,
  thickness = 12,
  variant = 'plain',
  bubbleLabel,
  detail,
  ariaLabel,
  className,
}: RingGaugeProps) {
  const gradientId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const radius = 50 - thickness / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  const hero = variant === 'hero';

  return (
    <div
      className={cn('flex flex-col items-center', className)}
      role="img"
      aria-label={ariaLabel ?? `${formatNumber(Math.round(percent))} %`}
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
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              {hero ? (
                <>
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="55%" stopColor="#D6F07A" />
                  <stop offset="100%" stopColor="var(--dash-lime)" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="var(--dash-accent-light)" />
                  <stop offset="100%" stopColor="var(--dash-accent)" />
                </>
              )}
            </linearGradient>
          </defs>

          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className={hero ? 'stroke-white/25' : 'stroke-[var(--dash-accent-soft)]'}
          />

          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={thickness}
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
              'grid place-items-center rounded-full text-center shadow-[0_10px_28px_-12px_rgba(16,24,40,0.45)]',
              hero ? 'bg-white' : 'bg-white ring-1 ring-[var(--dash-line)]',
            )}
            style={{ width: size * 0.46, height: size * 0.46 }}
          >
            <div>
              <p
                className={cn(
                  'font-[Outfit] font-bold leading-none tracking-tight',
                  hero ? 'text-[var(--dash-accent)]' : 'text-[var(--dash-ink)]',
                )}
                style={{ fontSize: size * 0.17 }}
              >
                {bubbleLabel ?? `${formatNumber(Math.round(percent))}%`}
              </p>
              {!bubbleLabel ? (
                <p
                  className="mt-1 leading-none"
                  style={{ fontSize: Math.max(9, size * 0.055) }}
                >
                  <span className={hero ? 'text-[var(--dash-accent)]/70' : 'text-[var(--dash-muted)]'}>
                    couvert
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {detail ? (
        <p
          className={cn(
            'mt-4 text-center text-sm font-medium',
            hero ? 'text-white/90' : 'text-[var(--dash-ink-soft)]',
          )}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}