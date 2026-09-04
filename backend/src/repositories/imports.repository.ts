import { db } from '../config/database';
import {
  ImportDetail,
  ImportErrorEntry,
  ImportFileType,
  ImportsTerritoryType,
  ImportStatus,
  SourceRecord,
} from '../types/imports.types';
import { ListImportsQuery } from '../validators/imports.validator';

interface CountRow {
  count: string;
}

interface ImportRow {
  id: string;
  imported_by: string | null;
  file_name: string;
  file_path: string | null;
  file_type: ImportFileType;
  territory_type: ImportsTerritoryType | null;
  coordinate_system: string | null;
  status: ImportStatus;
  total_records: number;
  valid_records: number;
  invalid_records: number;
  error_log: ImportErrorEntry[] | null;
  created_at: string;
  completed_at: string | null;
}

interface SourceRecordRow {
  id: string;
  import_id: string;
  external_reference: string | null;
  source_name: string | null;
  normalized_name: string | null;
  source_code: string | null;
  source_district: string | null;
  source_region: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

function mapImport(row: ImportRow): ImportDetail {
  return {
    id: row.id,
    importedBy: row.imported_by,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type,
    territoryType: row.territory_type,
    coordinateSystem: row.coordinate_system,
    status: row.status,
    totalRecords: row.total_records,
    validRecords: row.valid_records,
    invalidRecords: row.invalid_records,
    errorLog: row.error_log ?? [],
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapSourceRecord(row: SourceRecordRow): SourceRecord {
  return {
    id: row.id,
    importId: row.import_id,
    externalReference: row.external_reference,
    sourceName: row.source_name,
    normalizedName: row.normalized_name,
    sourceCode: row.source_code,
    sourceDistrict: row.source_district,
    sourceRegion: row.source_region,
    rawData: row.raw_data,
    createdAt: row.created_at,
  };
}

export const importsRepository = {
  async findById(id: string): Promise<ImportDetail | null> {
    const result = await db.query<ImportRow>(
      `SELECT
         id, imported_by, file_name, file_path, file_type, territory_type,
         coordinate_system, status, total_records, valid_records, invalid_records,
         error_log, created_at, completed_at
       FROM territory_imports
       WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) return null;
    return mapImport(result.rows[0]);
  },

  async list(query: ListImportsQuery): Promise<{ items: ImportDetail[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.status) {
      conditions.push(`status = $${idx++}`);
      values.push(query.status);
    }
    if (query.fileType) {
      conditions.push(`file_type = $${idx++}`);
      values.push(query.fileType);
    }
    if (query.territoryType) {
      conditions.push(`territory_type = $${idx++}`);
      values.push(query.territoryType);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM territory_imports ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<ImportRow>(
      `SELECT
         id, imported_by, file_name, file_path, file_type, territory_type,
         coordinate_system, status, total_records, valid_records, invalid_records,
         error_log, created_at, completed_at
       FROM territory_imports
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return { items: pageResult.rows.map(mapImport), total };
  },

  async listSourceRecords(importId: string): Promise<SourceRecord[]> {
    const result = await db.query<SourceRecordRow>(
      `SELECT
         id, import_id, external_reference, source_name, normalized_name,
         source_code, source_district, source_region, raw_data, created_at
       FROM source_records
       WHERE import_id = $1
       ORDER BY created_at ASC`,
      [importId],
    );
    return result.rows.map(mapSourceRecord);
  },
};
