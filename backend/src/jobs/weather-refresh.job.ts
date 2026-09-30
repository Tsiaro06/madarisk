import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository } from '../repositories/weather.repository';
import { weatherSyncService } from '../services/weather-sync.service';

let started = false;

/**
 * Rattrapage au démarrage.
 *
 * Le backend s'arrête facilement (veille machine, `tsx watch`, coupure) : les
 * observations restaient alors figées à la dernière exécution réussie et le
 * bandeau annonçait cette ancienneté — « 31 h » — pendant tout le cycle de 4 h
 * qui suivait, alors qu'un simple relancement de la synchronisation suffisait.
 *
 * Le seuil est celui du bandeau : dès que la fraîcheur affichée bascule en
 * STALE, on relance. Au-delà, le rattrapage se déclencherait à chaque `tsx
 * watch` en mode développement.
 */
function catchUpOnStartupIfStale(): void {
  const thresholdMinutes = env.WEATHER_OBSERVATION_STALE_MINUTES;

  void (async () => {
    try {
      const sourceId = await weatherRepository.getSourceId();
      const lastDataAt = await weatherRepository.latestObservationAtForSource(sourceId);

      if (lastDataAt === null) {
        logger.info(
          'Job météo : aucune observation en base, synchronisation de rattrapage au démarrage',
        );
      } else {
        const lagMinutes = (Date.now() - new Date(lastDataAt).getTime()) / 60000;
        if (lagMinutes <= thresholdMinutes) return;
        logger.info(
          { lastDataAt, lagHours: Math.round(lagMinutes / 60), thresholdMinutes },
          'Job météo : observations périmées, synchronisation de rattrapage au démarrage',
        );
      }

      await weatherSyncService.runScheduled('OBSERVATIONS');
    } catch (err) {
      logger.warn({ err }, 'Job météo : rattrapage au démarrage ignoré (échec)');
    }
  })();
}

export function startWeatherSyncJobs(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.WEATHER_OBSERVATION_CRON, () => {
    void weatherSyncService.runScheduled('OBSERVATIONS');
  });
  cron.schedule(env.WEATHER_FORECAST_CRON, () => {
    void weatherSyncService.runScheduled('FORECASTS');
  });

  catchUpOnStartupIfStale();

  logger.info(
    { observation: env.WEATHER_OBSERVATION_CRON, forecast: env.WEATHER_FORECAST_CRON },
    'Jobs météo planifiés (ENABLE_SCHEDULED_JOBS=true)',
  );
}
