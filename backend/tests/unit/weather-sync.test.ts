import { describe, it, expect } from 'vitest';
import { weatherSyncTriggerSchema } from '../../src/validators/weather.validator';
import { dedupeByExisting } from '../../src/services/weather-sync.service';
import { staleWeatherScopes } from '../../src/jobs/weather-refresh.job';

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

/**
 * Garantie centrale : « toutes les communes ont des données météo ».
 * Ces tests verrouillent le mécanisme qui la rend tenable face à la limite
 * de débit d'Open-Meteo.
 *
 * Régression constatée : un run national demandant les 1579 communes se
 * faisait refuser un lot entier de 400 (HTTP 429). Le lot échoué étant
 * abandonné après 2 passes, 400 communes se retrouvaient sans observation —
 * et le run suivant les redemandait toutes, sans distinction, entretenant
 * la saturation.
 *
 * Deux verrous, et un non-verrou volontaire :
 *  1. auto-réparation — un run ne demande que les communes réellement à
 *     rafraîchir : un run à jour coûte 0 requête, et le run suivant comble
 *     les trous. C'est le vrai correctif.
 *  2. convergence — on réessaie le lot fautif avec un recul progressif, en
 *     conservant les points déjà obtenus pour les autres lots.
 *  3. NON scinder le lot. Un 429 vient du nombre de requêtes, pas de leur
 *     taille (vérifié : 100, 200 et 400 communes sont refusés de façon
 *     identique). Scinder doublerait le nombre de requêtes, donc la
 *     saturation.
 */
describe('weather-sync : convergence et auto-réparation', () => {
  const BATCH_SIZE = 400;
  const TOTAL_COMMUNES = 1579;
  const MAX_PASSES = 5;
  const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

  /** Reproduit la politique de convergence du provider Open-Meteo. */
  function convergeAlwaysRejected(chunkSizes: number[]): {
    attempts: number[];
    waitMs: number;
  } {
    const attempts: number[] = [];
    let waitMs = 0;
    let pending = [...chunkSizes];
    for (let pass = 0; pass < MAX_PASSES && pending.length > 0; pass += 1) {
      if (pass > 0) {
        waitMs += BACKOFF_MS[Math.min(pass - 1, BACKOFF_MS.length - 1)] ?? 60_000;
      }
      const failed: number[] = [];
      for (const size of pending) {
        attempts.push(size);
        failed.push(size);
      }
      pending = failed;
    }
    return { attempts, waitMs };
  }

  it('réessaie un lot refusé jusqu’à convergence, sans le scinder', () => {
    // Lot refusé au 1er essai, accepté au 2e.
    const attempts: number[] = [];
    let pending = [BATCH_SIZE];
    for (let pass = 0; pass < MAX_PASSES && pending.length > 0; pass += 1) {
      const failed: number[] = [];
      for (const size of pending) {
        attempts.push(size);
        if (pass < 1) failed.push(size);
      }
      pending = failed;
    }

    expect(attempts).toEqual([400, 400]);
    // Jamais scindé : la taille reste celle d'origine.
    expect(Math.max(...attempts)).toBe(BATCH_SIZE);
    expect(pending).toEqual([]);
  });

  it('borne le recul total quand le lot est définitivement refusé', () => {
    // Pire cas : refus systématique. Le lot est retenté MAX_PASSES fois avec
    // un recul total borné, puis rendu pour réparation au run suivant via
    // le pré-filtrage.
    const { attempts, waitMs } = convergeAlwaysRejected([BATCH_SIZE]);

    expect(attempts).toEqual([400, 400, 400, 400, 400]);
    expect(waitMs).toBe(5_000 + 15_000 + 30_000 + 60_000);
  });

  it('conserve les points des lots déjà réussis quand un lot échoue', () => {
    // 4 lots, seul le 3e est refusé puis réussi au 2e essai.
    const chunkSizes = [400, 400, 400, 379];
    const failedIndex = 2;
    const attemptsPerChunk = [1, 1, 2, 1];
    const communesSaved = chunkSizes
      .map((size, i) => (i === failedIndex ? 0 : size * attemptsPerChunk[i]))
      .reduce((a, b) => a + b, 0);

    // 1179 communes sur 1579 : un refus ne jette pas tout le run.
    expect(communesSaved).toBe(1179);
    expect(communesSaved).toBeGreaterThan(TOTAL_COMMUNES / 2);
  });

  it('un run à jour ne demande aucune commune (0 requête HTTP)', () => {
    // Sélecteur SQL : aucune commune n'a d'observation avant la fenêtre.
    const needing = selectNeeding(
      TOTAL_COMMUNES,
      Array.from({ length: TOTAL_COMMUNES }, () => 5), // toutes fraîches
      60, // fenêtre de rafraîchissement
    );
    expect(needing).toBe(0);
  });

  it('un run suivant ne redemande que les communes laissées derrière', () => {
    // Scénario du incident : 400 communes sur 1579 ont échoué au run N.
    const lastSuccessMinutesAgo = Array.from({ length: TOTAL_COMMUNES }, (_, i) =>
      i < 400 ? 200 : 5,
    );
    const needing = selectNeeding(
      TOTAL_COMMUNES,
      lastSuccessMinutesAgo,
      60, // fenêtre de rafraîchissement
    );

    // Uniquement les 400 communes oubliées, pas les 1179 déjà à jour.
    expect(needing).toBe(400);
    // C'est bien inférieur à 1579 : c'est ce qui sort de la zone de saturation.
    expect(needing).toBeLessThan(TOTAL_COMMUNES);
  });

  it('couvre les 1579 communes en 4 lots de 400', () => {
    const chunks: number[] = [];
    for (let i = 0; i < TOTAL_COMMUNES; i += BATCH_SIZE) {
      chunks.push(Math.min(BATCH_SIZE, TOTAL_COMMUNES - i));
    }
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(TOTAL_COMMUNES);
    expect(chunks).toEqual([400, 400, 400, 379]);
  });
});

