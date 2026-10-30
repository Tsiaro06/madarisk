import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  /** Options passées à `getGenerativeModel` (outils déclarés, etc.). */
  modelParams: [] as Array<Record<string, unknown>>,
}));

// Le SDK Gemini est remplacé par un double : ces tests portent sur la logique
// du fournisseur (morceaux, délai d'inactivité, reprise), pas sur le réseau.
vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel(params: Record<string, unknown>): unknown {
      sdk.modelParams.push(params);
      return {
        generateContent: sdk.generateContent,
        generateContentStream: sdk.generateContentStream,
      };
    }
  }

  return {
    GoogleGenerativeAI,
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
      NUMBER: 'NUMBER',
    },
    FunctionCallingMode: {
      MODE_UNSPECIFIED: 'MODE_UNSPECIFIED',
      AUTO: 'AUTO',
      ANY: 'ANY',
      NONE: 'NONE',
    },
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
import { GeminiAIProvider, parseProviderRetryAfter } from '../../src/services/gemini.provider';
import type { AIAnswerStep, AIRequest, AIToolDeclaration } from '../../src/types/ai.types';

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

/** Flux de morceaux déjà formés (texte, appels d'outils, morceau filtré). */
function chunkStream<T>(chunks: T[]): AsyncGenerator<T> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
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
  sdk.modelParams.length = 0;
  // La quarantaine des modèles est mémoire du fournisseur : sans remise à zéro,
  // un test qui épuise un modèle laisserait les suivants devant un 503 immédiat.
  provider.resetModelHealth();
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

/**
 * Message d'un quota épuisé, tel que Google le renvoie réellement (relevé sur
 * un run live : forfait gratuit, plafond **journalier**).
 */
const QUOTA_MESSAGE =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. ' +
  '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash\n' +
  'Please retry in 6h30m53.559982807s.';

describe('GeminiAIProvider - quota du fournisseur (429)', () => {
  it('lit le délai annoncé en clair par le fournisseur', () => {
    expect(parseProviderRetryAfter(new Error(QUOTA_MESSAGE))).toBe(23454);
  });

  it('lit aussi le champ structuré retryDelay', () => {
    expect(parseProviderRetryAfter(new Error('[429] {"retryDelay":"23453s"}'))).toBe(23453);
  });

  it('n’invente aucun délai quand il est illisible', () => {
    expect(parseProviderRetryAfter(new Error('[429 Too Many Requests] quota exceeded'))).toBeNull();
  });

  it('ne réessaie pas un quota épuisé et annonce le délai (Retry-After)', async () => {
    sdk.generateContent.mockRejectedValue(new Error(QUOTA_MESSAGE));

    await expect(provider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 23454,
    });
    // Aucune relance : un quota journalier ne se rétablit pas en 500 ms.
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });

  it('propage le délai de quota sur le chemin en flux, sans relance', async () => {
    sdk.generateContentStream.mockRejectedValue(new Error(QUOTA_MESSAGE));

    await expect(collect(provider.generateAnswerStream(request))).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 23454,
    });
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });
});

