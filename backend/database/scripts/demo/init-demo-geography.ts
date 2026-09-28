import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createDemoPool, loadDemoContext } from './demo-env';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

export const EXPECTED_DISTRICTS = 119;
export const EXPECTED_COMMUNES = 1579;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function resolveDumpPath(): string | null {
  const cliArg = process.argv.find((arg) => arg.startsWith('--file='));
  const fromArg = cliArg ? cliArg.slice('--file='.length) : undefined;
  const value = fromArg ?? process.env.DEMO_GEOGRAPHY_DUMP;
  if (!value || value.trim().length === 0) return null;
  return path.resolve(value.trim());
}

function readSqlFile(filePath: string): string {
  const raw = fs.readFileSync(filePath);
  const content = filePath.endsWith('.gz') ? zlib.gunzipSync(raw) : raw;
  return content
    .toString('utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function verifyGeography(connectionString: string, ssl: boolean): Promise<void> {
  const pool = createDemoPool({ connectionString, ssl }, 1);
  try {
    const counts = await pool.query<{
      districts: string;
      communes: string;
      regions: string;
      orphan_communes: string;
      invalid_districts: string;
      invalid_communes: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM districts) AS districts,
         (SELECT COUNT(*)::text FROM communes) AS communes,
         (SELECT COUNT(*)::text FROM regions) AS regions,
         (SELECT COUNT(*)::text FROM communes WHERE district_id IS NULL) AS orphan_communes,
         (SELECT COUNT(*)::text FROM districts WHERE geom IS NULL OR NOT ST_IsValid(geom)) AS invalid_districts,
         (SELECT COUNT(*)::text FROM communes WHERE geom IS NULL OR NOT ST_IsValid(geom)) AS invalid_communes`,
    );
    const row = counts.rows[0];
    const districts = Number(row.districts);
    const communes = Number(row.communes);
    const regions = Number(row.regions);

    console.log('\n--- Vérification du référentiel géographique ---');
    console.log(`  Régions  : ${regions}`);
    console.log(`  Districts: ${districts} (attendu ${EXPECTED_DISTRICTS})`);
    console.log(`  Communes : ${communes} (attendu ${EXPECTED_COMMUNES})`);
    console.log(`  Communes sans district : ${row.orphan_communes}`);
    console.log(`  Géométries invalides   : districts=${row.invalid_districts}, communes=${row.invalid_communes}`);

    const errors: string[] = [];
    if (regions === 0) errors.push('aucune région importée');
    if (districts !== EXPECTED_DISTRICTS) {
      errors.push(`districts=${districts} (attendu ${EXPECTED_DISTRICTS})`);
    }
    if (communes !== EXPECTED_COMMUNES) {
      errors.push(`communes=${communes} (attendu ${EXPECTED_COMMUNES})`);
    }
    if (Number(row.orphan_communes) > 0) errors.push('des communes ne sont pas reliées à un district');
    if (Number(row.invalid_districts) > 0 || Number(row.invalid_communes) > 0) {
      errors.push('géométries invalides détectées');
    }

    const regionName = process.env.DEMO_REGION_NAME?.trim() || 'VAKINANKARATRA';
    const region = await pool.query<{ id: string }>(
      `SELECT id FROM regions WHERE normalized_name = $1 LIMIT 1`,
      [normalize(regionName)],
    );
    if (region.rows.length === 0) {
      errors.push(`région requise absente : « ${regionName} »`);
    }

    if (errors.length > 0) {
      throw new Error(
        'Référentiel géographique incomplet ou invalide : ' +
          errors.join(' ; ') +
          '. Importez le dump géographique complet avant de continuer.',
      );
    }

    console.log('\n  ✓ Référentiel géographique conforme.');
  } finally {
    await pool.end();
  }
}

export async function initDemoGeography(): Promise<void> {
  const ctx = await loadDemoContext();
  assertDemoDatabaseOrExit({ databaseUrl: ctx.connectionString, dbName: ctx.dbName });

  const dumpPath = resolveDumpPath();
  if (!dumpPath) {
    console.error(
      '\nAucun dump géographique fourni.\n' +
        'Le référentiel (119 districts / 1579 communes) n’est pas versionné dans le dépôt.\n' +
        'Fournissez un fichier SQL local puis relancez :\n' +
        '  npm run db:demo:init -- --file="C:\\chemin\\vers\\geographie.sql"\n' +
        'ou définissez DEMO_GEOGRAPHY_DUMP dans .env.demo.',
    );
    process.exit(1);
  }

  if (!fs.existsSync(dumpPath)) {
    console.error(`\nFichier géographique introuvable : ${dumpPath}`);
    process.exit(1);
  }

  console.log(`Import de la géographie vers « ${ctx.dbName} » depuis : ${dumpPath}`);
  const sql = readSqlFile(dumpPath);
  const pool = createDemoPool({ connectionString: ctx.connectionString, ssl: ctx.env.DB_SSL }, 1);
  try {
    await pool.query(sql);
    console.log('  ✓ Import SQL terminé.');
  } finally {
    await pool.end();
  }

  await verifyGeography(ctx.connectionString, ctx.env.DB_SSL);
}

const entry = process.argv[1];
const invokedDirectly = entry ? /init-demo-geography\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  initDemoGeography().catch((err) => {
    console.error('\nInitialisation de la géographie échouée :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
