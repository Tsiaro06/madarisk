import pg from 'pg';
import bcrypt from 'bcrypt';
import path from 'path';

export async function runBaseSeed(): Promise<void> {
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

    // 5. Règles de détection automatique par défaut (portée nationale).
    //    Guard : clé naturelle (hazard_type, metric, horizon) pour rester idempotent.
    //    created_by NULL + sans portée géographique = marqueur des règles seedées
    //    (les tests d'intégration les suspendent pendant leurs exécutions).
    const detectionRules: Array<{
      hazardType: string;
      metric: string;
      operator: string;
      threshold: number;
      horizon: number;
      severityRules: Array<{ level: string; min: number }>;
      label: string;
    }> = [
      {
        hazardType: 'CYCLONE',
        metric: 'wind_gusts',
        operator: 'GT',
        threshold: 90,
        horizon: 0,
        severityRules: [
          { level: 'MODEREE', min: 20 },
          { level: 'ELEVEE', min: 45 },
          { level: 'EXTREME', min: 75 },
        ],
        label: 'Cyclone — rafales > 90 km/h (observé)',
      },
      {
        hazardType: 'CYCLONE',
        metric: 'pressure',
        operator: 'LT',
        threshold: 1000,
        horizon: 0,
        severityRules: [
          { level: 'MODEREE', min: 1 },
          { level: 'ELEVEE', min: 3 },
          { level: 'EXTREME', min: 6 },
        ],
        label: 'Cyclone — pression < 1000 hPa (observé)',
      },
      {
        hazardType: 'FORTE_PLUIE',
        metric: 'rainfall',
        operator: 'GT',
        threshold: 50,
        horizon: 0,
        severityRules: [
          { level: 'MODEREE', min: 20 },
          { level: 'ELEVEE', min: 50 },
          { level: 'EXTREME', min: 100 },
        ],
        label: 'Forte pluie — > 50 mm/24h (observé)',
      },
      {
        hazardType: 'FORTE_PLUIE',
        metric: 'rainfall',
        operator: 'GT',
        threshold: 50,
        horizon: 48,
        severityRules: [
          { level: 'MODEREE', min: 20 },
          { level: 'ELEVEE', min: 50 },
          { level: 'EXTREME', min: 100 },
        ],
        label: 'Forte pluie — > 50 mm/24h (prévision 48 h)',
      },
      {
        hazardType: 'VENT_VIOLENT',
        metric: 'wind',
        operator: 'GT',
        threshold: 60,
        horizon: 0,
        severityRules: [
          { level: 'MODEREE', min: 20 },
          { level: 'ELEVEE', min: 50 },
          { level: 'EXTREME', min: 85 },
        ],
        label: 'Vent violent — > 60 km/h (observé)',
      },
      {
        hazardType: 'VAGUE_DE_CHALEUR',
        metric: 'temperature',
        operator: 'GE',
        threshold: 35,
        horizon: 48,
        severityRules: [
          { level: 'MODEREE', min: 10 },
          { level: 'ELEVEE', min: 25 },
          { level: 'EXTREME', min: 40 },
        ],
        label: 'Vague de chaleur — ≥ 35 °C (prévision 48 h)',
      },
    ];

    let rulesCreated = 0;
    for (const rule of detectionRules) {
      const existing = await client.query(
        `SELECT 1 FROM hazard_detection_rules
         WHERE hazard_type = $1 AND metric = $2 AND forecast_horizon_hours = $3
         LIMIT 1`,
        [rule.hazardType, rule.metric, rule.horizon],
      );
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO hazard_detection_rules
             (hazard_type, metric, operator, threshold, duration_minutes,
              aggregation_window_minutes, forecast_horizon_hours, severity_rules,
              is_active, created_by)
           VALUES ($1, $2, $3, $4, 0, 60, $5, $6, true, NULL)`,
          [
            rule.hazardType,
            rule.metric,
            rule.operator,
            rule.threshold,
            rule.horizon,
            JSON.stringify(rule.severityRules),
          ],
        );
        rulesCreated += 1;
        console.log(`  ✓ Règle de détection créée : ${rule.label}.`);
      } else {
        // Règle seedée existante : le seed reste la source de vérité des seuils.
        // `created_by IS NULL` protège les règles créées via l'API CRUD.
        const updated = await client.query(
          `UPDATE hazard_detection_rules
              SET operator = $1, threshold = $2, severity_rules = $3, updated_at = now()
            WHERE hazard_type = $4 AND metric = $5 AND forecast_horizon_hours = $6
              AND created_by IS NULL
              AND (operator IS DISTINCT FROM $1 OR threshold IS DISTINCT FROM $2
                   OR severity_rules IS DISTINCT FROM $3::jsonb)`,
          [
            rule.operator,
            rule.threshold,
            JSON.stringify(rule.severityRules),
            rule.hazardType,
            rule.metric,
            rule.horizon,
          ],
        );
        if ((updated.rowCount ?? 0) > 0) {
          rulesCreated += 1;
          console.log(`  ✓ Règle de détection mise à jour : ${rule.label}.`);
        }
      }
    }
    if (rulesCreated === 0) {
      console.log('  ○ Règles de détection par défaut à jour.');
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

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return entry ? path.resolve(entry) === path.resolve(__filename) : false;
}

if (isDirectInvocation()) {
  runBaseSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
