import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherService } from '../services/weather.service';

const SYSTEM_ACTOR = { id: 'system', role: 'SUPER_ADMIN' as const };

let started = false;
let running = false;

export function startDgmMaproomIngestJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.DGM_MAPROOM_INGEST_CRON, () => {
    void (async () => {
      if (running) {
        logger.warn('Job DGM : ingestion précédente toujours en cours, cycle ignoré');
        return;
      }
      running = true;
      try {
        const result = await weatherService.ingestDgmMaproom(SYSTEM_ACTOR, {});
        logger.info(
          {
            dekad: result.dekadLabel,
            sampled: result.communesSampled,
            alreadyPresent: result.alreadyPresent,
            saved: result.saved,
          },
          'Job DGM : ingestion terminée',
        );
      } catch (err) {
        logger.error({ err }, 'Job DGM : échec de l’ingestion');
      } finally {
        running = false;
      }
    })();
  });

  // Ingestion immédiate au démarrage pour disposer des données dès le déploiement.
  void (async () => {
    if (running) {
      logger.warn('Job DGM : ingestion initiale ignorée, une exécution est déjà en cours');
      return;
    }
    running = true;
    try {
      await weatherService.ingestDgmMaproom(SYSTEM_ACTOR, {});
      logger.info('Job DGM : ingestion initiale terminée');
    } catch (err) {
      logger.warn({ err }, 'Job DGM : ingestion initiale échouée (cron maintenu actif)');
    } finally {
      running = false;
    }
  })();

  logger.info('Job DGM planifié (ENABLE_SCHEDULED_JOBS=true)');
}
