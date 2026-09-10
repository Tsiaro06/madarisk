import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { startWeatherRefreshJob } from './jobs/weather-refresh.job';
import { startRiskRecalculationJob } from './jobs/risk-recalculation.job';
import { startDgmMaproomIngestJob } from './jobs/dgm-maproom-ingest.job';

async function main(): Promise<void> {
  const dbOk = await db.healthCheck();
  if (!dbOk) {
    logger.warn('Base de données indisponible — le serveur démarre quand même.');
  } else {
    logger.info('Connexion PostgreSQL établie.');
  }

  startWeatherRefreshJob();
  startRiskRecalculationJob();
  startDgmMaproomIngestJob();

  app.listen(env.PORT, () => {
    logger.info(`🚀 MadaRisk API démarrée sur http://localhost:${env.PORT}`);
    logger.info(`📡 Environnement : ${env.NODE_ENV}`);
    logger.info(`📊 Base de données : ${dbOk ? 'connectée' : 'indisponible'}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Échec au démarrage du serveur');
  process.exit(1);
});
