import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamAiChat } from './ai-stream';
import { ApiClientError } from './client';

/**
 * `refreshSession` est la seule dépendance réseau du chemin de reprise 401 :
 * elle est doublée ici pour prouver que le flux relance la requête avec le
 * nouveau jeton, puis remonte l'échec si le renouvellement échoue.
 */
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    refreshSession: vi.fn(),
  };
});

import { refreshSession } from './client';

const refreshSessionMock = vi.mocked(refreshSession);

/**
 * Construit une fausse réponse HTTP dont le corps est un flux de texte, pour
 * éprouver la lecture incrémentale sans réseau.
 */
function sseResponse(chunks: string[], status = 200, headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream', ...headers },
  });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  refreshSessionMock.mockReset();
});

describe('streamAiChat', () => {
  it('émet les métadonnées puis les morceaux, et renvoie la conversation', async () => {
    // Découpage volontairement au milieu d'une frame : la lecture doit être
    // incrémentale et ne pas dépendre d'un morceau réseau bien aligné.
    const payload =
      frame('meta', {
        conversationId: 'conv-1',
        internalSources: ['getPriorityCommunes'],
        dataTimestamp: '2026-10-14T03:07:26.214Z',
        limitations: [],
      }) +
      frame('chunk', { text: 'Les communes ' }) +
      frame('chunk', { text: 'prioritaires sont listées.' }) +
      frame('done', { conversationId: 'conv-1' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([payload.slice(0, 40), payload.slice(40)])));

    const onMeta = vi.fn();
    const received: string[] = [];

    const result = await streamAiChat('jeton', { message: 'Bonjour' }, {
      onChunk: (text) => received.push(text),
      onMeta,
    });

    expect(result.conversationId).toBe('conv-1');
    expect(received.join('')).toBe('Les communes prioritaires sont listées.');
    expect(onMeta).toHaveBeenCalledWith(
      expect.objectContaining({ internalSources: ['getPriorityCommunes'] }),
    );
  });

  it('demande bien le flux et envoie le jeton', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([frame('meta', { conversationId: 'c', internalSources: [], dataTimestamp: null, limitations: [] }), frame('done', { conversationId: 'c' })]),
      ),
    );

    await streamAiChat('jeton', { message: 'Bonjour', conversationId: 'c' }, { onChunk: () => {} });

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/ai/chat');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'Bonjour',
      conversationId: 'c',
      stream: true,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
  });

  it('convertit une erreur HTTP en ApiClientError (statut, Retry-After)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Trop de requêtes vers l'assistant." }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '900' },
        }),
      ),
    );

    await expect(
      streamAiChat('jeton', { message: 'Bonjour' }, { onChunk: () => {} }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Trop de requêtes vers l'assistant.",
      retryAfter: 900,
    });
  });

  it('remonte une erreur 401 si le jeton ne peut pas être renouvelé', async () => {
    refreshSessionMock.mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Jeton d'accès expiré." }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      streamAiChat('jeton', { message: 'Bonjour' }, { onChunk: () => {} }),
    ).rejects.toMatchObject({ status: 401, message: "Jeton d'accès expiré." });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    // Une seule tentative : pas de boucle 401 → refresh → 401.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('reprend la lecture avec le jeton renouvelé après un 401', async () => {
    const goodPayload =
      frame('meta', { conversationId: 'c', internalSources: [], dataTimestamp: null, limitations: [] }) +
      frame('chunk', { text: 'Réponse.' }) +
      frame('done', { conversationId: 'c' });

    refreshSessionMock.mockResolvedValueOnce('jeton-frais');
    const fetchMock = vi
      .fn()
      // Première tentative : jeton expiré.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Jeton d'accès expiré." }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // Reprise : flux normal.
      .mockResolvedValueOnce(sseResponse([goodPayload]));
    vi.stubGlobal('fetch', fetchMock);

    const received: string[] = [];
    const result = await streamAiChat('jeton', { message: 'Bonjour' }, {
      onChunk: (text) => received.push(text),
    });

    expect(result.conversationId).toBe('c');
    expect(received.join('')).toBe('Réponse.');
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);

    // La reprise porte bien le jeton renouvelé.
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer jeton-frais',
    );
  });

  it('remonte un événement error du flux', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          frame('meta', { conversationId: 'c', internalSources: [], dataTimestamp: null, limitations: [] }),
          frame('chunk', { text: 'Début' }),
          frame('error', { message: 'Fournisseur IA indisponible', status: 502 }),
        ]),
      ),
    );

    const error = await streamAiChat('jeton', { message: 'Bonjour' }, { onChunk: () => {} })
      .then(() => null)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 502, message: 'Fournisseur IA indisponible' });
  });

  it('signale une réponse interrompue avant les métadonnées', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([frame('chunk', { text: 'Coupé' })])));

    await expect(
      streamAiChat('jeton', { message: 'Bonjour' }, { onChunk: () => {} }),
    ).rejects.toMatchObject({ status: 0 });
  });
});
