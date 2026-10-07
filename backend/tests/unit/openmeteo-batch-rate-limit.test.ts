import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { OpenMeteoProvider } from '../../src/services/openmeteo.provider';
import { AppError } from '../../src/utils/app-error';
import type { BatchCommuneInput } from '../../src/types/weather.types';

// `reserveQuota` tape dans la base : on le neutralise pour que le test reste
// un test unitaire et ne consomme pas le budget Open-Meteo réel.
vi.mock('../../src/services/weather-quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/weather-quota')>();
  return { ...actual, reserveQuota: vi.fn(async () => 0) };
});

const CHUNK_SIZE = 400;

function communes(count: number): BatchCommuneInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `commune-${i}`,
    latitude: -18 + i * 0.001,
    longitude: 47 + i * 0.001,
  }));
}

/** Réponse Open-Meteo minimale mais valide pour une seule coordonnée. */
function okResponse(index: number): unknown {
  const time = '2026-10-02T09:00';
  return {
    timezone: 'Indian/Antananarivo',
    current: {
      time,
      temperature_2m: 20 + index,
      relative_humidity_2m: 50,
      precipitation: 0,
      wind_speed_10m: 10,
      wind_gusts_10m: 20,
      wind_direction_deg: 180,
      pressure_msl: 1010,
      weather_code: 1,
    },
    hourly: { time: [time], temperature_2m: [20] },
    daily: { time: ['2026-10-02'], precipitation_sum: [0] },
  };
}

function dailyRateLimitError(): AxiosError {
  const headers = new AxiosHeaders({ 'retry-after': '3600' });
  return new AxiosError('429', 'ERR_BAD_REQUEST', undefined, undefined, {
    data: { reason: 'Daily API request limit exceeded' },
    status: 429,
    statusText: 'Too Many Requests',
    headers,
    config: { headers: new AxiosHeaders() },
  });
}

/**
 * Remplace le client axios interne du provider. `get` reçoit les params de la
 * requête : on en déduit le nombre de coordonnées demandées pour répondre comme
 * le ferait le fournisseur.
 */
function stubClient(
  provider: OpenMeteoProvider,
  handler: (locations: number) => Promise<unknown>,
): { calls: number } {
  const state = { calls: 0 };
  const client = {
    get: async (_url: string, config?: { params?: Record<string, unknown> }) => {
      state.calls += 1;
      const raw = config?.params?.latitude;
      const locations = String(raw ?? '').split(',').length;
      return { data: await handler(locations) };
    },
  };
  (provider as unknown as { client: unknown }).client = client;
  return state;
}

describe('Open-Meteo : 429 en cours de batch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('conserve les points déjà récupérés quand un lot suivant est rate-limité', async () => {
    const provider = new OpenMeteoProvider();
    // 401 communes : un 1er lot de 400 passe, le 2e de 1 se fait refuser.
    const stub = stubClient(provider, async (locations) => {
      if (locations === 1) throw dailyRateLimitError();
      return Array.from({ length: locations }, (_, i) => okResponse(i));
    });

    const items = await provider.getCurrentBatch(communes(401));

    // Le trou observé en production : le batch jetait tout et la fenêtre horaire
    // déjà payée disparaissait. Ici le 1er lot doit survivre.
    expect(items).toHaveLength(CHUNK_SIZE);
    expect(stub.calls).toBe(2);
  });

  it('remonte le 429 quand aucun lot n aboutit', async () => {
    const provider = new OpenMeteoProvider();
    stubClient(provider, async () => {
      throw dailyRateLimitError();
    });

    // Comportement inchangé : sans la moindre donnée, l'erreur reste la seule
    // information utile et doit remonter.
    await expect(provider.getCurrentBatch(communes(50))).rejects.toBeInstanceOf(AppError);
  });
});
