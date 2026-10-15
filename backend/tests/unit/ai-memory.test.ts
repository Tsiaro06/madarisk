import { describe, it, expect } from 'vitest';
import { buildMemory, computeDataTimestamp } from '../../src/services/ai.service';
import type { AIMessageRole, AIMessageRow, AIToolResult } from '../../src/types/ai.types';

/**
 * Contexte de l'assistant IA : historique de conversation et datation des
 * données.
 *
 * Deux défauts corrigés ici, tous deux invisibles côté utilisateur mais bien
 * réels :
 *  1. l'historique n'était jamais réinjecté — l'assistant ne se souvenait
 *     d'aucun échange, alors que les messages étaient bien persistés ;
 *  2. `pg` renvoie les `timestamptz` en objet `Date`, or la collecte ne
 *     reconnaissait que les chaînes : `dataTimestamp` restait toujours `null`.
 */

let seq = 0;

function message(role: AIMessageRole, content: string): AIMessageRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    conversationId: '00000000-0000-4000-8000-000000000000',
    role,
    content,
    tokenCount: null,
    metadata: null,
    createdAt: '2026-10-14T00:00:00.000Z',
  };
}

function tool(tool: string, result: unknown): AIToolResult {
  return { tool, result };
}

describe('ai.service — computeDataTimestamp', () => {
  it('retient un horodatage renvoyé en objet Date (cas de pg sur timestamptz)', () => {
    const result = computeDataTimestamp([
      tool('getPriorityCommunes', {
        items: [{ commune: 'Vohimarina', assessedAt: new Date('2026-10-14T03:07:26.000Z') }],
      }),
    ]);

    expect(result).toBe('2026-10-14T03:07:26.000Z');
  });

  it('retient aussi un horodatage renvoyé en chaîne', () => {
    const result = computeDataTimestamp([
      tool('getPublishedAlerts', [{ publishedAt: '2026-10-13T10:00:00.000Z' }]),
    ]);

    expect(result).toBe('2026-10-13T10:00:00.000Z');
  });

  it('retient la date la plus récente parmi toutes les sources', () => {
    const result = computeDataTimestamp([
      tool('getActiveEvents', { items: [{ startedAt: new Date('2026-10-10T00:00:00.000Z') }] }),
      tool('getLatestWeather', { observedAt: '2026-10-14T06:00:00.000Z' }),
      tool('getPublishedAlerts', { publishedAt: new Date('2026-10-12T00:00:00.000Z') }),
    ]);

    expect(result).toBe('2026-10-14T06:00:00.000Z');
  });

  it('ignore une chaîne ISO portée par une clé qui n est pas une date', () => {
    const result = computeDataTimestamp([
      tool('searchTerritories', [{ name: '2026-10-14T00:00:00.000Z' }]),
    ]);

    expect(result).toBeNull();
  });

  it('ignore un objet Date invalide', () => {
    const result = computeDataTimestamp([
      tool('getCommuneLatestRisk', { assessedAt: new Date('pas une date') }),
    ]);

    expect(result).toBeNull();
  });

  it('renvoie null quand aucun outil ne renvoie de date', () => {
    expect(computeDataTimestamp([])).toBeNull();
    expect(computeDataTimestamp([tool('getDashboardSummary', { items: [], total: 0 })])).toBeNull();
  });

  it('descend dans les objets imbriqués et les tableaux', () => {
    const result = computeDataTimestamp([
      tool('getEventSummary', {
        event: { statistics: { last: { updatedAt: new Date('2026-10-11T08:30:00.000Z') } } },
      }),
    ]);

    expect(result).toBe('2026-10-11T08:30:00.000Z');
  });

  it('ne descend pas au-delà de la profondeur 3', () => {
    const result = computeDataTimestamp([
      tool('tropProfond', {
        a: { b: { c: { d: { assessedAt: new Date('2026-10-14T03:07:26.000Z') } } } },
      }),
    ]);

    expect(result).toBeNull();
  });
});

describe('ai.service — buildMemory', () => {
  it('traduit les rôles persistés et ignore les tours d outil', () => {
    const history = buildMemory([
      message('UTILISATEUR', 'Question 1'),
      message('OUTIL', '{"tool":"getActiveEvents","result":[]}'),
      message('ASSISTANT', 'Réponse 1'),
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'Question 1' },
      { role: 'model', content: 'Réponse 1' },
    ]);
  });

  it('renvoie un historique vide sans message', () => {
    expect(buildMemory([])).toEqual([]);
  });

  it('fusionne deux tours consécutifs de même rôle', () => {
    const history = buildMemory([
      message('UTILISATEUR', 'Question 1'),
      message('UTILISATEUR', 'Question 2'),
      message('ASSISTANT', 'Réponse'),
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'Question 1\nQuestion 2' },
      { role: 'model', content: 'Réponse' },
    ]);
  });

  it('ne laisse jamais l historique commencer par un tour du modèle', () => {
    const history = buildMemory([
      message('ASSISTANT', 'Réponse orpheline'),
      message('UTILISATEUR', 'Question 1'),
      message('ASSISTANT', 'Réponse 1'),
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'Question 1' },
      { role: 'model', content: 'Réponse 1' },
    ]);
  });

  it('borne l historique aux 12 derniers tours, en finissant par le plus récent', () => {
    const messages: AIMessageRow[] = [];
    for (let index = 1; index <= 20; index += 1) {
      messages.push(message('UTILISATEUR', `Question ${index}`));
      messages.push(message('ASSISTANT', `Réponse ${index}`));
    }

    const history = buildMemory(messages);

    expect(history.length).toBe(12);
    expect(history[0].role).toBe('user');
    expect(history[history.length - 1]).toEqual({ role: 'model', content: 'Réponse 20' });
    expect(history.some((turn) => turn.content === 'Question 1')).toBe(false);
  });

  it('respecte le budget de caractères en conservant les tours les plus récents', () => {
    const messages: AIMessageRow[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const content = `${'y'.repeat(2999)}${index}`;
      messages.push(message(index % 2 === 1 ? 'UTILISATEUR' : 'ASSISTANT', content));
    }

    const history = buildMemory(messages);
    const total = history.reduce((sum, turn) => sum + turn.content.length, 0);

    expect(total).toBeLessThanOrEqual(16_000);
    expect(history[0].role).toBe('user');
    expect(history[0].content.length).toBe(1000);
    expect(history[history.length - 1].content.endsWith('6')).toBe(true);
  });
});
