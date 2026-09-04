import { db } from '../config/database';

export interface DatabaseStatusReport {
  databaseConnected: boolean;
  postgresVersion: string;
  postgisVersion: string;
  postgisEnabled: boolean;
  districtsTableExists: boolean;
  communesTableExists: boolean;
  districtsCount: number;
  communesCount: number;
  districtsSrid: number | null;
  communesSrid: number | null;
  invalidDistrictGeometries: number;
  invalidCommuneGeometries: number;
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0]?.exists ?? false;
}

async function countRows(tableName: string): Promise<number> {
  const result = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

async function getSrid(tableName: string): Promise<number | null> {
  const result = await db.query<{ srid: number | null }>(
    `SELECT DISTINCT ST_SRID(geom) AS srid FROM ${tableName} LIMIT 1`,
  );
  return result.rows[0]?.srid ?? null;
}

async function countInvalidGeometries(tableName: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${tableName} WHERE NOT ST_IsValid(geom)`,
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export const systemRepository = {
  async getPostgresVersion(): Promise<string> {
    const result = await db.query<{ version: string }>('SELECT version()');
    return result.rows[0]?.version ?? 'unknown';
  },

  async getPostgisVersion(): Promise<string> {
    const result = await db.query<{ version: string }>(
      "SELECT PostGIS_Version() AS version",
    );
    return result.rows[0]?.version ?? 'unknown';
  },

  async isPostgisEnabled(): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_extension WHERE extname = 'postgis'
       ) AS exists`,
    );
    return result.rows[0]?.exists ?? false;
  },

  async getDatabaseStatus(): Promise<DatabaseStatusReport> {
    const [
      postgresVersion,
      postgisVersion,
      postgisEnabled,
      districtsTableExists,
      communesTableExists,
    ] = await Promise.all([
      this.getPostgresVersion(),
      this.getPostgisVersion(),
      this.isPostgisEnabled(),
      tableExists('districts'),
      tableExists('communes'),
    ]);

    let districtsCount = 0;
    let communesCount = 0;
    let districtsSrid: number | null = null;
    let communesSrid: number | null = null;
    let invalidDistrictGeometries = 0;
    let invalidCommuneGeometries = 0;

    if (districtsTableExists) {
      districtsCount = await countRows('districts');
      districtsSrid = await getSrid('districts');
      invalidDistrictGeometries = await countInvalidGeometries('districts');
    }

    if (communesTableExists) {
      communesCount = await countRows('communes');
      communesSrid = await getSrid('communes');
      invalidCommuneGeometries = await countInvalidGeometries('communes');
    }

    return {
      databaseConnected: true,
      postgresVersion,
      postgisVersion,
      postgisEnabled,
      districtsTableExists,
      communesTableExists,
      districtsCount,
      communesCount,
      districtsSrid,
      communesSrid,
      invalidDistrictGeometries,
      invalidCommuneGeometries,
    };
  },
};
