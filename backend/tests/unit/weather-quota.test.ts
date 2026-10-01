import { describe, it, expect } from 'vitest';
import { env } from '../../src/config/env';
import { pruneForecastCache } from '../../src/services/openmeteo.provider';

/**
 * Garde-fou du quota Open-Meteo.
 *
 * Open-Meteo ne compte pas les requÃªtes mais les COORDONNÃ‰ES : un run national
 * sur les 1579 communes coÃ»te environ 1580 appels. La cadence des crons est donc
 * un budget, pas un rÃ©glage de confort â€” c'est ce qui a fait tomber la
 * production le 01/10 (57 000 appels/jour pour un plafond gratuit de 10 000, et
 * 429 Â« hourly limit Â» dÃ¨s le premier lot).
 *
 * Ces tests Ã©chouent dÃ¨s qu'on resserre une cadence ou qu'on rajoute des
 * communes, ce qui est exactement le moment oÃ¹ il faut s'en apercevoir.
 */

/** Plafond de l'offre gratuite, en appels de coordonnÃ©es par jour. */
const FREE_DAILY_LIMIT = 10_000;
/** Plafond horaire de l'offre gratuite. */
const FREE_HOURLY_LIMIT = 5_000;
/** Nombre de communes ciblÃ©es par les runs nationaux (Madagascar). */
const TARGET_COMMUNES = 1579;

/**
 * Nombre d'exÃ©cutions par jour d'un cron quotidien.
 *
 * Volontairement restreint aux formes rÃ©ellement utilisÃ©es ici : champ heure Ã 
 * `*`, pas de `*` suivi de N, ou une heure fixe. Toute autre forme lÃ¨ve une
 * erreur plutÃ´t que de renvoyer un compte faux, pour ne pas laisser un test au
 * vert sur une cadence non analysÃ©e.
 */
function dailyRuns(cron: string): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron non gÃ©rÃ© : ${cron}`);
  const hour = fields[1];
  if (hour === undefined) throw new Error(`cron non gÃ©rÃ© : ${cron}`);
  if (hour === '*') return 24;
  const step = /^\*\/(\d+)$/.exec(hour);
  if (step) return 24 / Number(step[1]);
  if (/^\d+$/.test(hour)) return 1;
  throw new Error(`cron non gÃ©rÃ© : ${cron}`);
}

/** PÃ©riode entre deux exÃ©cutions, en minutes. */
function periodMinutes(cron: string): number {
  return (24 * 60) / dailyRuns(cron);
}

describe('quota Open-Meteo : le budget de la cadence tient', () => {
  it('reste sous le plafond quotidien gratuit', () => {
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    const dailyCost = runs * TARGET_COMMUNES;

    // Un run d'observations (9 variables, 1 jour) et un run de prÃ©visions
    // (3 variables, 3 jours) coÃ»tent chacun environ 1 appel par commune :
    // Open-Meteo pondÃ¨re les couples (jours x variables), 15 Ã©quivalant Ã  1,5.
    expect(dailyCost).toBeLessThanOrEqual(FREE_DAILY_LIMIT);
  });

  it('reste sous le plafond horaire gratuit sur un run isolÃ©', () => {
    expect(TARGET_COMMUNES).toBeLessThan(FREE_HOURLY_LIMIT);
  });

  it('garde la place pour une relance manuelle d urgence', () => {
    // Une panne de fournisseur se rattrape Ã  la main, ou aprÃ¨s une veille. Si le
    // budget journalier est dÃ©jÃ  consommÃ© Ã  95 %, cette relance fait reborder le
    // quota et on perd les observations ET la relance.
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    const dailyCost = runs * TARGET_COMMUNES;
    expect(dailyCost + TARGET_COMMUNES).toBeLessThanOrEqual(FREE_DAILY_LIMIT);
  });
});

describe('seuils de pÃ©remption : cohÃ©rents avec la pÃ©riode des crons', () => {
  it('le seuil des observations dÃ©passe la pÃ©riode du cron', () => {
    // Sinon le bandeau vire au rouge pendant un cycle pourtant normal.
    expect(env.WEATHER_OBSERVATION_STALE_MINUTES).toBeGreaterThan(
      periodMinutes(env.WEATHER_OBSERVATION_CRON),
    );
  });

  it('le seuil des prÃ©visions dÃ©passe la pÃ©riode du cron', () => {
    expect(env.WEATHER_FORECAST_STALE_HOURS).toBeGreaterThan(
      periodMinutes(env.WEATHER_FORECAST_CRON) / 60,
    );
  });

  it('signale une panne avant deux cycles complets', () => {
    // Trop lÃ¢che, le bandeau resterait vert pendant toute la panne.
    expect(env.WEATHER_OBSERVATION_STALE_MINUTES).toBeLessThan(
      2 * periodMinutes(env.WEATHER_OBSERVATION_CRON),
    );
  });

  it('signale une panne de prÃ©visions avant deux cycles complets', () => {
    expect(env.WEATHER_FORECAST_STALE_HOURS).toBeLessThan(
      2 * (periodMinutes(env.WEATHER_FORECAST_CRON) / 60),
    );
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

  it('plafonne un cache saturé en sacrifiant les entrées les plus proches de l`expiration', () => {
    // 400 entrées vivantes : le plafond doit les ramener à 288. On donne des
    // échéances croissantes pour vérifier que l'éviction retire bien les plus
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
