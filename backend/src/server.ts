import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { startWeatherSyncJobs } from './jobs/weather-refresh.job';
import { startWeatherHourlyPurgeJob } from './jobs/weather-hourly-purge.job';
import { startRiskRecalculationJob } from './jobs/risk-recalculation.job';
import { startDgmMaproomIngestJob } from './jobs/dgm-maproom-ingest.job';

const DEMO_BANNER = [
  '============================================================',
  'MODE DÉMONSTRATION ACTIF — base isolée utilisée, appels externes désactivés.',
  'Données simulées pour la soutenance : ne pas utiliser pour une décision réelle.',
  '============================================================',
].join('\n');

async function main(): Promise<void> {
  const dbOk = await db.healthCheck();
  if (!dbOk) {
    logger.warn('Base de données indisponible — le serveur démarre quand même.');
  } else {
    logger.info('Connexion PostgreSQL établie.');
  }

  // Le port doit ouvrir AVANT le démarrage des jobs : une ingestion lourde au boot
  // bloquerait l'event loop et rendrait l'API injoignable (login compris) pendant plusieurs minutes.
  await new Promise<void>((resolve) => {
    app.listen(env.PORT, () => resolve());
  });

  logger.info(`🚀 MadaRisk API démarrée sur http://localhost:${env.PORT}`);
  logger.info(`📡 Environnement : ${env.NODE_ENV}`);
  logger.info(`📊 Base de données : ${dbOk ? 'connectée' : 'indisponible'}`);
  if (env.DEMO_MODE) {
    logger.warn('🧪 Mode démonstration : jobs planifiés et appels externes neutralisés.');
  }

  if (env.DEMO_MODE) {
    console.warn(`\n${DEMO_BANNER}\n`);
    logger.warn(
      { database: env.DB_NAME },
      'MODE DÉMONSTRATION ACTIF — base isolée utilisée, appels externes désactivés.',
    );
  } else {
    // Les jobs planifiés restent strictement désactivés en mode démonstration.
    startWeatherSyncJobs();
    startWeatherHourlyPurgeJob();
    startRiskRecalculationJob();
    startDgmMaproomIngestJob();
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Échec au démarrage du serveur');
  process.exit(1);
});
