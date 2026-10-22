import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Squelettes de chargement.
 *
 * Le rendu « shimmer » (balayage lumineux) est porté par la classe CSS
 * `.skeleton` (cf. `index.css`) : elle s'adapte au thème clair/sombre via
 * les variables `--skeleton-base` / `--skeleton-sheen`.
 *
 * Convention d'accessibilité : chaque bloc est `aria-hidden` (purement
 * décoratif) et le conteneur porte `role="status"` + `aria-busy`, ce qui
 * fait annoncer « Chargement… » par les lecteurs d'écran sans que les
 * dizaines de blocs décoratifs soient lus un par un.
 */

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Forme du bloc : `rounded` (défaut) ou `circle`. */
  shape?: 'rounded' | 'circle';
}

/** Bloc de base : rectangle (ou disque) animé par le balayage « shimmer ». */
export function Skeleton({ className, shape = 'rounded', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'skeleton',
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        className,
      )}
      {...props}
    />
  );
}

interface SkeletonGroupProps {
  /** Message annoncé par les lecteurs d'écran. */
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Conteneur sémantique d'un squelette : `role="status"` et `aria-busy`
 * signalent la zone en cours de chargement. Le libellé nommé la région
 * (les lecteurs d'écran l'annoncent à son apparition) ; les blocs
 * décoratifs restent `aria-hidden` pour ne pas être lus un par un.
 */
export function SkeletonGroup({
  label = 'Chargement en cours…',
  className,
  children,
}: SkeletonGroupProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={className}
    >
      {children}
    </div>
  );
}

interface SkeletonTextProps {
  /** Nombre de lignes de texte à dessiner. */
  lines?: number;
  className?: string;
  /** Largeur de la dernière ligne (la dernière est souvent plus courte). */
  lastLineWidth?: string;
}

/** Bloc de texte multi-lignes (paragraphe). */
export function SkeletonText({ lines = 3, className, lastLineWidth = 'w-3/5' }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3 w-full', i === lines - 1 ? lastLineWidth : 'w-full')}
        />
      ))}
    </div>
  );
}

interface SkeletonAvatarProps {
  /** Diamètre du disque (Tailwind : `size-10`). */
  className?: string;
}

/** Pastille ronde (avatar, icône). */
export function SkeletonAvatar({ className }: SkeletonAvatarProps) {
  return <Skeleton shape="circle" className={cn('size-10', className)} />;
}

interface SkeletonStatsProps {
  /** Nombre de tuiles KPI. */
  count?: number;
  className?: string;
}

/** Rangee de tuiles de statistiques (KPI). */
export function SkeletonStats({ count = 4, className }: SkeletonStatsProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  /** Nombre de lignes de corps de tableau. */
  rows?: number;
  /** Nombre de colonnes. */
  columns?: number;
  className?: string;
}

/** Tableau de données : en-tête + lignes. */
export function SkeletonTable({ rows = 6, columns = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex gap-4 border-b border-line pb-2">
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line/60 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-3 flex-1', c === 0 ? 'max-w-[45%]' : undefined)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonListProps {
  /** Nombre d'éléments de la liste. */
  count?: number;
  className?: string;
}

/** Liste de cartes empilées (alertes, événements, correspondances…). */
export function SkeletonList({ count = 4, className }: SkeletonListProps) {
  return (
    <ul className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

interface SkeletonMapProps {
  /** Hauteur de la zone cartographique. */
  height?: number;
  className?: string;
}

/** Emplacement d'une carte (Leaflet) en attente de ses couches GeoJSON. */
export function SkeletonMap({ height = 420, className }: SkeletonMapProps) {
  return (
    <div
      className={cn('flex w-full items-center justify-center rounded-xl border border-line', className)}
      style={{ height }}
    >
      <Skeleton shape="circle" className="size-10" />
    </div>
  );
}
