import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherSyncService } from '../services/weather-sync.service';

let started = false;

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

  logger.info(
    { observation: env.WEATHER_OBSERVATION_CRON, forecast: env.WEATHER_FORECAST_CRON },
    'Jobs météo planifiés (ENABLE_SCHEDULED_JOBS=true)',
  );
}
