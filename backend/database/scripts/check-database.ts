import pg from 'pg';

function buildConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_NAME || 'mada_risk';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

interface CheckResult {
  databaseConnected: boolean;
  postgresVersion: string;
  postgisVersion: string;
  extensions: string[];
  tables: string[];
  enums: string[];
  districtCount: number;
  communeCount: number;
  regionCount: number;
  invalidDistrictGeometries: number;
  invalidCommuneGeometries: number;
  districtSrid: number | null;
  communeSrid: number | null;
  userCount: number;
  organizationCount: number;
  hazardEventCount: number;
  alertCount: number;
  riskAssessmentCount: number;
}

async function main(): Promise<void> {
  console.log('=== Diagnostic base de données MadaRisk ===\n');

  const pool = new pg.Pool({
    connectionString: buildConnectionString(),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();

  try {
    // Test connexion
    await client.query('SELECT 1');
    console.log('[OK] Connexion à la base de données établie\n');

    // Version PostgreSQL
    const pgVersion = await client.query('SELECT version()');
    console.log(`PostgreSQL: ${pgVersion.rows[0].version}`);

    // Version PostGIS
    const postgisVersion = await client.query('SELECT PostGIS_Version()');
    console.log(`PostGIS: ${postgisVersion.rows[0].postgis_version}`);

    // Extensions installées
    const extensions = await client.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname NOT IN ('plpgsql') ORDER BY extname`,
    );
    console.log('\nExtensions :');
    for (const ext of extensions.rows) {
      console.log(`  - ${ext.extname} v${ext.extversion}`);
    }

    // Enums
    const enums = await client.query(
      `SELECT t.typname AS enum_name,
              array_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS values
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       GROUP BY t.typname
       ORDER BY t.typname`,
    );
    console.log(`\nEnums (${enums.rows.length}) :`);
    for (const en of enums.rows) {
      let values: string[] = [];
      if (Array.isArray(en.values)) {
        values = en.values;
      } else if (typeof en.values === 'string') {
        values = en.values
          .replace(/^\{|\}$/g, '')
          .split(',');
      }
      console.log(`  - ${en.enum_name}: {${values.join(', ')}}`);
    }

    // Tables
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    console.log(`\nTables (${tables.rows.length}) :`);
    for (const t of tables.rows) {
      console.log(`  - ${t.table_name}`);
    }

    // Comptages
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM regions) AS regions,
        (SELECT COUNT(*) FROM districts) AS districts,
        (SELECT COUNT(*) FROM communes) AS communes,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM organizations) AS organizations,
        (SELECT COUNT(*) FROM hazard_events) AS hazard_events,
        (SELECT COUNT(*) FROM alerts) AS alerts,
        (SELECT COUNT(*) FROM risk_assessments) AS risk_assessments
    `);
    const c = counts.rows[0];
    console.log('\nComptages :');
    console.log(`  Régions: ${c.regions}`);
    console.log(`  Districts: ${c.districts}`);
    console.log(`  Communes: ${c.communes}`);
    console.log(`  Utilisateurs: ${c.users}`);
    console.log(`  Organisations: ${c.organizations}`);
    console.log(`  Événements: ${c.hazard_events}`);
    console.log(`  Alertes: ${c.alerts}`);
    console.log(`  Évaluations risque: ${c.risk_assessments}`);

    // SRID et validité géométrie
    const districtGeom = await client.query(
      `SELECT
         MAX(ST_SRID(geom)) AS srid,
         SUM(CASE WHEN NOT ST_IsValid(geom) THEN 1 ELSE 0 END)::int AS invalid
       FROM districts`,
    );
    const communeGeom = await client.query(
      `SELECT
         MAX(ST_SRID(geom)) AS srid,
         SUM(CASE WHEN NOT ST_IsValid(geom) THEN 1 ELSE 0 END)::int AS invalid
       FROM communes`,
    );

    console.log('\nGéométrie :');
    console.log(`  Districts - SRID: ${districtGeom.rows[0].srid}, Invalides: ${districtGeom.rows[0].invalid}`);
    console.log(`  Communes  - SRID: ${communeGeom.rows[0].srid}, Invalides: ${communeGeom.rows[0].invalid}`);

    // Vérification des contraintes
    const constraints = await client.query(
      `SELECT conname, contype, conrelid::regclass AS table_name
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
       ORDER BY conrelid::regclass::text, conname`,
    );
    console.log(`\nContraintes (${constraints.rows.length}) :`);
    for (const con of constraints.rows) {
      const typeMap: Record<string, string> = {
        p: 'PRIMARY KEY',
        f: 'FOREIGN KEY',
        u: 'UNIQUE',
        c: 'CHECK',
        t: 'TRIGGER',
      };
      console.log(`  - [${typeMap[con.contype] || con.contype}] ${con.table_name}.${con.conname}`);
    }

    // Triggers
    const triggers = await client.query(
      `SELECT event_object_table, trigger_name
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`,
    );
    console.log(`\nTriggers (${triggers.rows.length}) :`);
    for (const tr of triggers.rows) {
      console.log(`  - ${tr.event_object_table}.${tr.trigger_name}`);
    }

    // Vues
    const views = await client.query(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );
    console.log(`\nVues (${views.rows.length}) :`);
    for (const v of views.rows) {
      console.log(`  - ${v.table_name}`);
    }

    // Résumé
    const districtsCount = Number(c.districts);
    const communesCount = Number(c.communes);
    console.log('\n=== Résumé ===');
    console.log(`Districts: ${districtsCount} (attendu: 119) ${districtsCount === 119 ? '✓' : '✗'}`);
    console.log(`Communes: ${communesCount} (attendu: 1579) ${communesCount === 1579 ? '✓' : '✗'}`);
    console.log(
      `Géométries invalides: districts=${districtGeom.rows[0].invalid}, communes=${communeGeom.rows[0].invalid}`,
    );

    if (districtsCount !== 119 || communesCount !== 1579) {
      console.error('\n[ERREUR] Les comptages districts/communes ne correspondent pas !');
    }

    console.log('\n--- Diagnostic terminé ---');
  } catch (err) {
    console.error('\n[ERREUR]', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
