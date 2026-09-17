import readline from 'readline';
import { createMaintenancePool, loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

function expectedConfirmation(dbName: string): string {
  return `SUPPRIMER ${dbName}`;
}

function askConfirmation(dbName: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `\nCette opération va SUPPRIMER puis RECRÉER la base « ${dbName} ».\n` +
        `Pour confirmer, saisissez exactement : ${expectedConfirmation(dbName)}\n> `,
      (answer) => {
        rl.close();
        resolve(answer.trim());
      },
    );
  });
}

/**
 * Réinitialise intégralement la base de démonstration :
 * suppression, recréation, migrations, seed de base et scénario.
 * Demande une confirmation explicite et n'opère jamais sur une base non démo.
 */
export async function resetDemo(): Promise<void> {
  const ctx = await loadDemoContext();
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const expected = expectedConfirmation(ctx.dbName);
  const answer = await askConfirmation(ctx.dbName);
  if (answer !== expected) {
    console.log('\nConfirmation invalide. Aucune opération effectuée.');
    return;
  }

  const safeName = ctx.dbName.replace(/"/g, '""');

  const maintenance = createMaintenancePool(ctx);
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS "${safeName}" WITH (FORCE)`);
    console.log(`  ✓ Base « ${ctx.dbName} » supprimée.`);
    await maintenance.query(`CREATE DATABASE "${safeName}"`);
    console.log(`  ✓ Base « ${ctx.dbName} » recréée.`);
  } finally {
    await maintenance.end();
  }

  const { runMigrations } = await import('../migrate');
  await runMigrations();

  const { runScenarioSeed } = await import('./seed-scenario');
  await runScenarioSeed();

  console.log('\n--- Réinitialisation de la démonstration terminée ---');
}

const entry = process.argv[1];
const invokedDirectly = entry ? /reset-demo\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  resetDemo().catch((err) => {
    console.error('\nRéinitialisation échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