describe('GeminiAIProvider - repli entre modèles', () => {
  const fallbackProvider = new GeminiAIProvider('clef-de-test', 'gemini-principal', [
    'gemini-repli',
    'gemini-dernier',
  ]);

  beforeEach(() => {
    fallbackProvider.resetModelHealth();
  });

  /** Modèles réellement demandés au SDK, dans l'ordre des tentatives. */
  function requestedModels(): unknown[] {
    return sdk.modelParams.map((params) => params.model);
  }

  it('replie sur le suivant quand le quota du principal est épuisé', async () => {
    sdk.generateContent
      .mockRejectedValueOnce(new Error(QUOTA_MESSAGE))
      .mockResolvedValueOnce({ response: { text: () => 'Réponse du repli' } });

    const result = await fallbackProvider.generateAnswer(request);

    expect(result.answer).toBe('Réponse du repli');
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli']);
  });

  it('replie aussi quand le principal a été retiré par l’éditeur', async () => {
    sdk.generateContent
      .mockRejectedValueOnce(
        new Error('[404 Not Found] models/gemini-principal is no longer available'),
      )
      .mockResolvedValueOnce({ response: { text: () => 'Réponse du repli' } });

    await expect(fallbackProvider.generateAnswer(request)).resolves.toMatchObject({
      answer: 'Réponse du repli',
    });
  });

  it('essaie tous les replis avant d’échouer, en gardant le délai du fournisseur', async () => {
    sdk.generateContent.mockRejectedValue(new Error(QUOTA_MESSAGE));

    await expect(fallbackProvider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 23454,
    });
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli', 'gemini-dernier']);
  });

  it('ne bascule pas sur une panne de service', async () => {
    env.GEMINI_MAX_RETRIES = 0;
    sdk.generateContent.mockRejectedValue(new Error('[500 Internal Server Error] oops'));

    await expect(fallbackProvider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 502,
    });
    // Panne de service, non imputable au modèle : aucun repli.
    expect(requestedModels()).toEqual(['gemini-principal']);
  });

  it('replie quand le fournisseur annonce une surcharge du modèle', async () => {
    env.GEMINI_MAX_RETRIES = 0;
    sdk.generateContent
      .mockRejectedValueOnce(
        new Error('[503 Service Unavailable] This model is currently experiencing high demand.'),
      )
      .mockResolvedValueOnce({ response: { text: () => 'Réponse du repli' } });

    const result = await fallbackProvider.generateAnswer(request);

    expect(result.answer).toBe('Réponse du repli');
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli']);
  });

  it('replie sur le chemin en flux tant que rien n’a été émis', async () => {
    sdk.generateContentStream
      .mockRejectedValueOnce(new Error(QUOTA_MESSAGE))
      .mockResolvedValueOnce({ stream: streamOf(['Réponse ', 'du repli.']) });

    const answer = await collect(fallbackProvider.generateAnswerStream(request));

    expect(answer).toBe('Réponse du repli.');
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli']);
  });

  it('ne rejoue pas une surcharge sur le même modèle avant de replier', async () => {
    // Surcharge observée en direct : ~30 s avant le 503. La rejouer sur le même
    // modèle triplait l'attente pour rien, avant même d'essayer un repli.
    sdk.generateContent
      .mockRejectedValueOnce(
        new Error('[503 Service Unavailable] This model is currently experiencing high demand.'),
      )
      .mockResolvedValueOnce({ response: { text: () => 'Réponse du repli' } });

    const result = await fallbackProvider.generateAnswer(request);

    expect(result.answer).toBe('Réponse du repli');
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli']);
  });

  it('saute un modèle en quarantaine au tour suivant', async () => {
    sdk.generateContent
      .mockRejectedValueOnce(
        new Error('[503 Service Unavailable] This model is currently experiencing high demand.'),
      )
      .mockResolvedValue({ response: { text: () => 'Réponse du repli' } });

    await fallbackProvider.generateAnswer(request);
    sdk.generateContent.mockClear();
    sdk.modelParams.length = 0;

    await fallbackProvider.generateAnswer(request);

    // Le principal reste saturé : inutile de repayer son attente à chaque question.
    expect(requestedModels()).toEqual(['gemini-repli']);
  });

  it('échoue vite quand tous les modèles sont en quarantaine', async () => {
    sdk.generateContent.mockRejectedValue(
      new Error('[503 Service Unavailable] This model is currently experiencing high demand.'),
    );
    await expect(fallbackProvider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 502,
    });

    sdk.generateContent.mockClear();
    sdk.modelParams.length = 0;

    // Tous écartés : une erreur immédiate et datée vaut mieux qu'une attente
    // de plusieurs minutes qui finirait par la même erreur.
    await expect(fallbackProvider.generateAnswer(request)).rejects.toMatchObject({
      statusCode: 503,
      retryAfterSeconds: expect.any(Number),
    });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('borne l’ouverture du flux et bascule sur un repli', async () => {
    env.GEMINI_TIMEOUT_MS = 50;
    sdk.generateContentStream
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ stream: streamOf(['Réponse ', 'du repli.']) });

    const answer = await collect(fallbackProvider.generateAnswerStream(request));

    expect(answer).toBe('Réponse du repli.');
    expect(requestedModels()).toEqual(['gemini-principal', 'gemini-repli']);
  });

  it('ne change pas de modèle après un premier morceau émis', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: (async function* () {
        yield { text: (): string => 'Début ' };
        throw new Error(QUOTA_MESSAGE);
      })(),
    });

    await expect(collect(fallbackProvider.generateAnswerStream(request))).rejects.toMatchObject({
      statusCode: 429,
    });
    // Changer de modèle après coup dupliquerait le texte déjà émis.
    expect(requestedModels()).toEqual(['gemini-principal']);
  });
});

