import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = 'Chargement…' }: SpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-10', className)} role="status">
      <span className="size-8 animate-spin rounded-full border-[3px] border-brand border-r-transparent" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
