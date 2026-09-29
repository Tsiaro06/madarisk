import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** Texte d'aide, relié au champ via `aria-describedby`. */
  description?: string;
}

/** Case à cocher native, stylée par thème, avec label explicitement associé. */
export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id || props.name || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const { 'aria-describedby': ariaDescribedBy, ...rest } = props;

  return (
    <label
      htmlFor={inputId}
      className={cn('inline-flex cursor-pointer items-start gap-2.5 text-sm', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line text-brand accent-brand',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...rest}
        aria-describedby={
          [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined
        }
      />
      <span className="min-w-0">
        <span className="font-medium text-ink">{label}</span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
