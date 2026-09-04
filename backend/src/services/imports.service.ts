import fs from 'fs';
import path from 'path';
import { AppError } from '../utils/app-error';
import { normalizeName, normalizeCode } from '../utils/territory-normalizer';
import { parseCsv } from '../utils/csv';
import { importsRepository } from '../repositories/imports.repository';
import { usersRepository } from '../repositories/users.repository';
import { db } from '../config/database';
import { logger } from '../config/logger';
import {
  ImportDetail,
  ImportErrorEntry,
  ImportFileType,
  ImportProcessResult,
  ImportsTerritoryType,
  SourceRecord,
  TerritoryImportInput,
} from '../types/imports.types';
import { CreateImportInput, ListImportsQuery } from '../validators/imports.validator';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const NAME_KEYS = ['name', 'nom', 'NAME', 'NOM', 'libelle', 'LIBELLE', 'territoire', 'territory', 'district', 'commune'];
const CODE_KEYS = ['code', 'CODE', 'admin_code', 'adminCode', 'ADMIN_CODE', 'code_administratif', 'code_admin'];
const DISTRICT_KEYS = ['district', 'DISTRICT', 'district_name', 'source_district', 'sourceDistrict', 'districtName'];
const REGION_KEYS = ['region', 'REGION', 'region_name', 'source_region', 'sourceRegion', 'regionName'];
const REF_KEYS = ['external_reference', 'externalReference', 'ref', 'REF'];

function detectFileType(fileName: string): ImportFileType {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.geojson') return 'GEOJSON';
  if (ext === '.csv') return 'CSV';
  return 'JSON';
}

function firstValue(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      const str = String(value).trim();
      if (str.length > 0) return str;
    }
  }
  return null;
}

function extractRecord(raw: Record<string, unknown>): {
  input: TerritoryImportInput;
  valid: boolean;
  reason?: string;
} {
  const sourceName = firstValue(raw, NAME_KEYS);
  const sourceCode = firstValue(raw, CODE_KEYS) ?? null;
  const sourceDistrict = firstValue(raw, DISTRICT_KEYS) ?? null;
  const sourceRegion = firstValue(raw, REGION_KEYS) ?? null;
  const externalReference = firstValue(raw, REF_KEYS) ?? null;

  if (!sourceName && !sourceCode) {
    return {
      input: { rawData: raw },
      valid: false,
      reason: 'Ligne sans nom ni code administratif',
    };
  }

  return {
    input: {
      sourceName: sourceName ?? undefined,
      sourceCode,
      sourceDistrict,
      sourceRegion,
      externalReference,
      rawData: raw,
    },
    valid: true,
  };
}

function parseJsonRecords(content: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw AppError.badRequest('Fichier JSON invalide : parsing impossible');
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const arrayValue = Object.values(obj).find((v) => Array.isArray(v));
    if (arrayValue && arrayValue.length > 0) {
      return arrayValue.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  }

  throw AppError.badRequest('Fichier JSON tabulaire invalide : tableau d\'objets attendu');
}

function parseGeoJsonRecords(content: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw AppError.badRequest('Fichier GeoJSON invalide : parsing impossible');
  }

  const geojson = parsed as {
    type?: string;
    features?: unknown;
  };

  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw AppError.badRequest('GeoJSON invalide : une FeatureCollection est attendue');
  }

  return geojson.features
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((feature: Record<string, unknown>) => {
      const props = (feature.properties && typeof feature.properties === 'object'
        ? feature.properties
        : {}) as Record<string, unknown>;
      let geometry: unknown = null;
      if (feature.geometry && typeof feature.geometry === 'object') {
        geometry = feature.geometry;
      }
      const merged = { ...props };
      if (geometry !== null) merged.geometry = geometry;
      return merged;
    });
}

function parseRecords(content: string, fileType: ImportFileType): Array<Record<string, unknown>> {
  if (fileType === 'GEOJSON') return parseGeoJsonRecords(content);
  if (fileType === 'CSV') return parseCsv(content);
  return parseJsonRecords(content);
}

