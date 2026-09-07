import pg from 'pg';
import { env } from './env';
import { logger } from './logger';

function buildConnectionString(): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = env;
  return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

const connectionString = buildConnectionString();

const pool = new pg.Pool({
  connectionString,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Erreur inattendue sur le pool PostgreSQL');
});

logger.info(
  { host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME },
  'Connexion PostgreSQL configurée',
);

export const db = {
  pool,

  async query<T extends pg.QueryResultRow = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    const start = Date.now();
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, duration, rows: result.rowCount }, 'Requête SQL exécutée');
    return result;
  },

  async getClient(): Promise<pg.PoolClient> {
    return pool.connect();
  },

  async healthCheck(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },
};
