import { db } from '../config/database';
import { AutomationRunStatus } from '../types/automation.types';
import { WeatherSyncRunInfo } from '../types/weather.types';

interface RunRow {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  scope: string;
  source: string;
  records_processed: string;
  communes_processed: string;
  errors_count: string;
  error_message: string | null;
}

function mapRun(row: RunRow): WeatherSyncRunInfo {
  return {
    runId: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: (row.status as AutomationRunStatus) ?? null,
    scope: row.scope,
    source: row.source,
    recordsProcessed: parseInt(row.records_processed, 10),
    communesProcessed: parseInt(row.communes_processed, 10),
    errorsCount: parseInt(row.errors_count, 10),
    errorMessage: row.error_message,
  };
}

export interface FinishRunInput {
  status: AutomationRunStatus;
  recordsProcessed: number;
  communesProcessed: number;
  errorsCount: number;
  errorMessage?: string | null;
  details?: Record<string, unknown>;
}

export const weatherSyncRepository = {
  async createRun(scope: string, source: string): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO weather_sync_runs (scope, source) VALUES ($1, $2) RETURNING id`,
      [scope, source],
    );
    return result.rows[0].id;
  },

  async finishRun(runId: string, data: FinishRunInput): Promise<void> {
    await db.query(
      `UPDATE weather_sync_runs
       SET finished_at = now(),
           status = $2,
           records_processed = $3,
           communes_processed = $4,
           errors_count = $5,
           error_message = $6,
           details = $7
       WHERE id = $1`,
      [
        runId,
        data.status,
        data.recordsProcessed,
        data.communesProcessed,
        data.errorsCount,
        data.errorMessage ?? null,
        JSON.stringify(data.details ?? {}),
      ],
    );
  },

  /**
   * Marque FAILED les runs restés RUNNING au-delà de `olderThanMinutes`.
   *
   * Un processus tué en plein run (`tsx watch`, veille machine, crash) laisse
   * une ligne RUNNING éternelle. Comme `latestRun` fait foi pour décider d'un
   * rattrapage, cette ligne finit par être lue comme « une tentative est en
   * cours » : le délai minimal de 30 min n'expire jamais puisqu'il se compte
   * depuis ce même `started_at` figé, et tous les rattrapages suivants sont
   * bloqués en silence. Le seuil (≫ durée réelle d'un run, 4 à 15 min) garantit
   * qu'on ne solde jamais un run réellement en cours.
   */
  async failInterruptedRuns(olderThanMinutes: number): Promise<number> {
    const result = await db.query(
      `UPDATE weather_sync_runs
          SET finished_at = now(),
              status = 'FAILED',
              errors_count = errors_count + 1,
              error_message = COALESCE(
                error_message,
                'Synchronisation interrompue (processus arrêté avant la fin)'
              )
        WHERE status = 'RUNNING'
          AND started_at < now() - make_interval(mins => $1::int)`,
      [olderThanMinutes],
    );
    return result.rowCount ?? 0;
  },

  async latestRun(scope: string, source: string): Promise<WeatherSyncRunInfo | null> {
    const result = await db.query<RunRow>(
      `SELECT id, started_at, finished_at, status, scope, source,
              records_processed, communes_processed, errors_count, error_message
       FROM weather_sync_runs
       WHERE scope = $1 AND source = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [scope, source],
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  },

  async latestSuccessfulRun(scope: string, source: string): Promise<WeatherSyncRunInfo | null> {
    const result = await db.query<RunRow>(
      `SELECT id, started_at, finished_at, status, scope, source,
              records_processed, communes_processed, errors_count, error_message
       FROM weather_sync_runs
       WHERE scope = $1 AND source = $2 AND status = 'SUCCESS'
       ORDER BY started_at DESC
       LIMIT 1`,
      [scope, source],
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  },

  /**
   * Nombre de tentatives (tous statuts) d'un périmètre depuis un instant.
   *
   * Sert au plafond des rattrapages automatiques : un échec fournisseur laisse
   * le créneau manqué, et sans compteur le contrôle périodique retenterait
   * jusqu'au soir en consommant le budget Open-Meteo.
   */
  async runsSince(scope: string, source: string, since: Date): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM weather_sync_runs
       WHERE scope = $1 AND source = $2 AND started_at >= $3`,
      [scope, source, since.toISOString()],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  async recordProviderError(data: {
    provider: string;
    operation: string;
    statusCode: number | null;
    message: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await db.query(
      `INSERT INTO provider_errors (provider, operation, status_code, message, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        data.provider,
        data.operation,
        data.statusCode,
        data.message,
        JSON.stringify(data.details ?? {}),
      ],
    );
  },
};