export const importsService = {
  async createImport(
    file: Express.Multer.File,
    body: CreateImportInput,
    actor: { id: string; role: string },
    req: RequestContext,
  ): Promise<ImportProcessResult> {
    const fileType = detectFileType(file.originalname);
    const territoryType: ImportsTerritoryType | null = body.territoryType ?? null;

    const client = await db.getClient();
    let importId: string | null = null;

    try {
      await client.query('BEGIN');

      const importResult = await client.query<{ id: string }>(
        `INSERT INTO territory_imports
           (imported_by, file_name, file_path, file_type, territory_type, status,
            total_records, valid_records, invalid_records, error_log)
         VALUES ($1, $2, $3, $4, $5, 'EN_COURS'::import_status,
                 0, 0, 0, '[]'::jsonb)
         RETURNING id`,
        [actor.id, file.originalname, file.path, fileType, territoryType],
      );
      importId = importResult.rows[0].id;

      let content: string;
      try {
        content = fs.readFileSync(file.path, 'utf-8');
      } catch (readErr) {
        logger.error({ err: readErr, importId }, 'Lecture du fichier d\'import impossible');
        throw AppError.badRequest('Lecture du fichier impossible');
      }

      let rows: Array<Record<string, unknown>>;
      try {
        rows = parseRecords(content, fileType);
      } catch {
        throw AppError.badRequest('Fichier de données invalide');
      }

      const validInputs: TerritoryImportInput[] = [];
      const errors: ImportErrorEntry[] = [];

      rows.forEach((raw, index) => {
        const { input, valid, reason } = extractRecord(raw);
        if (valid) {
          validInputs.push(input);
        } else {
          errors.push({ row: index + 1, reason: reason ?? 'Enregistrement invalide' });
        }
      });

      for (const input of validInputs) {
        const normalizedName = input.sourceName ? normalizeName(input.sourceName) : null;
        const sourceCode = input.sourceCode ? normalizeCode(input.sourceCode) : null;
        await client.query(
          `INSERT INTO source_records
             (import_id, external_reference, source_name, normalized_name,
              source_code, source_district, source_region, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            importId,
            input.externalReference ?? null,
            input.sourceName ?? null,
            normalizedName,
            sourceCode,
            input.sourceDistrict ?? null,
            input.sourceRegion ?? null,
            JSON.stringify(input.rawData),
          ],
        );
      }

      await client.query(
        `UPDATE territory_imports
         SET total_records = $1, valid_records = $2, invalid_records = $3,
             error_log = $4, status = 'TERMINE'::import_status, completed_at = now()
         WHERE id = $5`,
        [rows.length, validInputs.length, errors.length, JSON.stringify(errors), importId],
      );

      await client.query('COMMIT');

      try {
        fs.unlinkSync(file.path);
      } catch {
        // fichier déjà supprimé, on ignore
      }

      await usersRepository.writeAudit({
        userId: actor.id,
        action: 'IMPORT_CREATED',
        entityType: 'territory_import',
        entityId: importId,
        newValue: { fileName: file.originalname, fileType, territoryType, records: rows.length },
        ipAddress: getIp(req),
      });

      return {
        importId,
        totalRecords: rows.length,
        validRecords: validInputs.length,
        invalidRecords: errors.length,
        errors,
      };
    } catch (err) {
      logger.error({ err }, 'createImport failed');
      await client.query('ROLLBACK');

      try {
        if (file.path) fs.unlinkSync(file.path);
      } catch {
        // on ignore
      }

      if (importId) {
        try {
          await db.query(
            `UPDATE territory_imports
             SET status = 'ECHEC'::import_status,
                 error_log = $1,
                 completed_at = now()
             WHERE id = $2`,
            [
              JSON.stringify([
                { row: 0, reason: err instanceof Error ? err.message : 'Erreur d\'import' },
              ]),
              importId,
            ],
          );
        } catch (logErr) {
          logger.error({ err: logErr, importId }, 'Échec de mise à jour du statut ECHEC');
        }
      }

      if (err instanceof AppError) throw err;
      throw AppError.internal('Échec de l\'import du fichier');
    } finally {
      client.release();
    }
  },

  async list(query: ListImportsQuery): Promise<{ imports: ImportDetail[]; page: number; limit: number; total: number }> {
    const { items, total } = await importsRepository.list(query);
    return { imports: items, page: query.page, limit: query.limit, total };
  },

  async getById(id: string): Promise<{ import: ImportDetail; sourceRecords: SourceRecord[] }> {
    const record = await importsRepository.findById(id);
    if (!record) throw AppError.notFound('Import introuvable');
    const sourceRecords = await importsRepository.listSourceRecords(id);
    return { import: record, sourceRecords };
  },

  async getErrors(id: string, page: number, limit: number): Promise<{
    items: ImportErrorEntry[];
    page: number;
    limit: number;
    total: number;
  }> {
    const record = await importsRepository.findById(id);
    if (!record) throw AppError.notFound('Import introuvable');

    const errors = record.errorLog ?? [];
    const total = errors.length;
    const start = (page - 1) * limit;
    const items = errors.slice(start, start + limit);
    return { items, page, limit, total };
  },
};