const toolDeclarations: AIToolDeclaration[] = [
  {
    name: 'searchTerritories',
    description: 'Recherche de districts et de communes par nom.',
    parameters: {
      type: 'object',
      properties: { q: { type: 'string', description: 'Nom recherché.' } },
      required: ['q'],
    },
  },
  { name: 'getDashboardSummary', description: 'Synthèse globale.' },
];

/** Morceau porteur d'un appel d'outil, comme ceux du SDK. */
function toolCallChunk(calls: Array<{ name: string; args?: object }>) {
  return {
    text: (): string => {
      throw new Error('pas de texte dans ce morceau');
    },
    functionCalls: () => calls,
  };
}

/** Morceau dont les appels d'outils lèvent (candidat filtré par la sûreté). */
function blockedChunk(text: string) {
  return {
    text: () => text,
    functionCalls: () => {
      throw new Error('candidat bloqué');
    },
  };
}

async function collectSteps(
  generator: AsyncGenerator<AIAnswerStep, void, unknown>,
): Promise<AIAnswerStep[]> {
  const steps: AIAnswerStep[] = [];
  for await (const step of generator) steps.push(step);
  return steps;
}

describe('GeminiAIProvider - function calling', () => {
  it('déclare les outils et le mode AUTO quand la requête en fournit', async () => {
    sdk.generateContentStream.mockResolvedValue({ stream: streamOf(['ok']) });

    await collectSteps(
      provider.generateAnswerStreamWithTools({ ...request, tools: toolDeclarations }),
    );

    const params = sdk.modelParams[0];
    const tools = params.tools as Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
    expect(tools).toHaveLength(1);
    expect(tools[0].functionDeclarations.map((d) => d.name)).toEqual([
      'searchTerritories',
      'getDashboardSummary',
    ]);
    expect(tools[0].functionDeclarations[0].parameters).toMatchObject({
      type: 'OBJECT',
      properties: { q: { type: 'STRING' } },
      required: ['q'],
    });
    expect(params.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
  });

  it('ne déclare aucun outil si la requête n’en porte pas', async () => {
    sdk.generateContentStream.mockResolvedValue({ stream: streamOf(['ok']) });

    await collect(provider.generateAnswerStream(request));

    expect(sdk.modelParams[0].tools).toBeUndefined();
    expect(sdk.modelParams[0].toolConfig).toBeUndefined();
  });

  it('émet un pas « toolCalls » quand le modèle réclame des outils', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: chunkStream([
        toolCallChunk([{ name: 'searchTerritories', args: { q: 'Vohimarina' } }]),
      ]),
    });

    const steps = await collectSteps(
      provider.generateAnswerStreamWithTools({ ...request, tools: toolDeclarations }),
    );

    expect(steps).toEqual([
      { type: 'toolCalls', calls: [{ name: 'searchTerritories', args: { q: 'Vohimarina' } }] },
    ]);
  });

  it('neutralise un morceau dont les appels d’outils sont filtrés par la sûreté', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: chunkStream([blockedChunk('Réponse '), blockedChunk('normale.')]),
    });

    const steps = await collectSteps(
      provider.generateAnswerStreamWithTools({ ...request, tools: toolDeclarations }),
    );

    // Un filtrage de sûreté n'est pas une demande d'outil : le texte passe.
    expect(steps).toEqual([
      { type: 'text', text: 'Réponse ' },
      { type: 'text', text: 'normale.' },
    ]);
  });

  it('ignore un appel d’outil reçu après du texte déjà émis', async () => {
    sdk.generateContentStream.mockResolvedValue({
      stream: chunkStream([
        { text: (): string => 'Voici la réponse. ' },
        toolCallChunk([{ name: 'getDashboardSummary' }]),
      ]),
    });

    const steps = await collectSteps(
      provider.generateAnswerStreamWithTools({ ...request, tools: toolDeclarations }),
    );

    expect(steps).toEqual([{ type: 'text', text: 'Voici la réponse. ' }]);
  });
});
