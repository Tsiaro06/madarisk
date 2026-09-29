import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** `light` pour poser le logo sur le panneau bleu nuit, `dark` sur fond clair. */
  tone?: 'light' | 'dark';
  /** Masque le texte et ne garde que la marque. */
  markOnly?: boolean;
  className?: string;
}

function LogoMark({ gradientId }: { gradientId: string }) {
  return (
    <svg viewBox="0 0 32 32" className="size-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f5f78" />
          <stop offset="0.55" stopColor="#3d7a9a" />
          <stop offset="1" stopColor="#3ec9d6" />
        </linearGradient>
      </defs>
      {/* Bouclier = protection du territoire */}
      <path
        d="M16 2.4 4.6 6.9v8.7c0 6.9 4.7 11.8 11.4 13.8 6.7-2 11.4-6.9 11.4-13.8V6.9L16 2.4Z"
        fill={`url(#${gradientId})`}
      />
      {/* Courbe de niveau stylisée = donnée géospatiale */}
      <path
        d="M9.4 18.1c2.2-3.4 4.5-3.4 6.6 0s4.4 3.4 6.6 0"
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M11.3 22.3c1.9-2.6 3.7-2.6 5.5 0s3.6 2.6 5.5 0"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="10.4" r="2" fill="rgba(255,255,255,0.95)" />
    </svg>
  );
}

/** Signature « MadaRisk Map » : bouclier + courbe de niveau, réutilisée par la page de connexion. */
export function BrandLogo({ tone = 'dark', markOnly = false, className }: BrandLogoProps) {
  const gradientId = `madarisk-logo-${useId()}`;

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl shadow-sm ring-1 ring-white/20">
        <LogoMark gradientId={gradientId} />
      </span>
      {markOnly ? null : (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              'font-display text-xl font-semibold tracking-tight',
              tone === 'light' ? 'text-white' : 'text-ink',
            )}
          >
            MadaRisk
          </span>
          <span
            className={cn(
              'mt-1 text-[0.68rem] font-medium uppercase tracking-[0.2em]',
              tone === 'light' ? 'text-white/70' : 'text-muted',
            )}
          >
            Map
          </span>
        </span>
      )}
    </span>
  );
}
