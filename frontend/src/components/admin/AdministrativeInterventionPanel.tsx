import { useState, type ReactNode } from 'react';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { canManageOps } from '@/lib/roles';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { cn } from '@/lib/utils';

interface AdministrativeInterventionPanelProps {
  children: ReactNode;
  title?: string;
  className?: string;
  defaultOpen?: boolean;
  compact?: boolean;
}

const SUBTITLE =
  'Actions exceptionnelles. Elles sont journalisées et ne remplacent pas la surveillance automatique.';
const WARNING =
  'Cette action exceptionnelle peut modifier les données générées automatiquement. Vérifiez la source et justifiez votre intervention.';
const TRACEABILITY =
  'Cette intervention est soumise à la traçabilité disponible côté système.';

export function AdministrativeInterventionPanel({
  children,
  title,
  className,
  defaultOpen = false,
  compact = false,
}: AdministrativeInterventionPanelProps) {
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(defaultOpen);

  if (!canManageOps(role)) return null;

  return (
    <section
      className={cn(
        'rounded-xl border border-amber-300 bg-amber-50/50 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        compact && 'rounded-lg',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-amber-50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ShieldAlert className="size-4 shrink-0 text-amber-700" />
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold text-amber-950">
              Intervention administrative
            </span>
            {!compact ? (
              <span className="mt-0.5 block text-xs text-amber-800/80">{SUBTITLE}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-amber-700 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className={cn('space-y-3 border-t border-amber-200 px-4 py-3', compact && 'px-3')}>
          {title ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
          ) : null}
          {!compact ? (
            <AlertBanner tone="warning">
              <p>{WARNING}</p>
              <p className="mt-1">{TRACEABILITY}</p>
            </AlertBanner>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}