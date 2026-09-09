import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || props.name;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label ? <span className="font-medium text-ink">{label}</span> : null}
      <input
        id={inputId}
        className={cn(
          'h-10 rounded-lg border border-brand/20 bg-white px-3 text-ink outline-none transition',
          'placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20',
          error && 'border-risk-extreme focus:border-risk-extreme focus:ring-risk-extreme/20',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-risk-extreme">{error}</span> : null}
    </label>
  );
}
