import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

type ConfirmVariant = 'warning' | 'destructive' | 'primary';

interface AdministrativeActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isPending?: boolean;
  onConfirm: () => void;
  contextLabel?: string;
  contextValue?: string;
}

const FIXED_WARNING =
  'Cette action exceptionnelle peut modifier des données générées automatiquement. Vérifiez la source avant de continuer.';
const FIXED_TRACEABILITY =
  'Cette intervention est soumise à la traçabilité disponible côté système.';

const variantButtonVariant: Record<ConfirmVariant, 'danger' | 'primary' | 'secondary'> = {
  warning: 'primary',
  destructive: 'danger',
  primary: 'primary',
};

const variantButtonClass: Record<ConfirmVariant, string> = {
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  destructive: '',
  primary: '',
};

const variantIconBg: Record<ConfirmVariant, string> = {
  warning: 'bg-amber-100',
  destructive: 'bg-red-100',
  primary: 'bg-brand-soft',
};

const variantIconColor: Record<ConfirmVariant, string> = {
  warning: 'text-amber-600',
  destructive: 'text-red-600',
  primary: 'text-brand',
};

const variantBanner: Record<ConfirmVariant, string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  destructive: 'border-red-200 bg-red-50 text-red-900',
  primary: 'border-brand/20 bg-brand-soft/40 text-ink',
};

export function AdministrativeActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = 'Confirmer l\u2019intervention',
  cancelLabel = 'Annuler',
  variant = 'warning',
  isPending = false,
  onConfirm,
  contextLabel,
  contextValue,
}: AdministrativeActionConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const container = dialogRef.current;
      if (container) {
        const first = container.querySelector<HTMLElement>(
          'button:not([disabled])',
        );
        first?.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, isPending, onOpenChange]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const container = dialogRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!isPending) {
      onConfirm();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              variantIconBg[variant],
            )}
          >
            <AlertTriangle
              className={cn('size-5', variantIconColor[variant])}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="admin-confirm-title"
              className="font-display text-lg text-ink"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
            {contextLabel && contextValue ? (
              <p className="mt-2 text-sm text-ink">
                <span className="text-muted">{contextLabel} :</span>{' '}
                {contextValue}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'rounded-lg border px-3 py-2.5 text-sm',
            variantBanner[variant],
          )}
        >
          <p>{FIXED_WARNING}</p>
          <p className="mt-1 text-xs opacity-80">{FIXED_TRACEABILITY}</p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variantButtonVariant[variant]}
            loading={isPending}
            onClick={handleConfirm}
            className={variantButtonClass[variant]}
          >
            {isPending ? 'Traitement en cours\u2026' : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
