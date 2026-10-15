import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '@/api';
import type { EventListItem } from '@/types';

/**
 * Clé de requête partagée : la salle de crise (sélection automatique) et le
 * sélecteur d'événement (badge « En direct ») lisent la même entrée de cache.
 */
export const LIVE_CYCLONE_KEY = ['events', 'live-cyclone'] as const;

/** Rafraîchissement aligné sur le scrutin de la salle de crise (5 min). */
export const LIVE_CYCLONE_REFRESH_MS = 5 * 60_000;

/**
 * Cyclone ACTIF le plus récent exposé par l'API — la cible « en direct » de la
 * salle de crise. Renvoie la requête complète pour laisser l'appelant décider
 * quand elle a répondu (`isFetched`) avant d'enclencher une sélection.
 */
export function useLiveCycloneQuery() {
  return useQuery({
    queryKey: LIVE_CYCLONE_KEY,
    queryFn: () => eventsApi.liveCyclone(),
    staleTime: 30_000,
    refetchInterval: LIVE_CYCLONE_REFRESH_MS,
  });
}

/** Cyclone ACTIF le plus récent, ou null si aucun n'est en cours. */
export function useLiveCyclone(): EventListItem | null {
  return useLiveCycloneQuery().data?.data?.[0] ?? null;
}
