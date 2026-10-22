import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/**
 * Barre de progression globale.
 *
 * Complète les squelettes : ceux-ci signalent *quelles* zones attendent des
 * données, cette barre signale qu'une requête est en vol au niveau de
 * l'application entière (y compris les rafraîchissements automatiques).
 *
 * Elle est volontairement discrète et non bloquante : elle n'intercepte
 * jamais le pointeur.
 */
export function GlobalProgressBar({ className }: { className?: string }) {
  const fetching = useIsFetching();
  const active = fetching > 0;

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden',
        className,
      )}
    >
      <div
        className={cn(
          'h-full w-full',
          active ? 'progress-indeterminate' : 'opacity-0',
        )}
      />
    </div>
  );
}
