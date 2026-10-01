import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository } from '../repositories/weather.repository';

let started = false;
let running = false;

/**
 * Instant de coupure de la retention, calcule ici pour rester testable sans
 * base : le reste du fichier ne fait que du branching.
 *
 * `nowMs` et `retentionDays` sont injectes pour que le test fixe l'horloge.
 */
export function hourlyRetentionCutoff(nowMs: number, retentionDays: number): string {
  return new Date(nowMs - retentionDays * 24 * 3_600_000).toISOString();
}

/**
 * Retention de `weather_hourly`.
 *
 * Chaque run d'observations reecrit une fenetre glissante (hier en reanalyse,
 * J+2 en prevision) en `DO UPDATE`. Les heures qui sortent de la fenetre ne
 * sont donc plus jamais reecrites, mais rien ne les supprimait : la table
 * grossissait d'environ 9 500 lignes orphelines par run, soit ~38 000 par jour
 * et ~500 Mo par mois pour 1 579 communes.
 *
 * La purge est quotidienne et decalee des crons meteo. Elle ne supprime que des
 * heures anterieures a la limite, donc jamais une heure de la fenetre affichee
 * (24 h de passe + 48 h de prevision), meme si le dernier run est vieux.
 */
export async function purgeWeatherHourly(): Promise<void> {
  const cutoff = hourlyRetentionCutoff(Date.now(), env.WEATHER_HOURLY_RETENTION_DAYS);
  const deleted = await weatherRepository.purgeHourlyBefore(cutoff);
  if (deleted > 0) {
    logger.info(
      { deleted, retentionDays: env.WEATHER_HOURLY_RETENTION_DAYS, cutoff },
      'Job meteo : purge des heures hors retention',
    );
  } else {
    logger.debug(
      { retentionDays: env.WEATHER_HOURLY_RETENTION_DAYS, cutoff },
      'Job meteo : rien a purger',
    );
  }
}

export function startWeatherHourlyPurgeJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.WEATHER_HOURLY_PURGE_CRON, () => {
    void (async () => {
      if (running) {
        logger.warn('Job meteo : purge encore en cours, passage ignore');
        return;
      }
      running = true;
      try {
        await purgeWeatherHourly();
      } catch (err) {
        // Un echec de purge n'a aucune consequence metier : la table ne fait
        // que grossir. On ne veut surtout pas faire tomber le run d'observations.
        logger.warn({ err }, 'Job meteo : purge ignoree (echec)');
      } finally {
        running = false;
      }
    })();
  });

  logger.info(
    { cron: env.WEATHER_HOURLY_PURGE_CRON, retentionDays: env.WEATHER_HOURLY_RETENTION_DAYS },
    'Job meteo : purge de retention planifiee (ENABLE_SCHEDULED_JOBS=true)',
  );
}
