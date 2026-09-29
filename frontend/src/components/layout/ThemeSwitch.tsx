import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore, type Theme } from '@/stores/themeStore';

interface ThemeSwitchProps {
  /** Masque le libellé « Light / Dark Mode » (versions étroites). */
  showLabel?: boolean;
  className?: string;
}

/**
 * Interrupteur clair / sombre — état global (`themeStore`), donc partagé avec la
 * sidebar et avec l'ensemble de l'application (classe `dark` sur <html>).
 */
export function ThemeSwitch({ showLabel = true, className }: ThemeSwitchProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const dark = theme === 'dark';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {showLabel ? (
        <span className="text-[10.5px] font-medium tracking-wide text-[var(--sb-muted)]">
          {dark ? 'Dark' : 'Light'} Mode
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        onClick={toggle}
        aria-label={labelFor(theme)}
        title={labelFor(theme)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300',
          dark
            ? 'border-[var(--sb-accent)]/40 bg-[var(--sb-accent)]/25'
            : 'border-[var(--sb-line)] bg-[var(--sb-chip)]',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full transition-[left,background-color] duration-300',
            dark
              ? 'left-[22px] bg-white text-[var(--sb-accent)]'
              : 'left-[2px] bg-[var(--sb-accent)] text-white',
          )}
        >
          {dark ? <Moon className="size-2.5" aria-hidden /> : <Sun className="size-2.5" aria-hidden />}
        </span>
      </button>
    </div>
  );
}

function labelFor(theme: Theme) {
  return theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
}
