import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  hover?: boolean;
  children: ReactNode;
}

export function DashCard({
  title,
  description,
  actions,
  hover = false,
  children,
  className,
  ...props
}: DashCardProps) {
  return (
    <section
      className={cn('dash-card p-5 sm:p-6', hover && 'dash-card-hover', className)}
      {...props}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-[Outfit] text-lg font-semibold tracking-tight text-(--dash-text)">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-(--dash-text-muted)">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

interface IconActionProps extends HTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
}

/** Bouton rond : fond blanc, bordure marine fine, remplissage marine au survol. */
export function IconAction({ label, icon, className, ...props }: IconActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-9 place-items-center rounded-full border border-(--dash-navy-14) bg-white text-(--dash-navy) transition',
        'hover:border-(--dash-navy) hover:bg-(--dash-navy) hover:text-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dash-navy)',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}