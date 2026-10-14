import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { cycloneRepository } from '../repositories/cyclone.repository';
import { cycloneSyncService } from '../services/cyclone-sync.service';

let started = false;

/**
 * Âge minimal du dernier cycle avant un rattrapage au démarrage.
 *
 * Le processus redémarre souvent (`tsx watch`, veille machine) : sans ce garde,
 * chaque redémarrage relancerait un téléchargement IBTrACS + GDACS. Six heures
 * correspondent à la cadence réelle de publication des agences.
 */
const CATCH_UP_MIN_INTERVAL_HOURS = 6;

async function catchUpIfStale(): Promise<void> {
  try {
    const latest = await cycloneRepository.latestRun();
    const ageHours =
      latest === null ? Infinity : (Date.now() - new Date(latest.startedAt).getTime()) / 3_600_000;
    if (ageHours < CATCH_UP_MIN_INTERVAL_HOURS) return;

    logger.info(
      { ageHours: Number.isFinite(ageHours) ? Math.round(ageHours) : null },
      'Job cyclone : rattrapage au démarrage',
    );
    await cycloneSyncService.run('SCHEDULED');
  } catch (err) {
    logger.warn({ err }, 'Job cyclone : rattrapage ignoré (échec)');
  }
}

/**
 * Synchronisation cyclone : veille GDACS + trajectoire/rayons IBTrACS.
 * Gated par `ENABLE_SCHEDULED_JOBS`, comme les autres jobs.
 */
export function startCycloneSyncJob(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.CYCLONE_SYNC_CRON, () => {
    void cycloneSyncService.run('SCHEDULED').catch((err) => {
      logger.error({ err }, 'Job cyclone : cycle planifié en échec');
    });
  });

  void catchUpIfStale();

  logger.info({ cron: env.CYCLONE_SYNC_CRON }, 'Job cyclone planifié (ENABLE_SCHEDULED_JOBS=true)');
}
