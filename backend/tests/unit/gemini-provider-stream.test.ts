import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
}));

// Le SDK Gemini est remplacé par un double : ces tests portent sur la logique
// du fournisseur (morceaux, délai d'inactivité, reprise), pas sur le réseau.
vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel(): unknown {
      return {
        generateContent: sdk.generateContent,
        generateContentStream: sdk.generateContentStream,
      };
    }
  }

  return {
    GoogleGenerativeAI,
    HarmCategory: {
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  };
});

import { env } from '../../src/config/env';
import { GeminiAIProvider } from '../../src/services/gemini.provider';
import type { AIRequest } from '../../src/types/ai.types';

const request: AIRequest = {
  question: 'Quelles sont les communes prioritaires ?',
  systemPrompt: 'Tu es un assistant.',
  context: {
    toolResults: [{ tool: 'getPriorityCommunes', result: [{ id: 'x' }] }],
    dataTimestamp: '2026-10-14T03:07:26.214Z',
    history: [{ role: 'user', content: 'Bonjour' }],
  },
};

/** Faux flux de texte : `{ text: () => string }` comme les morceaux du SDK. */
function streamOf(texts: string[]): AsyncGenerator<{ text: () => string }> {
  return (async function* () {
    for (const text of texts) {
      yield { text: () => text };
    }
  })();
}

/** Flux qui ne produit jamais rien : sert à éprouver le délai d'inactivité. */
function hangingStream(): AsyncGenerator<{ text: () => string }> {
  return (async function* () {
    await new Promise(() => undefined);
    yield { text: () => '' };
  })();
}

async function collect(generator: AsyncGenerator<string, void, unknown>): Promise<string> {
  let out = '';
  for await (const chunk of generator) out += chunk;
  return out;
}

const provider = new GeminiAIProvider('clef-de-test', 'gemini-test');

beforeEach(() => {
  sdk.generateContent.mockReset();
  sdk.generateContentStream.mockReset();
});

afterEach(() => {
  env.GEMINI_TIMEOUT_MS = 30000;
  env.GEMINI_MAX_RETRIES = 2;
});

describe('GeminiAIProvider - réponse complète', () => {
  it('transmet les seuils de sûreté explicites au modèle', async () => {
    sdk.generateContent.mockResolvedValue({ response: { text: () => 'Bonjour' } });

    const result = await provider.generateAnswer(request);

    expect(result.answer).toBe('Bonjour');
    const call = sdk.generateContent.mock.calls[0][0] as Record<string, unknown>;
    const safety = call.safetySettings as Array<{ category: string; threshold: string }>;
    expect(safety).toHaveLength(4);
    expect(safety.map((s) => s.category)).toContain('HARM_CATEGORY_DANGEROUS_CONTENT');
    expect(safety.every((s) => s.threshold === 'BLOCK_MEDIUM_AND_ABOVE')).toBe(true);
  });
});

describe('GeminiAIProvider - réponse en flux', () => {
  it('émet les morceaux dans l’ordre et ignore les morceaux vides', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: streamOf(['Les communes ', '', 'prioritaires ', 'sont listées.']),
    });

    const answer = await collect(provider.generateAnswerStream(request));

    expect(answer).toBe('Les communes prioritaires sont listées.');
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('applique les seuils de sûreté au flux', async () => {
    sdk.generateContentStream.mockResolvedValue({ stream: streamOf(['ok']) });

    await collect(provider.generateAnswerStream(request));

    const call = sdk.generateContentStream.mock.calls[0][0] as Record<string, unknown>;
    const safety = call.safetySettings as Array<{ category: string }>;
    expect(safety).toHaveLength(4);
    expect(safety.map((s) => s.category)).toContain('HARM_CATEGORY_HARASSMENT');
  });

  it('échoue en 504 quand le flux reste inactif au-delà du délai', async () => {
    env.GEMINI_TIMEOUT_MS = 50;
    sdk.generateContentStream.mockResolvedValue({ stream: hangingStream() });

    await expect(collect(provider.generateAnswerStream(request))).rejects.toMatchObject({
      statusCode: 504,
    });
    // Un délai dépassé n'est pas une erreur transitoire : une seule tentative.
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('reprend une fois avant tout morceau si l’erreur est transitoire', async () => {
    sdk.generateContentStream
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ stream: streamOf(['Réponse ', 'récupérée.']) });

    const answer = await collect(provider.generateAnswerStream(request));

    expect(answer).toBe('Réponse récupérée.');
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas un flux déjà partiellement émis', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: (async function* () {
        yield { text: () => 'Début ' };
        throw new Error('fetch failed');
      })(),
    });

    await expect(collect(provider.generateAnswerStream(request))).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });
});

describe('GeminiAIProvider - erreurs non transitoires', () => {
  it('signale un modèle retiré sans réessayer (502)', async () => {
    sdk.generateContent.mockRejectedValue(
      new Error('[404 Not Found] models/gemini-2.0-flash is no longer available'),
    );

    await expect(provider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Modèle IA indisponible'),
    });
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });
});
