import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, className, icon }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-gray-50 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-surface p-3 text-muted shadow-sm">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div>
        <p className="text-base font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
