import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { alertsService } from '../services/alerts.service';

let started = false;
let running = false;

/**
 * Auto-archivage des alertes devenues sans objet.
 *
 * Une alerte rattachée à un événement `CLOTURE`, ou une alerte automatique
 * orpheline (événement supprimé, `event_id` NULL), n'est plus pertinente
 * opérationnellement : ce job la passe régulièrement en `ARCHIVEE` pour
 * qu'elle sorte de la vue « Alertes actives ». Idempotent et sans verrou
 * distribué — un garde anti-chevauchement évite les cycles simultanés dans un
 * même processus.
 */
export function startAlertsAutoArchiveJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.ALERTS_AUTO_ARCHIVE_CRON, () => {
    void (async () => {
      if (running) {
        logger.warn('Job auto-archivage : exécution précédente toujours en cours, cycle ignoré');
        return;
      }
      running = true;
      try {
        const count = await alertsService.archiveStaleAlerts();
        if (count > 0) {
          logger.info({ count }, 'Job auto-archivage : alertes sans objet archivées');
        }
      } catch (err) {
        logger.error({ err }, 'Job auto-archivage : échec du cycle');
      } finally {
        running = false;
      }
    })();
  });

  logger.info(
    { cron: env.ALERTS_AUTO_ARCHIVE_CRON },
    'Job auto-archivage des alertes sans objet (événement clôturé ou supprimé) planifié',
  );
}
