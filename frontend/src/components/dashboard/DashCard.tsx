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
              <h2 className="font-[Outfit] text-lg font-semibold tracking-tight text-[var(--dash-ink)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-[var(--dash-muted)]">{description}</p>
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
  variant?: 'ghost' | 'inverse';
}

export function IconAction({
  label,
  icon,
  variant = 'ghost',
  className,
  ...props
}: IconActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-9 place-items-center rounded-full transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-accent)]',
        variant === 'ghost'
          ? 'bg-[var(--dash-accent-soft)] text-[var(--dash-accent)] hover:bg-[var(--dash-accent)] hover:text-white'
          : 'bg-white/15 text-white hover:bg-white/25',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}