import pg from 'pg';
import bcrypt from 'bcrypt';

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
    console.log('--- Seed MadaRisk ---\n');
    await client.query('BEGIN');

    // 1. Organisation MadaRisk
    const orgResult = await client.query<{ id: string }>(
      "SELECT id FROM organizations WHERE name = 'MadaRisk Organisation' LIMIT 1",
    );
    let orgId: string;
    if (orgResult.rows.length === 0) {
      const insert = await client.query<{ id: string }>(
        "INSERT INTO organizations (name, type, email) VALUES ('MadaRisk Organisation', 'INSTITUTION', 'contact@madarisk.mg') RETURNING id",
      );
      orgId = insert.rows[0].id;
      console.log('  ✓ Organisation "MadaRisk Organisation" créée.');
    } else {
      orgId = orgResult.rows[0].id;
      console.log('  ○ Organisation "MadaRisk Organisation" existe déjà.');
    }

    // 2. Configuration de risque par défaut
    const riskConfigResult = await client.query<{ id: string }>(
      "SELECT id FROM risk_configurations WHERE name = 'Configuration par défaut' LIMIT 1",
    );
    if (riskConfigResult.rows.length === 0) {
      await client.query(
        `INSERT INTO risk_configurations
           (name, rain_weight, wind_weight, proximity_weight, vulnerability_weight, exposure_weight,
            low_threshold, moderate_threshold, high_threshold, extreme_threshold, is_active)
         VALUES ($1, 0.30, 0.25, 0.20, 0.15, 0.10, 20, 40, 60, 80, true)`,
        ['Configuration par défaut'],
      );
      console.log('  ✓ Configuration de risque par défaut créée.');
    } else {
      console.log('  ○ Configuration de risque par défaut existe déjà.');
    }

    // 3. Source météo Open-Meteo
    const weatherResult = await client.query<{ id: string }>(
      "SELECT id FROM weather_sources WHERE name = 'Open-Meteo' LIMIT 1",
    );
    if (weatherResult.rows.length === 0) {
      await client.query(
        `INSERT INTO weather_sources (name, provider_type, base_url, refresh_interval_minutes)
         VALUES ('Open-Meteo', 'OPEN_METEO', 'https://api.open-meteo.com', 60)`,
      );
      console.log('  ✓ Source météo "Open-Meteo" créée.');
    } else {
      console.log('  ○ Source météo "Open-Meteo" existe déjà.');
    }

    // 4. Utilisateurs de test (seulement si aucun utilisateur n'existe)
    const userCount = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      const saltRounds = env.BCRYPT_SALT_ROUNDS || 12;
      const adminHash = await bcrypt.hash('Admin@123!', saltRounds);
      const operatorHash = await bcrypt.hash('Operator@123!', saltRounds);

      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id)
         VALUES ($1, $2, 'Admin', 'MadaRisk', 'SUPER_ADMIN', $3)`,
        ['admin@madarisk.mg', adminHash, orgId],
      );
      console.log('  ✓ Utilisateur admin créé (admin@madarisk.mg / Admin@123!).');

      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id)
         VALUES ($1, $2, 'Operateur', 'MadaRisk', 'ADMIN', $3)`,
        ['operator@madarisk.mg', operatorHash, orgId],
      );
      console.log('  ✓ Utilisateur opérateur créé (operator@madarisk.mg / Operator@123!).');
    } else {
      console.log(`  ○ ${userCount.rows[0].count} utilisateur(s) existent déjà, pas de seed utilisateur.`);
    }

    await client.query('COMMIT');
    console.log('\n--- Seed terminé avec succès ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nSeed échoué:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    await client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
