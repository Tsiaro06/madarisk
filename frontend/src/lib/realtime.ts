import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { parseSseFrames } from './sse';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export { parseSseFrames };
export type { SseFrame } from './sse';


const MAX_RETRY_DELAY_MS = 30_000;

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 2_000 * 2 ** Math.min(attempt, 4));
}

/**
 * Queries TanStack à invalider pour un type d'événement temps réel. Fonction
 * pure (table de correspondance testable sans réseau ni DOM) :
 * - `alert.*` : le fil d'alertes ;
 * - `detection.run` : la détection crée des événements et bouge le tableau de bord ;
 * - `cyclone.sync` : un cycle cyclone a persisté trajectoire, coloration et
 *   alertes — on rafraîchit événements, détail/trajectoire/coloration (`event`),
 *   tableau de bord, alertes et l'événement actif affiché.
 */
export function invalidationKeysForEvent(
  event: string,
): readonly (readonly string[])[] {
  if (event.startsWith('alert.')) return [['alerts']];
  if (event === 'detection.run') return [['events'], ['dashboard']];
  if (event === 'cyclone.sync') {
    return [['events'], ['event'], ['dashboard'], ['alerts'], ['active-event']];
  }
  return [];
}

/**
 * Lit GET /stream (SSE) avec l'accessToken courant et invalide les queries
 * TanStack concernées. EventSource du navigateur ne supporte pas l'en-tête
 * Authorization : on lit le flux via fetch + reader. Se reconnecte avec
 * backoff (max 30 s) ; le changement de token (refresh) relance l'écoute.
 */
export function RealtimeListener() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    if (!bootstrapped || !accessToken) return;

    const controller = new AbortController();
    let stopped = false;
    let attempt = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (event: string) => {
      for (const queryKey of invalidationKeysForEvent(event)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const readStream = async (): Promise<void> => {
      const res = await fetch(`${API_BASE}/stream`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Flux SSE indisponible (${res.status})`);
      }

      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) dispatch(frame.event);
      }
    };

    const run = async () => {
      while (!stopped) {
        try {
          await readStream();
        } catch {
          if (stopped || controller.signal.aborted) return;
        }
        attempt += 1;
        await new Promise<void>((resolve) => {
          retryTimeout = setTimeout(resolve, retryDelayMs(attempt));
        });
      }
    };

    void run();

    return () => {
      stopped = true;
      controller.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [queryClient, accessToken, bootstrapped]);

  return null;
}
