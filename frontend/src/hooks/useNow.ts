import { useEffect, useState } from 'react';

/**
 * Horloge partagée : retourne l'instant courant et le rafraîchit périodiquement.
 *
 * Évite d'appeler `Date.now()` pendant le rendu (impur, interdit par le React
 * Compiler) tout en permettant d'afficher un âge de donnée (« il y a 42 min »)
 * qui reste juste même si la page reste ouverte longtemps.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}