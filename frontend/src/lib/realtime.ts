import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Découpe un tampon de flux SSE en frames complètes (`event:` / `data:`,
 * séparées par une ligne vide). Les commentaires (: ping) et les frames sans
 * `data:` sont ignorés. Fonction pure — testable sans réseau.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer;
  let idx: number;

  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);

    let event = 'message';
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }

    if (dataLines.length > 0) frames.push({ event, data: dataLines.join('\n') });
  }

  return { frames, rest };
}

const MAX_RETRY_DELAY_MS = 30_000;

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 2_000 * 2 ** Math.min(attempt, 4));
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
      if (event.startsWith('alert.')) {
        void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      } else if (event === 'detection.run') {
        // La détection crée des événements et change le tableau de bord.
        void queryClient.invalidateQueries({ queryKey: ['events'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
