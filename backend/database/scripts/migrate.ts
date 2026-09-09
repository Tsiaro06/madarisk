import fs from 'fs';
import path from 'path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INTEGER
    );
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<string[]> {
  const result = await client.query<{ filename: string }>('SELECT filename FROM _migrations ORDER BY id');
  return result.rows.map((r) => r.filename);
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function run(): Promise<void> {
  const { env } = await import('../../src/config/env');
  const { assertLocalDbWritable } = await import('./assert-local-db');

  assertLocalDbWritable({ databaseUrl: env.DATABASE_URL, host: env.DB_HOST });

  const connectionString = env.DATABASE_URL || `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  const pool = new pg.Pool({
    connectionString,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const client = await pool.connect();

  try {
    console.log('--- Gestionnaire de migrations MadaRisk ---\n');

    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();
    const pending = files.filter((f) => !applied.includes(f));

    if (pending.length === 0) {
      console.log('Aucune migration en attente. Base à jour.\n');
      return;
    }

    console.log(`${pending.length} migration(s) en attente :\n`);

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`  ▸ Application de ${file}...`);

      const start = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        const duration = Date.now() - start;
        await client.query(
          'INSERT INTO _migrations (filename, duration_ms) VALUES ($1, $2)',
          [file, duration],
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${file} appliquée avec succès (${duration}ms).`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Erreur lors de ${file}:`);
        console.error(`    ${err instanceof Error ? err.message : err}`);
        throw err;
      }
    }

    console.log(`\n--- ${pending.length} migration(s) appliquée(s) avec succès ---`);
  } finally {
    await client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\nMigration échouée:', err);
  process.exit(1);
});
