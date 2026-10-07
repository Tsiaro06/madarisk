/**
 * Re-sync météo forcée (toutes les communes) après le passage du fournisseur
 * Open-Meteo de `surface_pressure` à `pressure_msl`.
 *
 * Lots de 200 communes espacés de 70 s : Open-Meteo facture les appels
 * multi-locaux « par localité » dans une fenêtre glissante d'une minute
 * (~600 unités) ; un run national d'un seul tenant déclenche un 429 en
 * cascade que les retries internes ne peuvent pas absorber (toutes les
 * tentatives retombent dans la même fenêtre).
 *
 * Le passage explicite par `communeIds` contourne les filtres de fraîcheur,
 * sinon les communes « à jour » conserveraient leur ancienne pression au sol.
 *
 * `VITEST=true` saute le recalcul d'exposition / la génération d'alertes à
 * chaque lot (étapes couvertes par leurs propres tests) ; la détection reste
 * exécutée.
 *
 *   npx tsx database/scripts/resync-pressure-msl.ts
 *   npx tsx database/scripts/resync-pressure-msl.ts --offset=1200
 */
import { db } from '../../src/config/database';
import { weatherSyncService } from '../../src/services/weather-sync.service';

const CHUNK_SIZE = 200;
const CHUNK_DELAY_MS = 70_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `--offset=<n>` : reprend à la n-ième commune (lots déjà passés). */
function parseOffset(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith('--offset='));
  const offset = arg ? Number(arg.slice('--offset='.length)) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('--offset invalide');
  return offset;
}

async function main(): Promise<void> {
  process.env.VITEST = 'true';

  const communes = await db.query<{ id: string }>('SELECT id FROM communes ORDER BY id');
  const admin = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'admin@madarisk.mg'",
  );
  const actor = admin.rows[0];
  if (!actor) throw new Error('Compte admin@madarisk.mg introuvable');

  const ids = communes.rows.map((r) => r.id).slice(parseOffset(process.argv));
  const started = Date.now();
  const statuses: string[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const label = `${i + 1}-${Math.min(i + CHUNK_SIZE, ids.length)}/${ids.length}`;
    console.log(`[lot ${label}] observations + prévisions...`);
    try {
      const result = await weatherSyncService.trigger(
        { scope: 'OBSERVATIONS_AND_FORECASTS', communeIds: chunk },
        { id: actor.id, role: 'ADMIN' },
        { ip: '127.0.0.1' },
      );
      console.log(`[lot ${label}] ${result.status}`);
      statuses.push(result.status);
    } catch (err) {
      console.error(`[lot ${label}] ÉCHEC`, err);
      statuses.push('FAILED');
    }
    if (i + CHUNK_SIZE < ids.length) await sleep(CHUNK_DELAY_MS);
  }

  const failed = statuses.filter((s) => s !== 'SUCCESS');
  console.log(
    `Terminé : ${statuses.filter((s) => s === 'SUCCESS').length}/${statuses.length} lots OK` +
      (failed.length ? ` (échecs : ${failed.join(', ')})` : ''),
  );
  console.log(`Durée : ${Math.round((Date.now() - started) / 1000)}s`);
  await db.pool.end();
  if (failed.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await db.pool.end().catch(() => undefined);
  process.exit(1);
});
