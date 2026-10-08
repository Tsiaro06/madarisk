import { describe, it, expect } from 'vitest';
import { env } from '../../src/config/env';
import { pruneForecastCache } from '../../src/services/openmeteo.provider';
import {
  classifyRateLimit,
  dailyResetRetryAfter,
  hourlyResetRetryAfter,
  nextDailyReset,
  nextHourlyReset,
  quotaCostOfBatch,
  rateLimitMessage,
  CoordinateRateLimiter,
} from '../../src/services/weather-quota';

/**
 * Garde-fou du quota Open-Meteo.
 *
 * Open-Meteo ne compte pas les requêtes mais les COORDONNÉES : un run national
 * sur les 1579 communes coûte environ 1580 appels. La cadence des crons est donc
 * un budget, pas un réglage de confort — c'est ce qui a fait tomber la
 * production le 01/10 (57 000 appels/jour pour un plafond gratuit de 10 000, et
 * 429 « hourly limit » dès le premier lot).
 *
 * Ces tests échouent dès qu'on resserre une cadence ou qu'on rajoute des
 * communes, ce qui est exactement le moment où il faut s'en apercevoir.
 */

/** Plafond de l'offre gratuite, en appels de coordonnées par jour. */
const FREE_DAILY_LIMIT = 10_000;
/** Plafond horaire de l'offre gratuite. */
const FREE_HOURLY_LIMIT = 5_000;
/** Nombre de communes ciblées par les runs nationaux (Madagascar). */
const TARGET_COMMUNES = 1579;

/**
 * Nombre d'exécutions par jour d'un cron quotidien.
 *
 * Volontairement restreint aux formes réellement utilisées ici : champ heure à
 * `*`, pas de `*` suivi de N, ou une heure fixe. Toute autre forme lève une
 * erreur plutôt que de renvoyer un compte faux, pour ne pas laisser un test au
 * vert sur une cadence non analysée.
 */
