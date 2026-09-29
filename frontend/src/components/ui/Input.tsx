import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id || props.name || generatedId;
  const errorId = `${inputId}-error`;
  const { 'aria-describedby': ariaDescribedBy, ...rest } = props;

  // Placé après le spread : l'état d'erreur doit toujours être annoncé, et le
  // `aria-describedby` de l'appelant est fusionné avec l'id du message.
  const describedBy =
    [ariaDescribedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={inputId}>
      {label ? <span className="font-medium text-ink">{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-10 rounded-lg border border-line bg-surface px-3 text-ink outline-none transition',
          'placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15',
          error && 'border-risk-extreme focus:border-risk-extreme focus:ring-risk-extreme/20',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70',
          className,
        )}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <span
          id={errorId}
          className="flex items-start gap-1.5 text-xs font-medium text-risk-extreme"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </label>
  );
});