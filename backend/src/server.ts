import type { Server } from 'node:http';
import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { startWeatherSyncJobs } from './jobs/weather-refresh.job';
import { startWeatherHourlyPurgeJob } from './jobs/weather-hourly-purge.job';
import { startRiskRecalculationJob } from './jobs/risk-recalculation.job';
import { startDgmMaproomIngestJob } from './jobs/dgm-maproom-ingest.job';

let httpServer: Server | undefined;
let shuttingDown = false;

/**
 * Ouvre l'écoute HTTP en transformant `EADDRINUSE` en erreur explicite, au lieu
 * du crash brut de Node sur un évènement 'error' non géré.
 */
function listen(port: number): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Le port ${port} est déjà utilisé. Arrête l'instance précédente ` +
              '(un second "npm run dev", un ancien "tsx watch"…) ou lance ' +
              '"npm run free-port", puis réessaie.',
          ),
        );
        return;
      }
      reject(err);
    });
  });
}

/** Arrêt propre : libère le port puis le pool PostgreSQL avant de quitter. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Arrêt du serveur…');

  // Filet de sécurité : des connexions longues (SSE) ne doivent pas bloquer la sortie.
  const forceExit = setTimeout(() => process.exit(0), 3000);
  forceExit.unref();

  const server = httpServer;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  await db.pool.end().catch(() => undefined);
  process.exit(0);
}

async function main(): Promise<void> {
  const dbOk = await db.healthCheck();
  if (!dbOk) {
    logger.warn('Base de données indisponible — le serveur démarre quand même.');
  } else {
    logger.info('Connexion PostgreSQL établie.');
  }

  // Le port doit ouvrir AVANT le démarrage des jobs : une ingestion lourde au boot
  // bloquerait l'event loop et rendrait l'API injoignable (login compris) pendant plusieurs minutes.
  httpServer = await listen(env.PORT);

  logger.info(`🚀 MadaRisk API démarrée sur http://localhost:${env.PORT}`);
  logger.info(`📡 Environnement : ${env.NODE_ENV}`);
  logger.info(`📊 Base de données : ${dbOk ? 'connectée' : 'indisponible'}`);

  startWeatherSyncJobs();
  startWeatherHourlyPurgeJob();
  startRiskRecalculationJob();
  startDgmMaproomIngestJob();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.fatal({ err }, 'Échec au démarrage du serveur');
  process.exit(1);
});
