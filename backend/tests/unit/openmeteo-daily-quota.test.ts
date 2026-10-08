import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import axios from 'axios';
import { db } from '../../src/config/database';
import { OpenMeteoProvider } from '../../src/services/openmeteo.provider';
import { OPEN_METEO_PROVIDER, openMeteoCoordinateLimiter } from '../../src/services/weather-quota';
import { weatherRepository } from '../../src/repositories/weather.repository';

/**
 * Premier 429 journalier : ce que l'utilisateur voit vraiment.
 *
 * Le 01/10, Open-Meteo a renvoyé « daily api request limit exceeded ». Le
 * provider le traitait comme une rafale : il relancait jusqu'à 5 passes de
 * lots (~7 900 coordonnées refacturées) et finissait par lever un 429 générique
 * sans heure de reset. Deux bugs distincts, testés ici :
 *
 *  1. le plafond journalier ne doit jamais être réessayé ;
 *  2. ce PREMIER 429 doit porter le message de reset et le `Retry-After`,
 *     sinon le frontend ne peut pas dire à l'utilisateur quand réessayer.
 */

const DAILY_REASON = 'daily api request limit exceeded. please try again tomorrow.';

function communes(n: number): { id: string; latitude: number; longitude: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    latitude: -18.9,
    longitude: 47.5,
  }));
}

function axiosError(status: number, reason: string): unknown {
  return new axios.AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    data: { reason },
    headers: {},
    config: { headers: {} as never },
  } as never);
}

/** Instance neuve : l'état du circuit (plafond atteint) doit être isolé par test. */
function providerWith(get: ReturnType<typeof vi.fn>): OpenMeteoProvider {
  const provider = new OpenMeteoProvider();
  (provider as unknown as { client: unknown }).client = { get };
  return provider;
}

describe('plafond journalier : le premier 429 doit être actionnable', () => {
  // Même exigence que côté intégration : ces tests reserving réellement leur
  // budget, ils doivent rendre le compteur du service à sa valeur d'origine.
  let savedConsumed = 0;

  beforeAll(async () => {
    savedConsumed = (await weatherRepository.getProviderQuota(OPEN_METEO_PROVIDER)).consumed;
  });

  beforeEach(async () => {
    // Le limiteur de rafale est partagé par le processus : sans remise à zéro,
    // le lot du test précédent ferait attendre celui-ci une minute entière.
    openMeteoCoordinateLimiter.reset();
    await db.query('DELETE FROM weather_provider_quota WHERE provider = $1', [
      OPEN_METEO_PROVIDER,
    ]);
  });

  afterAll(async () => {
    // Restauration inconditionnelle : si la valeur d'origine vaut 0, un `if`
    // autour de l'upsert laisserait la consommation des tests en base (800
    // appels fantômes), et le service croirait avoir consommé son budget.
    await db.query(
      `INSERT INTO weather_provider_quota (provider, quota_day, consumed_calls)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)
       ON CONFLICT (provider) DO UPDATE SET consumed_calls = EXCLUDED.consumed_calls`,
      [OPEN_METEO_PROVIDER, savedConsumed],
    );
    await db.pool.end();
  });

  it('échoue sans réessayer et annonce le reset', async () => {
    const get = vi.fn().mockRejectedValue(axiosError(429, DAILY_REASON));

    const err = await providerWith(get)
      .getForecastBatch(communes(400), '2026-10-02', 12)
      .then(() => null)
      .catch((e: unknown) => e);

    // UN SEUL appel : c'était tout le but du correctif.
    expect(get).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ statusCode: 429 });
    expect((err as Error).message).toContain('00:00 UTC');
    expect((err as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(60);
  });

  it('refuse aussi les runs suivants, sans appel réseau', async () => {
    const get = vi.fn().mockRejectedValue(axiosError(429, DAILY_REASON));
    const provider = providerWith(get);

    await provider.getForecastBatch(communes(400), '2026-10-02', 12).catch(() => null);
    const callsAfterFirst = get.mock.calls.length;

    // Le circuit est couvert jusqu'au reset : le run suivant ne doit pas
    // repartir facturer des coordonnées que le fournisseur refusera aussi.
    const second = await provider
      .getForecastBatch(communes(400), '2026-10-02', 13)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(get.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toMatchObject({ statusCode: 429 });
    expect((second as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(60);
  });
});
