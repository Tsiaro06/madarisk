import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/config/database';
import { weatherSyncRepository } from '../../src/repositories/weather-sync.repository';

/**
 * Compteur de tentatives par créneau (`runsSince`), qui plafonne les
 * rattrapages automatiques du contrôle périodique.
 *
 * `weather_sync_runs` est partagée avec les synchronisations réelles : les
 * lignes du test sont écrites sous un nom de source dédié pour ne pas être
 * comptées avec celles d'`OPEN_METEO`, et supprimées en sortie.
 */
const TEST_SOURCE = `TEST_CATCHUP_${Date.now()}`;
/** Créneau du cron d'observations (06:00 heure de Madagascar). */
const SLOT = new Date('2026-10-17T06:00:00+03:00');

async function insertRun(scope: string, startedAt: Date, status = 'SUCCESS'): Promise<void> {
  await db.query(
    `INSERT INTO weather_sync_runs (scope, source, started_at, finished_at, status)
     VALUES ($1, $2, $3, $3, $4)`,
    [scope, TEST_SOURCE, startedAt.toISOString(), status],
  );
}

describe('weather_sync_runs : tentatives depuis un créneau', () => {
  beforeAll(async () => {
    // La veille : hors créneau, ne doit pas compter.
    await insertRun('OBSERVATIONS', new Date(SLOT.getTime() - 22 * 3_600_000));
    // Le cron de 06:00, échoué (429 fournisseur), puis la relance du contrôle.
    await insertRun('OBSERVATIONS', new Date(SLOT.getTime() + 5 * 60_000), 'FAILED');
    await insertRun('OBSERVATIONS', new Date(SLOT.getTime() + 40 * 60_000), 'FAILED');
    await insertRun('FORECASTS', new Date(SLOT.getTime() + 5 * 60_000));
  });

  afterAll(async () => {
    await db.query(`DELETE FROM weather_sync_runs WHERE source = $1`, [TEST_SOURCE]);
    await db.pool.end();
  });

  it('compte les tentatives depuis le créneau, quel que soit le statut', async () => {
    expect(await weatherSyncRepository.runsSince('OBSERVATIONS', TEST_SOURCE, SLOT)).toBe(2);
  });

  it('ignore les runs antérieurs au créneau', async () => {
    const before = new Date(SLOT.getTime() - 24 * 3_600_000);
    expect(await weatherSyncRepository.runsSince('OBSERVATIONS', TEST_SOURCE, before)).toBe(3);
  });

  it('sépare les périmètres', async () => {
    expect(await weatherSyncRepository.runsSince('FORECASTS', TEST_SOURCE, SLOT)).toBe(1);
  });

  it('renvoie zéro quand le créneau n’a encore rien déclenché', async () => {
    const later = new Date(SLOT.getTime() + 10 * 3_600_000);
    expect(await weatherSyncRepository.runsSince('OBSERVATIONS', TEST_SOURCE, later)).toBe(0);
  });

  it('ne compte rien pour une source inconnue', async () => {
    expect(
      await weatherSyncRepository.runsSince('OBSERVATIONS', `${TEST_SOURCE}_ABSENT`, SLOT),
    ).toBe(0);
  });
});