function dailyRuns(cron: string): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron non géré : ${cron}`);
  const hour = fields[1];
  if (hour === undefined) throw new Error(`cron non géré : ${cron}`);
  if (hour === '*') return 24;
  const step = /^\*\/(\d+)$/.exec(hour);
  if (step) return 24 / Number(step[1]);
  if (/^\d+$/.test(hour)) return 1;
  throw new Error(`cron non géré : ${cron}`);
}

/** Période entre deux exécutions, en minutes. */
function periodMinutes(cron: string): number {
  return (24 * 60) / dailyRuns(cron);
}

describe('quota Open-Meteo : le budget de la cadence tient', () => {
  it('reste sous le plafond quotidien gratuit', () => {
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    const dailyCost = runs * TARGET_COMMUNES;

    // Un run d'observations (9 variables, 1 jour) et un run de prévisions
    // (3 variables, 3 jours) coûtent chacun environ 1 appel par commune :
    // Open-Meteo pondère les couples (jours x variables), 15 équivalant à 1,5.
    expect(dailyCost).toBeLessThanOrEqual(FREE_DAILY_LIMIT);
  });

  it('reste sous le plafond horaire gratuit sur un run isolé', () => {
    expect(TARGET_COMMUNES).toBeLessThan(FREE_HOURLY_LIMIT);
  });

  it('garde la place pour une relance manuelle d’urgence', () => {
    // Une panne de fournisseur se rattrape à la main, ou après une veille. Si le
    // budget journalier est déjà consommé à 95 %, cette relance fait reborder le
    // quota et on perd les observations ET la relance.
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    const dailyCost = runs * TARGET_COMMUNES;
    expect(dailyCost + TARGET_COMMUNES).toBeLessThanOrEqual(FREE_DAILY_LIMIT);
  });

  it('tient sous le plafond que l’API s’auto-impose', () => {
    // Le plafond utile n’est pas celui du fournisseur mais celui d’`env` : c’est
    // lui qui déclenche le refus des runs, donc c’est lui qui doit tenir.
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    expect(runs * TARGET_COMMUNES).toBeLessThanOrEqual(env.OPEN_METEO_DAILY_BUDGET);
  });

  it('garde une marge sous l’offre gratuite', () => {
    // Sans marge on tomberait exactement au mur, et la moindre relance manuelle
    // ferait déborder le quota pour le reste de la journée.
    expect(env.OPEN_METEO_DAILY_BUDGET).toBeLessThan(FREE_DAILY_LIMIT);
  });

  it('facture un lot au nombre de communes', () => {
    expect(quotaCostOfBatch(TARGET_COMMUNES)).toBe(TARGET_COMMUNES);
    expect(quotaCostOfBatch(400)).toBe(400);
    expect(quotaCostOfBatch(0)).toBe(0);
  });
});

/**
 * Classification des plafonds d’Open-Meteo.
 *
 * Le 01/10, un 429 « daily api request limit exceeded » était traité comme une
 * rafale : le run relançait jusqu’à 5 passes de lots, soit environ 7 900
 * coordonnées refacturées, pour un résultat identique. Ces tests verrouillent
 * la distinction qui rend ce cas impossible à réintroduire.
 */
describe('plafonds Open-Meteo : ne pas confondre journalier et rafale', () => {
  it('reconnaît le plafond journalier', () => {
    expect(classifyRateLimit('daily api request limit exceeded. please try again tomorrow.')).toBe(
      'daily',
    );
  });

  it('reconnaît le plafond horaire', () => {
    expect(
      classifyRateLimit('hourly api request limit exceeded. please try again in one hour.'),
    ).toBe('hourly');
  });

  it('reconnaît la rafale', () => {
    expect(
      classifyRateLimit('minutely api request limit exceeded. please try again in one minute.'),
    ).toBe('minutely');
  });

  it('laisse un motif inconnu à la politique de retry existante', () => {
    expect(classifyRateLimit('internal server error')).toBeNull();
    expect(classifyRateLimit('')).toBeNull();
  });

  it('programme le reset à 00:00 UTC', () => {
    // Le compteur d’Open-Meteo se rebat à 00:00 UTC, soit 03:00 heure
    // Madagascar : c’est l’heure annoncée à l’utilisateur quand le quota est mort.
    expect(nextDailyReset(new Date('2026-10-02T21:30:00Z')).toISOString()).toBe(
      '2026-10-03T00:01:00.000Z',
    );
  });

  it('annonce un Retry-After plausible', () => {
    const retryAfter = dailyResetRetryAfter(new Date('2026-10-02T21:30:00Z'));
    expect(retryAfter).toBeGreaterThan(60);
    expect(retryAfter).toBeLessThanOrEqual(24 * 3600);
  });

  /**
   * Reset horaire : le 08/10, un 429 « hourly » à 08:48 a fermé le circuit
   * jusqu'à 09:48 (« environ une heure ») alors que le compteur du fournisseur
   * repart à 09:00. Attendre au-delà du reset réel coûte des dizaines de
   * minutes de données pour rien.
   */
  it('programme le reset horaire en début d’heure UTC suivante', () => {
    expect(nextHourlyReset(new Date('2026-10-02T08:48:33Z')).toISOString()).toBe(
      '2026-10-02T09:01:00.000Z',
    );
    expect(nextHourlyReset(new Date('2026-10-02T08:59:59Z')).toISOString()).toBe(
      '2026-10-02T09:01:00.000Z',
    );
    expect(nextHourlyReset(new Date('2026-10-02T23:30:00Z')).toISOString()).toBe(
      '2026-10-03T00:01:00.000Z',
    );
  });

  it('limite le Retry-After horaire au reset réel', () => {
    const retryAfter = hourlyResetRetryAfter(new Date('2026-10-02T08:48:33Z'));
    // 12 min 27 s jusqu'à 09:01, pas une heure.
    expect(retryAfter).toBeGreaterThan(60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('date l’heure de reset dans le message horaire', () => {
    const message = rateLimitMessage('hourly', new Date('2026-10-02T09:01:00Z'));
    expect(message).toContain('2026-10-02T09:01:00.000Z');
    expect(message).toContain("début d'heure UTC");
  });
});

describe('seuils de péremption : cohérents avec la période des crons', () => {
  it('le seuil des observations dépasse la période du cron', () => {
    // Sinon le bandeau vire au rouge pendant un cycle pourtant normal.
    expect(env.WEATHER_OBSERVATION_STALE_MINUTES).toBeGreaterThan(
      periodMinutes(env.WEATHER_OBSERVATION_CRON),
    );
  });

  it('le seuil des prévisions dépasse la période du cron', () => {
    expect(env.WEATHER_FORECAST_STALE_HOURS).toBeGreaterThan(
      periodMinutes(env.WEATHER_FORECAST_CRON) / 60,
    );
  });

  it('signale une panne avant deux cycles complets', () => {
    // Trop lâche, le bandeau resterait vert pendant toute la panne.
    expect(env.WEATHER_OBSERVATION_STALE_MINUTES).toBeLessThan(
      2 * periodMinutes(env.WEATHER_OBSERVATION_CRON),
    );
  });

  it('signale une panne de prévisions avant deux cycles complets', () => {
    expect(env.WEATHER_FORECAST_STALE_HOURS).toBeLessThan(
      2 * (periodMinutes(env.WEATHER_FORECAST_CRON) / 60),
    );
  });
});

/**
 * Limiteur de rafale : 600 coordonnées par minute.
 *
 * Le 08/10 09:22, les lots de 400 partaient sans discontinuer : 800 coordonnées
 * en 90 secondes, donc 429 « minutely » et 779 communes rejetées sur 1579 alors
 * que le budget journalier n'était qu'à 12 %. Ces tests verrouillent l'attente
 * entre deux lots.
 */
describe('limiteur de rafale : un lot par fenêtre, pas deux', () => {
  // Fenêtre glissante du limiteur : 65 s, 5 s de marge sous la fenêtre fixe
  // d'Open-Meteo (60 s) dont l'effacement peut être retardé côté serveur.
  const WINDOW = 65_000;

  it('laisse passer le premier lot sans attendre', () => {
    expect(new CoordinateRateLimiter().reserve(400, 1_000_000)).toBe(0);
  });

  it('fait attendre un second lot dans la même fenêtre', () => {
    const limiter = new CoordinateRateLimiter();
    limiter.reserve(400, 1_000_000);

    const wait = limiter.reserve(400, 1_001_000);

    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(WINDOW - 1_000);
  });

  it('rend la main une fois la fenêtre glissante passée', () => {
    const limiter = new CoordinateRateLimiter();
    limiter.reserve(400, 1_000_000);

    expect(limiter.reserve(400, 1_000_000 + WINDOW)).toBe(0);
  });

  it('accepte une coordonnée isolée dès que la place est libre', () => {
    const limiter = new CoordinateRateLimiter();
    limiter.reserve(499, 1_000_000);

    expect(limiter.reserve(1, 1_000_001)).toBe(0);
    expect(limiter.reserve(1, 1_000_002)).toBeGreaterThan(0);
  });

  it('ne bloque jamais un lot plus large que la fenêtre', () => {
    // Une attente infinie figerait le cron : on préfère dépasser la limite.
    expect(new CoordinateRateLimiter().reserve(501, 1_000_000)).toBe(0);
  });

  it('partage le budget entre lots successifs', () => {
    const limiter = new CoordinateRateLimiter();
    limiter.reserve(400, 1_000_000);
    limiter.reserve(400, 1_000_000 + WINDOW);
    limiter.reserve(400, 1_000_000 + 2 * WINDOW);

    // Trois lots espacés de la fenêtre : le troisième ne peut pas partir dans
    // la fenêtre glissante du deuxième.
    expect(limiter.reserve(400, 1_000_000 + 2 * WINDOW - 1)).toBeGreaterThan(0);
    expect(limiter.reserve(400, 1_000_000 + 3 * WINDOW)).toBe(0);
  });
});

/**
 * Bornage du cache de prévisions.
 *
 * Le cache de la couche cartographique est indexé par `date:heure` : chaque
 * heure consultée y ajoute une entrée de 1 579 points, et rien ne les supprimait
 * ensuite. Le service API démarre au boot et tourne des mois : sans éviction, la
 * Map grossit indéfiniment en mémoire.
 */
describe('cache de prévisions : éviction des entrées inutiles', () => {
  const MINUTE = 60_000;

  it('supprime les entrées expirées', () => {
    const cache = new Map([
      ['perime', { expiresAt: Date.now() - MINUTE }],
      ['vivant', { expiresAt: Date.now() + 10 * MINUTE }],
    ]);

    pruneForecastCache(cache);

    expect(cache.has('perime')).toBe(false);
    expect(cache.has('vivant')).toBe(true);
  });

  it('ne touche pas à un cache sain', () => {
    const cache = new Map([
      ['a', { expiresAt: Date.now() + MINUTE }],
      ['b', { expiresAt: Date.now() + 2 * MINUTE }],
    ]);

    pruneForecastCache(cache);

    expect(cache.size).toBe(2);
  });

  it('plafonne un cache saturé en sacrifiant les entrées les plus proches de l expiration', () => {
    // 400 entrées vivantes : le plafond doit les ramener à 288. On donne des
    // chances croissantes pour vérifier que l'éviction retire bien les plus
    // tôt, pas les premières insérées.
    const base = Date.now() + MINUTE;
    const cache = new Map<string, { expiresAt: number }>();
    for (let i = 0; i < 400; i += 1) {
      cache.set(`h${i}`, { expiresAt: base + i * MINUTE });
    }

    pruneForecastCache(cache);

    expect(cache.size).toBe(288);
    // Les 112 premières (les plus proches de l'expiration) sont parties.
    expect(cache.has('h0')).toBe(false);
    expect(cache.has('h111')).toBe(false);
    // Les plus lointaines sont restées.
    expect(cache.has('h112')).toBe(true);
    expect(cache.has('h399')).toBe(true);
  });
});
