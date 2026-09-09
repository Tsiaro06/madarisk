import type { ReactNode } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'danger' | 'success';

interface AlertBannerProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

const tones: Record<Tone, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-950',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  danger: 'border-red-300 bg-red-50 text-red-950',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
};

export function AlertBanner({
  tone = 'info',
  title,
  children,
  onClose,
  className,
}: AlertBannerProps) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        tones[tone],
        className,
      )}
      role="alert"
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
