import fs from 'fs';
import { spawnSync } from 'child_process';
import { loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';
import { resolveDumpFile } from './dump-demo';

/**
 * Restaure une sauvegarde dans la base de démonstration.
 * Refuse toute base non `_demo` avant la moindre opération.
 */
export async function restoreDemo(): Promise<void> {
  const ctx = await loadDemoContext();
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const file = resolveDumpFile();
  if (!fs.existsSync(file)) {
    throw new Error(
      `Sauvegarde introuvable : ${file}. Créez-la d’abord avec npm run db:demo:dump.`,
    );
  }

  const result = spawnSync(
    'pg_restore',
    [`--dbname=${ctx.connectionString}`, '--clean', '--if-exists', '--no-owner', file],
    {
      env: { ...process.env, PGPASSWORD: String(ctx.env.DB_PASSWORD) },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (result.error) {
    throw new Error(
      `pg_restore introuvable ou en échec (${result.error.message}). Installez les outils PostgreSQL.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`pg_restore a échoué avec le code ${result.status}.`);
  }

  console.log(`  ✓ Sauvegarde restaurée depuis : ${file}`);
}

const entry = process.argv[1];
const invokedDirectly = entry ? /restore-demo\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  restoreDemo().catch((err) => {
    console.error('\nRestauration démo échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
