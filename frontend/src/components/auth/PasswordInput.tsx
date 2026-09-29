import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/**
 * Champ mot de passe avec bascule d'affichage.
 *
 * Le masque reste le comportement par défaut : le champ est rendu en
 * `type="password"` tant que l'utilisateur n'a pas explicitement demandé la
 * visibilité. La valeur n'est jamais persistée — la case « Se souvenir de
 * moi » ne mémorise que l'adresse e-mail.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, className, id, disabled, ...props }, ref) {
    const generatedId = useId();
    const inputId = id || props.name || generatedId;
    const errorId = `${inputId}-error`;
    const { 'aria-describedby': ariaDescribedBy, ...rest } = props;

    const [revealed, setRevealed] = useState(false);
    const describedBy =
      [ariaDescribedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="font-medium text-ink" htmlFor={inputId}>
          {label}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={revealed ? 'text' : 'password'}
            disabled={disabled}
            className={cn(
              'h-11 w-full rounded-xl border border-line bg-surface px-3 pr-11 text-ink outline-none transition',
              'placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15',
              'disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70',
              error && 'border-risk-extreme focus:border-risk-extreme focus:ring-risk-extreme/20',
              className,
            )}
            {...rest}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />

          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            disabled={disabled}
            aria-controls={inputId}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={revealed}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition',
              'hover:bg-brand-soft hover:text-brand-deep',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {error ? (
          <span
            id={errorId}
            className="flex items-start gap-1.5 text-xs font-medium text-risk-extreme"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);
