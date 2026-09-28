import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Régression : PostgreSQL refuse un message étendu (bind) dépassant
 * 65535 paramètres. Avant le découpage, une synchro nationale des
 * prévisions partait en UN seul INSERT de 6316 communes × 17 colonnes,
 * soit 107372 paramètres, et échouait avec :
 *
 *   « le message bind a 41836 formats de paramètres mais 0 paramètres »
 *   (107372 mod 65536 = 41836)
 *
 * Le plafond réel est donc 65535 / 17 = 3855 lignes par requête. Ces tests
 * vérifient l'invariant au niveau SQL : chaque instruction générée doit
 * rester sous la limite, sans écrire quoi que ce soit en base.
 */

const PG_BIND_LIMIT = 65535;
/** Observations et prévisions lie toutes deux 17 paramètres par ligne. */
const PARAMS_PER_ROW = 17;
const MAX_ROWS_PER_STATEMENT = Math.floor(PG_BIND_LIMIT / PARAMS_PER_ROW); // 3855

interface CapturedQuery {
  text: string;
  params: unknown[] | undefined;
}

const captured: CapturedQuery[] = [];

vi.mock('../../src/config/database', () => ({
  db: {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      captured.push({ text, params });
      return { rowCount: params ? params.length / 17 : 0 };
    }),
  },
}));

// Import dynamique : `vi.mock` est hissé, le module doit être chargé après le
// mock. Un import statique ici récupérerait la vraie instance de `db`.
let weatherRepository: (typeof import('../../src/repositories/weather.repository'))['weatherRepository'];
type WeatherInsertData = import('../../src/repositories/weather.repository').WeatherInsertData;
type WeatherForecastInsertData =
  import('../../src/repositories/weather.repository').WeatherForecastInsertData;

const SOURCE_ID = '00000000-0000-0000-0000-000000000001';
const COMMUNE_ID = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  ({ weatherRepository } = await import('../../src/repositories/weather.repository'));
});

/** Nombre de paramètres $n dans le SQL généré. */
function placeholderCount(text: string): number {
  const matches = text.match(/\$\d+/g);
  return matches ? matches.length : 0;
}

function buildObservations(count: number): WeatherInsertData[] {
  return Array.from({ length: count }, (_, i) => ({
    communeId: COMMUNE_ID,
    eventId: null,
    observedAt: '2026-09-28T09:00:00.000Z',
    latitude: -19 + i * 1e-5,
    longitude: 47 + i * 1e-5,
    temperatureC: 24,
    humidityPercent: 65,
    precipitationMm: 0.4,
    rainfall24hMm: null,
    windSpeedKmh: 11,
    windGustsKmh: 19,
    windDirectionDeg: 175,
    pressureHpa: 1013,
    weatherCode: '02',
    rawData: { i },
  }));
}

function buildForecasts(count: number): WeatherForecastInsertData[] {
  return Array.from({ length: count }, (_, i) => ({
    communeId: COMMUNE_ID,
    // Une journée par ligne : uq_weather_forecasts_commune_day est UNIQUE.
    forecastDay: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    generatedAt: '2026-09-28T09:00:00.000Z',
    latitude: -19 + i * 1e-5,
    longitude: 47 + i * 1e-5,
    temperatureMinC: 18,
    temperatureMaxC: 26,
    relativeHumidityAvg: 70,
    precipitationSumMm: 1.5,
    windSpeedMaxKmh: 12,
    windGustsMaxKmh: 20,
    windDirectionDeg: 180,
    pressureAvgHpa: 1012,
    weatherCode: '01',
    rawData: { i },
  }));
}

beforeEach(() => {
  captured.length = 0;
});

describe('weather.repository : découpage des insertions sous la limite de bind', () => {
  it('découpe les prévisions nationales (6316 communes) en requêtes < 65535 paramètres', async () => {
    const rows = buildForecasts(6316);
    // 6316 × 17 = 107372 : c'est exactement le cas qui échouait en production.
    expect(rows.length * PARAMS_PER_ROW).toBeGreaterThan(PG_BIND_LIMIT);
    expect(MAX_ROWS_PER_STATEMENT).toBe(3855);

    const inserted = await weatherRepository.insertForecasts(rows, SOURCE_ID);

    expect(captured.length).toBeGreaterThan(1);
    for (const q of captured) {
      expect(placeholderCount(q.text)).toBeLessThanOrEqual(PG_BIND_LIMIT);
      expect(q.params).toBeDefined();
    }
    // Aucune ligne perdue : le total des paramètres = lignes × 17 colonnes.
    const totalParams = captured.reduce((n, q) => n + (q.params?.length ?? 0), 0);
    expect(totalParams).toBe(rows.length * PARAMS_PER_ROW);
    expect(inserted).toBe(rows.length);
  });

  it('découpe les observations nationales sous la limite de bind', async () => {
    const rows = buildObservations(6316);
    expect(rows.length * PARAMS_PER_ROW).toBeGreaterThan(PG_BIND_LIMIT);

    await weatherRepository.insertObservations(rows, SOURCE_ID);

    expect(captured.length).toBeGreaterThan(1);
    for (const q of captured) {
      expect(placeholderCount(q.text)).toBeLessThanOrEqual(PG_BIND_LIMIT);
    }
    const totalParams = captured.reduce((n, q) => n + (q.params?.length ?? 0), 0);
    expect(totalParams).toBe(rows.length * PARAMS_PER_ROW);
  });

  it('utilise ceil(rows / 1000) lots et ne perd rien à la frontière', async () => {
    const rows = buildForecasts(2001);
    await weatherRepository.insertForecasts(rows, SOURCE_ID);

    expect(captured.length).toBe(3); // 1000 + 1000 + 1
    expect(captured.map((q) => q.params?.length)).toEqual([17000, 17000, 17]);
  });

  it('ne pose aucune requête pour un tableau vide', async () => {
    expect(await weatherRepository.insertForecasts([], SOURCE_ID)).toBe(0);
    expect(await weatherRepository.insertObservations([], SOURCE_ID)).toBe(0);
    expect(captured.length).toBe(0);
  });
});
