import { createMaintenancePool, loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

/**
 * Crée la base de démonstration vide (idempotent).
 * Aucune table n'est créée : exécutez ensuite db:demo:migrate.
 */
export async function createDemoDatabase(): Promise<void> {
  const ctx = await loadDemoContext();

  // Double garde explicite avant toute connexion.
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const pool = createMaintenancePool(ctx);
  try {
    const existing = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [ctx.dbName]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  ○ La base « ${ctx.dbName} » existe déjà.`);
      return;
    }

    const safeName = ctx.dbName.replace(/"/g, '""');
    await pool.query(`CREATE DATABASE "${safeName}"`);
    console.log(`  ✓ Base « ${ctx.dbName} » créée.`);
    console.log('\nÉtape suivante : npm run db:demo:migrate');
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1];
const invokedDirectly = entry ? /create-demo-db\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  createDemoDatabase().catch((err) => {
    console.error('\nCréation de la base démo échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
