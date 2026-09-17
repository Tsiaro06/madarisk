import { loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

/** Applique les migrations SQL existantes à la base de démonstration. */
export async function migrateDemo(): Promise<void> {
  const ctx = await loadDemoContext();
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const { runMigrations } = await import('../migrate');
  await runMigrations();
}

const entry = process.argv[1];
const invokedDirectly = entry ? /migrate-demo\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  migrateDemo().catch((err) => {
    console.error('\nMigration démo échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
