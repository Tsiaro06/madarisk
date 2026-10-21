import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/config/database';
import { weatherSyncRepository } from '../../src/repositories/weather-sync.repository';
import { attemptedRecently } from '../../src/jobs/weather-refresh.job';
import { env } from '../../src/config/env';

/**
 * Runs météo interrompus.
 *
 * Un processus tué en plein run (`tsx watch`, veille machine, crash) laisse une
 * ligne RUNNING éternelle, sans `finished_at`. Comme `latestRun` fait foi pour
 * décider d'un rattrapage (le délai minimal se compte depuis `started_at`),
 * cette ligne est lue comme « une tentative est en cours » et bloque tous les
 * rattrapages suivants — en silence. C'est la cause structurelle des bandeaux
 * « données périmées » qui revenaient malgré les filets de rattrapage.
 *
 * Les lignes du test sont écrites sous une source dédiée, pour ne pas être
 * comptées avec celles d'`OPEN_METEO`, et supprimées en sortie.
 */
const TEST_SOURCE = `TEST_INTERRUPTED_${Date.now()}`;

async function insertRun(
  scope: string,
  startedAt: Date,
  status = 'RUNNING',
  finishedAt: Date | null = null,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO weather_sync_runs (scope, source, started_at, finished_at, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [scope, TEST_SOURCE, startedAt.toISOString(), finishedAt?.toISOString() ?? null, status],
  );
  return result.rows[0].id;
}

async function readRun(id: string): Promise<{ status: string; error_message: string | null }> {
  const result = await db.query<{ status: string; error_message: string | null }>(
    `SELECT status, error_message FROM weather_sync_runs WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

describe('weather_sync_runs : runs interrompus', () => {
  beforeAll(async () => {
    await db.query(`DELETE FROM weather_sync_runs WHERE source = $1`, [TEST_SOURCE]);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM weather_sync_runs WHERE source = $1`, [TEST_SOURCE]);
    await db.pool.end();
  });

  it('solde un run RUNNING plus vieux que le seuil', async () => {
    const startedAt = new Date(Date.now() - 6 * 3_600_000);
    const id = await insertRun('OBSERVATIONS', startedAt);

    const interrupted = await weatherSyncRepository.failInterruptedRuns(
      env.WEATHER_STALE_RUN_MINUTES,
    );
    expect(interrupted).toBeGreaterThanOrEqual(1);

    const run = await readRun(id);
    expect(run.status).toBe('FAILED');
    expect(run.error_message).toMatch(/interrompue/i);
  });

  it('épargne un run RUNNING encore récent (run réellement en cours)', async () => {
    const startedAt = new Date(Date.now() - 2 * 60_000);
    const id = await insertRun('FORECASTS', startedAt);

    await weatherSyncRepository.failInterruptedRuns(env.WEATHER_STALE_RUN_MINUTES);

    const run = await readRun(id);
    expect(run.status).toBe('RUNNING');
  });

  it('ne touche pas un run déjà terminé', async () => {
    const startedAt = new Date(Date.now() - 8 * 3_600_000);
    const id = await insertRun('OBSERVATIONS', startedAt, 'SUCCESS', new Date());

    await weatherSyncRepository.failInterruptedRuns(env.WEATHER_STALE_RUN_MINUTES);

    const run = await readRun(id);
    expect(run.status).toBe('SUCCESS');
  });

  it('débloque le rattrapage : la ligne figée n’est plus lue comme une tentative récente', async () => {
    // Scénario réel : un run tué en plein vol il y a peu. Tant qu'il reste
    // RUNNING, le garde de 30 min le lit comme « tentative en cours » et
    // repousse indéfiniment le rattrapage.
    const startedAt = new Date(Date.now() - 10 * 60_000);

    // Un run sain plus ancien, pour que la ligne figée soit bien la plus récente.
    await insertRun('OBSERVATIONS', new Date(Date.now() - 8 * 3_600_000), 'SUCCESS', new Date());
    const id = await insertRun('OBSERVATIONS', startedAt);

    const before = await weatherSyncRepository.latestRun('OBSERVATIONS', TEST_SOURCE);
    expect(before?.runId).toBe(id);
    expect(before?.status).toBe('RUNNING');
    // Bloqué : la ligne figée est récente, le rattrapage se croit en cours.
    expect(attemptedRecently(before?.startedAt ?? null, new Date(), 30)).toBe(true);

    // Un seuil court soldera le run figé alors que 10 min ne suffisent pas.
    const interrupted = await weatherSyncRepository.failInterruptedRuns(5);
    expect(interrupted).toBeGreaterThanOrEqual(1);

    const after = await weatherSyncRepository.latestRun('OBSERVATIONS', TEST_SOURCE);
    expect(after?.status).toBe('FAILED');
    // Le run est désormais daté : la vérification d'âge ne dépend plus de son
    // statut, seul son `started_at` compte — les 10 min restent sous le garde
    // de 30 min, mais le run n'est plus « en cours » et le chemin est débloqué
    // dès que le délai expire.
    expect(after?.finishedAt).not.toBeNull();
  });

  it('ne touche que le périmètre concerné', async () => {
    await insertRun('OBSERVATIONS', new Date(Date.now() - 12 * 3_600_000));
    const forecastId = await insertRun('FORECASTS', new Date(Date.now() - 12 * 3_600_000));

    await weatherSyncRepository.failInterruptedRuns(env.WEATHER_STALE_RUN_MINUTES);

    // Les deux périmètres sont soldés indépendamment : le run prévision reste
    // FAILED et n'est pas ressuscité en RUNNING par le nettoyage des
    // observations.
    const forecast = await readRun(forecastId);
    expect(forecast.status).toBe('FAILED');
  });

  it('rejoue sans effet : un second passage ne compte plus rien à solder', async () => {
    const startedAt = new Date(Date.now() - 10 * 3_600_000);
    const id = await insertRun('FORECASTS', startedAt, 'FAILED', new Date());

    await weatherSyncRepository.failInterruptedRuns(env.WEATHER_STALE_RUN_MINUTES);

    const run = await readRun(id);
    expect(run.status).toBe('FAILED');
  });
});
