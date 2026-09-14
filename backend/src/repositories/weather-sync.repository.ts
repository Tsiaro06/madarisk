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
