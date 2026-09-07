import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherService } from '../services/weather.service';

const SYSTEM_ACTOR = { id: 'system', role: 'SUPER_ADMIN' as const };

let started = false;

export function startWeatherRefreshJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.WEATHER_REFRESH_CRON, () => {
    void (async () => {
      logger.info('Job météo : démarrage du rafraîchissement des communes');
      try {
        const result = await weatherService.refresh({ confirmAll: true }, SYSTEM_ACTOR, {});
        logger.info(
          { targeted: result.totalTargeted, saved: result.totalSaved, failed: result.totalFailed },
          'Job météo : rafraîchissement terminé',
        );
      } catch (err) {
        logger.error({ err }, 'Job météo : échec du rafraîchissement');
      }
    })();
  });

  logger.info('Job météo planifié (ENABLE_SCHEDULED_JOBS=true)');
}
