import { cn } from '@/lib/utils';
import {
  Skeleton,
  SkeletonList,
  SkeletonMap,
  SkeletonStats,
  SkeletonTable,
  SkeletonText,
} from '@/components/ui/Skeleton';

/**
 * Squelettes de page.
 *
 * Chaque composition reproduit la mise en page de la page réelle pour que
 * le passage « données » → « squelette » ne provoque pas de saut de mise en
 * page : l'utilisateur voit la forme du contenu qui arrive.
 */

interface PageHeaderSkeletonProps {
  className?: string;
  /** Affiche un lien de retour au-dessus du titre. */
  withBackLink?: boolean;
  /** Nombre de boutons d'action à droite du titre. */
  actions?: number;
}

/** En-tête de page : lien de retour, titre, sous-titre, actions. */
export function PageHeaderSkeleton({
  className,
  withBackLink = false,
  actions = 1,
}: PageHeaderSkeletonProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {withBackLink ? <Skeleton className="h-3 w-28" /> : null}
        <Skeleton className={cn('h-8 w-64', withBackLink ? 'mt-3' : '')} />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>
      {actions > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-32 rounded-lg" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ListPageSkeletonProps {
  /** Nombre de lignes du tableau. */
  rows?: number;
  /** Nombre de colonnes du tableau. */
  columns?: number;
  /** Nombre de champs de filtrage. */
  filters?: number;
  className?: string;
}

/** Page « liste » : en-tête, filtres, puis tableau dans une carte. */
export function ListPageSkeleton({
  rows = 6,
  columns = 4,
  filters = 0,
  className,
}: ListPageSkeletonProps) {
  return (
    <div className={cn('space-y-5', className)}>
      <PageHeaderSkeleton />
      {filters > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: filters }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : null}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(15,23,42,0.16)]">
        <SkeletonTable rows={rows} columns={columns} />
      </div>
    </div>
  );
}

interface DetailPageSkeletonProps {
  /** Nombre de tuiles de statistiques sous le titre. */
  stats?: number;
  /** Hauteur du graphique / de la carte. */
  height?: number;
  className?: string;
}

/** Page de détail : en-tête, statistiques, puis graphique ou carte. */
export function DetailPageSkeleton({
  stats = 4,
  height = 288,
  className,
}: DetailPageSkeletonProps) {
  return (
    <div className={cn('space-y-5', className)}>
      <PageHeaderSkeleton withBackLink actions={2} />
      <SkeletonStats count={stats} />
      <div className="rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(15,23,42,0.16)]">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-5 w-full" style={{ height: height - 60 }} />
      </div>
    </div>
  );
}

/** Page « carte » : colonne de contrôle à gauche, carte à droite. */
export function MapPageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 w-full gap-4', className)}>
      <div className="w-72 shrink-0 space-y-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-4 w-28" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <SkeletonMap height={520} className="h-full" />
      </div>
    </div>
  );
}

/** Tableau de bord : bandeau, panneau bleu, KPI, graphique et grille de stats. */
export function DashboardSkeleton() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="h-80 w-full rounded-3xl" />
        <div className="grid gap-5">
          <Skeleton className="h-4 w-64" />
          <SkeletonStats count={4} />
          <Skeleton className="h-72 w-full rounded-3xl" />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Panneau latéral de la salle de crise : listes de communes / districts. */
export function SidePanelSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full rounded-lg" />
      <SkeletonList count={5} />
    </div>
  );
}

/** Contenu de la colonne de droite de la salle de crise. */
export function DetailPanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-2/3" />
      <SkeletonText lines={4} />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}
