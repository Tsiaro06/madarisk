import { describe, it, expect } from 'vitest';
import { env } from '../../src/config/env';

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

  it('garde la place pour une relance manuelle d urgence', () => {
    // Une panne de fournisseur se rattrape à la main, ou après une veille. Si le
    // budget journalier est déjà consommé à 95 %, cette relance fait reborder le
    // quota et on perd les observations ET la relance.
    const runs = dailyRuns(env.WEATHER_OBSERVATION_CRON) + dailyRuns(env.WEATHER_FORECAST_CRON);
    const dailyCost = runs * TARGET_COMMUNES;
    expect(dailyCost + TARGET_COMMUNES).toBeLessThanOrEqual(FREE_DAILY_LIMIT);
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
