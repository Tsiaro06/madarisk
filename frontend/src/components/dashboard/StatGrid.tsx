import { cn, formatNumber } from '@/lib/utils';

/**
 * Forme minimale consommée par la grille. La clé stable vient de `level` pour
 * les données agrégées du tableau de bord, et de `id` pour les tranches de
 * risque définies dans `dashboardData` : les deux ne décrivent pas la même
 * chose, mais la grille n'a besoin que d'un identifiant, d'un libellé, d'un
 * effectif, d'une part et d'une couleur.
 */
export interface StatGridItem {
  level?: string;
  id?: string;
  label: string;
  count: number;
  share: number;
  color: string;
}

interface StatGridProps {
  /** Titre du bloc, affiché au-dessus de la grille. */
  title?: string;
  /** Texte d'explication sous le titre. */
  description?: string;
  items: StatGridItem[];
  className?: string;
}

export function StatGrid({ title, description, items, className }: StatGridProps) {
  const total = items.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className={className}>
      {title ? <h2 className="text-base font-semibold tracking-tight text-dash-title">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.level ?? item.id} className="min-w-0">
            <dt className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full ring-1 ring-(--dash-navy-14)"
                style={{ backgroundColor: item.color }}
              />
              <span className="dash-label truncate">{item.label}</span>
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-2">
              <span className="font-[Outfit] text-2xl font-bold tracking-tight tabular-nums text-(--dash-text)">
                {formatNumber(item.count)}
              </span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  item.share > 0
                    ? 'bg-(--dash-navy) text-white'
                    : 'bg-(--dash-navy-08) text-(--dash-navy-80)',
                )}
              >
                {item.share} %
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <div
        className="mt-6 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full border border-(--dash-navy-14) bg-white p-px"
        role="img"
        aria-label={items
          .filter((i) => i.count > 0)
          .map((i) => `${i.label} : ${i.share} %`)
          .join(', ')}
      >
        {items.map((item) =>
          item.count > 0 ? (
            <span
              key={item.level ?? item.id}
              className="dash-fade h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(item.count / total) * 100}%`, backgroundColor: item.color }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}