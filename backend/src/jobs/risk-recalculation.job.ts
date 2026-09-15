import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { eventsRepository } from '../repositories/events.repository';
import { risksService } from '../services/risk.service';

const SYSTEM_ACTOR = { id: 'system', role: 'SUPER_ADMIN' as const };

let started = false;
let running = false;

export function startRiskRecalculationJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.RISK_RECALCULATION_CRON, () => {
    void (async () => {
      if (running) {
        logger.warn('Job risque : exécution précédente toujours en cours, cycle ignoré');
        return;
      }
      running = true;
      try {
        logger.info('Job risque : démarrage du recalcul des événements actifs');
        const eventIds = await eventsRepository.listActiveEventIds();
        for (const eventId of eventIds) {
          try {
            const result = await risksService.recalculateEvent(
              eventId,
              'PENDANT',
              SYSTEM_ACTOR,
              {},
            );
            logger.info(
              { eventId, total: result.totalCommunes },
              'Job risque : recalcul terminé pour un événement',
            );
          } catch (err) {
            logger.warn({ eventId, err }, 'Job risque : recalcul impossible pour cet événement');
          }
        }
        logger.info({ events: eventIds.length }, 'Job risque : cycle de recalcul terminé');
      } catch (err) {
        logger.error({ err }, 'Job risque : échec du recalcul');
      } finally {
        running = false;
      }
    })();
  });

  logger.info('Job risque planifié (ENABLE_SCHEDULED_JOBS=true)');
}
