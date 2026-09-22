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
        'rounded-xl border border-line bg-canvas shadow-none',
        compact && 'rounded-lg',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-ink">
              {title ?? 'Intervention administrative'}
            </span>
            {!compact ? (
              <span className="mt-0.5 block text-[11px] text-muted">{SUBTITLE}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className={cn('space-y-2 border-t border-line px-3 py-2', compact && 'px-2')}>
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