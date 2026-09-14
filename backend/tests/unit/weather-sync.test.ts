import { describe, it, expect } from 'vitest';
import { weatherSyncTriggerSchema } from '../../src/validators/weather.validator';
import { dedupeByExisting } from '../../src/services/weather-sync.service';

describe('weather-sync : déduplication (helper pur)', () => {
  it('garde les lignes nouvelles et compte les doublons existants', () => {
    const rows = [
      { communeId: 'a', key: 1 },
      { communeId: 'b', key: 2 },
      { communeId: 'c', key: 3 },
    ];
    const existing = new Set(['b|2', 'c|3']);
    const result = dedupeByExisting(rows, existing, (r) => `${r.communeId}|${r.key}`);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].communeId).toBe('a');
    expect(result.skipped).toBe(2);
  });

  it('garde tout quand l ensemble existant est vide', () => {
    const rows = [{ communeId: 'a' }, { communeId: 'b' }];
    const result = dedupeByExisting(rows, new Set(), (r) => r.communeId);
    expect(result.kept).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it('ignore tout quand toutes les clés existent déjà', () => {
    const rows = [{ communeId: 'a' }, { communeId: 'b' }];
    const result = dedupeByExisting(rows, new Set(['a', 'b']), (r) => r.communeId);
    expect(result.kept).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });
});

describe('weather-sync : validateur de déclenchement', () => {
  it('définit le périmètre par défaut sur observations + prévisions', () => {
    const parsed = weatherSyncTriggerSchema.parse({});
    expect(parsed.scope).toBe('OBSERVATIONS_AND_FORECASTS');
  });

  it('accepte les trois périmètres', () => {
    for (const scope of ['OBSERVATIONS', 'FORECASTS', 'OBSERVATIONS_AND_FORECASTS']) {
      expect(weatherSyncTriggerSchema.parse({ scope }).scope).toBe(scope);
    }
  });

  it('rejette un périmètre inconnu', () => {
    const result = weatherSyncTriggerSchema.safeParse({ scope: 'INONDATIONS' });
    expect(result.success).toBe(false);
  });
});
