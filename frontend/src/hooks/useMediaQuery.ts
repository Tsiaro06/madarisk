import { useCallback, useSyncExternalStore } from 'react';

/**
 * Suit une media query et rend son état.
 *
 * Réservé aux cas où une décision ne peut pas être purement CSS : le sidebar
 * alterne tiroir hors écran (mobile) et colonne de grille (desktop), et son
 * icône du navbar doit ouvrir l'un ou masquer l'autre selon la largeur réelle.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
