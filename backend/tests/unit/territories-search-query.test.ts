import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Normalisation de la requête de recherche territoriale.
 *
 * La recherche est une correspondance de sous-chaîne (`ILIKE '%q%'`) : une espace
 * parasite suffisait à ne plus trouver un territoire pourtant présent en base
 * (« Ambanizana » avec une espace finale ne renvoyait rien). Ces tests vérifient
 * la requête SQL construite, sans interroger de base.
 */

interface CapturedQuery {
  text: string;
  params: unknown[] | undefined;
}

const captured: CapturedQuery[] = [];

vi.mock('../../src/config/database', () => ({
  db: {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      captured.push({ text, params });
      return { rows: [] };
    }),
  },
}));

// Import dynamique : `vi.mock` est hissé, le module doit être chargé après le
// mock. Un import statique récupérerait la vraie instance de `db`.
let territoriesRepository: (typeof import('../../src/repositories/territories.repository'))['territoriesRepository'];

beforeAll(async () => {
  ({ territoriesRepository } = await import('../../src/repositories/territories.repository'));
});

beforeEach(() => {
  captured.length = 0;
});

/** Une recherche interroge les districts puis les communes, avec les mêmes paramètres. */
function motifsLike(): string[] {
  return captured.map((query) => String(query.params?.[0]));
}

describe('Territoires - normalisation de la recherche', () => {
  it('ignore les espaces autour du nom recherché', async () => {
    await territoriesRepository.searchTerritories('  Ambanizana  ', 10);

    expect(captured).toHaveLength(2);
    expect(motifsLike()).toStrictEqual(['%Ambanizana%', '%Ambanizana%']);
  });

  it('réduit les espaces répétés à l intérieur du nom', async () => {
    await territoriesRepository.searchTerritories('Port   Bergé', 10);

    expect(motifsLike()).toStrictEqual(['%Port Bergé%', '%Port Bergé%']);
  });

  it('laisse intacte une requête déjà canonique et transmet la limite', async () => {
    await territoriesRepository.searchTerritories('Sainte-Marie', 5);

    expect(motifsLike()).toStrictEqual(['%Sainte-Marie%', '%Sainte-Marie%']);
    expect(captured.map((query) => query.params?.[1])).toStrictEqual([5, 5]);
  });
});
