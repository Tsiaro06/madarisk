import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

export function resolveDumpFile(): string {
  const cliArg = process.argv.find((arg) => arg.startsWith('--file='));
  const fromArg = cliArg ? cliArg.slice('--file='.length) : undefined;
  const value = fromArg ?? process.env.DEMO_DUMP_FILE;
  if (value && value.trim().length > 0) return path.resolve(value.trim());
  return path.resolve(__dirname, '..', '..', 'demo-dumps', 'mada_risk_demo.dump');
}

export async function dumpDemo(): Promise<void> {
  const ctx = await loadDemoContext();
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const file = resolveDumpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const result = spawnSync(
    'pg_dump',
    ['--format=custom', `--dbname=${ctx.connectionString}`, `--file=${file}`],
    {
      env: { ...process.env, PGPASSWORD: String(ctx.env.DB_PASSWORD) },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (result.error) {
    throw new Error(
      `pg_dump introuvable ou en échec (${result.error.message}). Installez les outils PostgreSQL.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump a échoué avec le code ${result.status}.`);
  }

  console.log(`  ✓ Sauvegarde créée : ${file}`);
}

const entry = process.argv[1];
const invokedDirectly = entry ? /dump-demo\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  dumpDemo().catch((err) => {
    console.error('\nSauvegarde démo échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
