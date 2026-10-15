import { ApiClientError } from './client';
import { parseSseFrames, type SseFrame } from '@/lib/sse';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

/** Métadonnées du tour, émises en tête de flux (outils déjà exécutés côté serveur). */
export interface AiStreamMeta {
  conversationId: string;
  internalSources: string[];
  dataTimestamp: string | null;
  limitations: string[];
}

export interface AiStreamHandlers {
  /** Appelé une fois, avant le premier morceau de texte. */
  onMeta?: (meta: AiStreamMeta) => void;
  /** Appelé pour chaque morceau de réponse, dans l'ordre. */
  onChunk: (text: string) => void;
  /** Permet d'interrompre la lecture (démontage du composant, nouvelle question). */
  signal?: AbortSignal;
}

/**
 * Envoie une question et lit la réponse en flux (`POST /ai/chat` avec
 * `stream: true`).
 *
 * `fetch` est utilisé plutôt que le client axios : seul `fetch` expose le corps
 * de la réponse au fil de l'eau, ce dont dépend le streaming. Les erreurs sont
 * tout de même converties en `ApiClientError` pour que l'appelant traite un
 * échec de la même façon sur les deux chemins (statut, `errors[]`, `Retry-After`).
 *
 * Le cas « connexion coupée après le début du flux » est signalé avec le statut
 * `0` : il n'y a pas de statut HTTP à rapporter, la réponse était déjà en 200.
 */
export async function streamAiChat(
  accessToken: string | null,
  body: { message: string; conversationId?: string },
  handlers: AiStreamHandlers,
): Promise<{ conversationId: string }> {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    throw await toApiClientError(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let conversationId = '';

  const handleFrame = (frame: SseFrame): { message: string; status: number } | null => {
    if (frame.event === 'meta') {
      const meta = JSON.parse(frame.data) as AiStreamMeta;
      conversationId = meta.conversationId;
      handlers.onMeta?.(meta);
      return null;
    }
    if (frame.event === 'chunk') {
      handlers.onChunk((JSON.parse(frame.data) as { text: string }).text);
      return null;
    }
    if (frame.event === 'done') {
      conversationId = (JSON.parse(frame.data) as { conversationId: string }).conversationId;
      return null;
    }
    if (frame.event === 'error') {
      const payload = JSON.parse(frame.data) as { message?: string; status?: number };
      return {
        message: payload.message ?? "Échec de l'assistant",
        status: payload.status ?? 502,
      };
    }
    return null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    const { frames, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      const failure = handleFrame(frame);
      if (failure) throw new ApiClientError(failure.message, failure.status);
    }
  }

  if (!conversationId) {
    throw new ApiClientError("Réponse de l'assistant interrompue", 0);
  }
  return { conversationId };
}

async function toApiClientError(res: Response): Promise<ApiClientError> {
  let message = `Erreur de l'assistant (${res.status})`;
  try {
    const payload = (await res.json()) as { message?: string };
    if (payload?.message) message = payload.message;
  } catch {
    // Corps non JSON (proxy, coupure réseau) : le message générique suffit.
  }

  const retryAfterRaw = res.headers.get('Retry-After');
  const retryAfter = retryAfterRaw === null ? undefined : Number(retryAfterRaw);

  return new ApiClientError(
    message,
    res.status,
    undefined,
    retryAfter !== undefined && Number.isFinite(retryAfter) ? retryAfter : undefined,
  );
}
