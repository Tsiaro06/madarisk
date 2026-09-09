import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, description, actions, children, className, ...props }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-brand/10 bg-white/90 p-4 shadow-[0_8px_30px_rgba(19,38,43,0.06)] backdrop-blur-sm sm:p-5',
        className,
      )}
      {...props}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg text-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