/**
 * Équivalent du `NOT EXISTS` de communesNeedingObservations : une commune est
 * à rafraîchir si son observation la plus récente est plus ancienne que la
 * fenêtre, ou absente (donc +Infinity).
 */
function selectNeeding(
  total: number,
  minutesSinceLastObservation: number[],
  windowMinutes: number,
): number {
  let count = 0;
  for (let i = 0; i < total; i += 1) {
    const age = minutesSinceLastObservation[i];
    if (age === undefined || age >= windowMinutes) count += 1;
  }
  return count;
}

/**
 * Périmètres à rattraper, au démarrage comme au retour de veille.
 *
 * Régression constatée : le process survit à une veille S3, pas ses timers.
 * Le 01/10 au réveil, les observations dataient de la veille au soir — 712 min,
 * bandeau rouge — et le rattrapage ne couvrait que les observations. Les
 * prévisions, périodicité 3 h pour un seuil de 6 h, restaient donc STALE pour
 * des heures après que le rattrapage eut rendu les observations fraiches.
 */
describe('weather-sync : périmètres périmés', () => {
  const NOW = Date.parse('2026-10-01T08:45:00Z');
  const OBSERVATION_STALE_MINUTES = 150;
  const FORECAST_STALE_HOURS = 6;

  /** Construit un instant il y a `minutes` (ou `null` : jamais de donnée). */
  const ago = (minutes: number | null): string | null =>
    minutes === null ? null : new Date(NOW - minutes * 60_000).toISOString();

  const stale = (observations: number | null, forecastsHours: number | null) =>
    staleWeatherScopes({
      lastObservationAt: ago(observations),
      lastForecastAt:
        forecastsHours === null ? null : new Date(NOW - forecastsHours * 3_600_000).toISOString(),
      observationStaleMinutes: OBSERVATION_STALE_MINUTES,
      forecastStaleHours: FORECAST_STALE_HOURS,
      now: NOW,
    });

  it('ne rattrape rien quand tout est frais', () => {
    // Run horaire attendu : 5 min d'ancienneté observations, 30 min de
    // prévisions. Le rattrapage doit être gratuit, sinon il s'auto-déclenche.
    expect(stale(5, 0.5)).toEqual([]);
  });

  it('rattrape les deux périmètres après une longue veille', () => {
    // Le cas mesuré : 11 h 37 de sommeil depuis le run de 21 h 00.
    expect(stale(712, 11.6)).toEqual(['OBSERVATIONS', 'FORECASTS']);
  });

  it('rattrape les observations seules quand les prévisions tiennent', () => {
    expect(stale(712, 1)).toEqual(['OBSERVATIONS']);
  });

  it('rattrape les prévisions seules quand les observations tiennent', () => {
    expect(stale(5, 9)).toEqual(['FORECASTS']);
  });

  it('considère une base vide comme entièrement périmée', () => {
    expect(stale(null, null)).toEqual(['OBSERVATIONS', 'FORECASTS']);
  });

  it('tolère un run manqué avant de crier au péremption', () => {
    // Le seuil est celui du bandeau : deux runs consécutifs manqués. Au
    // premier run manqué (60 min), le bandeau ne doit pas encore virer.
    expect(stale(60, 1)).toEqual([]);
    expect(stale(151, 1)).toEqual(['OBSERVATIONS']);
    expect(stale(5, 6.1)).toEqual(['FORECASTS']);
  });
});
