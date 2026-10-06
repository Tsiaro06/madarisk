import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

/**
 * La base de test est celle du dev : les règles de détection seedées
 * (portée nationale, created_by NULL) évalueraient les vraies données
 * météo pendant les tests et créeraient des événements/Alertes parasite.
 *
 * Ce globalSetup les suspend avant la suite et les réactive après.
 * L'état est persisté sur disque pour survivre à un crash (auto-réparation
 * au lancement suivant).
 */
const STATE_FILE = path.join(os.tmpdir(), 'madarisk-test-detection-rules-state.json');

const SEEDED_RULES = `
  SELECT id FROM hazard_detection_rules
  WHERE is_active = true
    AND created_by IS NULL
    AND region_id IS NULL AND district_id IS NULL AND commune_id IS NULL
`;

async function withPool<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const { env } = await import('../src/config/env');
  const pool = new pg.Pool({
    connectionString:
      env.DATABASE_URL ||
      `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

function readState(): string[] {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function restore(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withPool((client) =>
    client.query('UPDATE hazard_detection_rules SET is_active = true WHERE id = ANY($1::uuid[])', [
      ids,
    ]),
  );
}

export async function setup(): Promise<void> {
  // Auto-réparation : un crash précédent peut avoir laissé les règles suspendues.
  const leftover = readState();
  if (leftover.length > 0) {
    await restore(leftover);
    fs.rmSync(STATE_FILE, { force: true });
  }

  const suspended = await withPool(async (client) => {
    const { rows } = await client.query<{ id: string }>(SEEDED_RULES);
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await client.query(
        'UPDATE hazard_detection_rules SET is_active = false WHERE id = ANY($1::uuid[])',
        [ids],
      );
    }
    return ids;
  });

  if (suspended.length > 0) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(suspended), 'utf-8');
  }
}

export async function teardown(): Promise<void> {
  const ids = readState();
  await restore(ids);
  fs.rmSync(STATE_FILE, { force: true });
}
