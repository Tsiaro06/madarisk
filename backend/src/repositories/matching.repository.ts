import { db } from '../config/database';
import { ImportsTerritoryType, MatchingMethod, MatchingStatus } from '../types/imports.types';
import { ListMatchingQuery } from '../validators/matching.validator';

interface CountRow {
  count: string;
}

export interface TerritoryCandidate {
  id: string;
  adminCode: string | null;
  name: string;
  normalizedName: string;
  type: ImportsTerritoryType;
}

export interface TerritoryAliasCandidate {
  territoryType: ImportsTerritoryType;
  districtId: string | null;
  communeId: string | null;
  normalizedAlias: string;
}

export interface MatchingRow {
  id: string;
  sourceRecordId: string;
  sourceName: string | null;
  sourceCode: string | null;
  targetType: ImportsTerritoryType | null;
  regionId: string | null;
  districtId: string | null;
  communeId: string | null;
  matchMethod: MatchingMethod | null;
  confidenceScore: number | null;
  status: MatchingStatus;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface MatchingRowRaw {
  id: string;
  source_record_id: string;
  source_name: string | null;
  source_code: string | null;
  target_type: ImportsTerritoryType | null;
  region_id: string | null;
  district_id: string | null;
  commune_id: string | null;
  match_method: MatchingMethod | null;
  confidence_score: string | null;
  status: MatchingStatus;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function mapMatching(row: MatchingRowRaw): MatchingRow {
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    sourceName: row.source_name,
    sourceCode: row.source_code,
    targetType: row.target_type,
    regionId: row.region_id,
    districtId: row.district_id,
    communeId: row.commune_id,
    matchMethod: row.match_method,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    status: row.status,
    notes: row.notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export const matchingRepository = {
  async listTerritories(type: ImportsTerritoryType): Promise<TerritoryCandidate[]> {
    if (type === 'DISTRICT') {
      const result = await db.query<{
        id: string;
        admin_code: string | null;
        name: string;
        normalized_name: string;
      }>(`SELECT id, admin_code, name, normalized_name FROM districts`);
      return result.rows.map((r) => ({
        id: r.id,
        adminCode: r.admin_code,
        name: r.name,
        normalizedName: r.normalized_name,
        type: 'DISTRICT' as const,
      }));
    }
    const result = await db.query<{
      id: string;
      admin_code: string | null;
      name: string;
      normalized_name: string;
    }>(`SELECT id, admin_code, name, normalized_name FROM communes`);
    return result.rows.map((r) => ({
      id: r.id,
      adminCode: r.admin_code,
      name: r.name,
      normalizedName: r.normalized_name,
      type: 'COMMUNE' as const,
    }));
  },

  async listAliases(type: ImportsTerritoryType): Promise<TerritoryAliasCandidate[]> {
    const result = await db.query<TerritoryAliasCandidate>(
      `SELECT
         territory_type AS "territoryType",
         district_id AS "districtId",
         commune_id AS "communeId",
         normalized_alias AS "normalizedAlias"
       FROM territory_aliases
       WHERE territory_type = $1`,
      [type],
    );
    return result.rows;
  },

  async findById(id: string): Promise<MatchingRow | null> {
    const result = await db.query<MatchingRowRaw>(
      `SELECT
         tm.id, tm.source_record_id, sr.source_name, sr.source_code,
         tm.target_type, tm.region_id, tm.district_id, tm.commune_id,
         tm.match_method, tm.confidence_score, tm.status, tm.notes,
         tm.reviewed_by, tm.reviewed_at, tm.created_at
       FROM territory_matching tm
       JOIN source_records sr ON sr.id = tm.source_record_id
       WHERE tm.id = $1`,
      [id],
    );
    if (!result.rows[0]) return null;
    return mapMatching(result.rows[0]);
  },

  async create(data: {
    sourceRecordId: string;
    targetType: ImportsTerritoryType;
    regionId?: string | null;
    districtId?: string | null;
    communeId?: string | null;
    matchMethod: MatchingMethod;
    confidenceScore: number;
    status: MatchingStatus;
    notes?: string | null;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
  }): Promise<{ id: string }> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO territory_matching
         (source_record_id, target_type, region_id, district_id, commune_id,
          match_method, confidence_score, status, notes, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        data.sourceRecordId,
        data.targetType,
        data.regionId ?? null,
        data.districtId ?? null,
        data.communeId ?? null,
        data.matchMethod,
        data.confidenceScore,
        data.status,
        data.notes ?? null,
        data.reviewedBy ?? null,
        data.reviewedAt ?? null,
      ],
    );
    return { id: result.rows[0].id };
  },

  async bulkCreate(
    rows: Array<{
      sourceRecordId: string;
      targetType: ImportsTerritoryType;
      regionId?: string | null;
      districtId?: string | null;
      communeId?: string | null;
      matchMethod: MatchingMethod;
      confidenceScore: number;
      status: MatchingStatus;
      notes?: string | null;
    }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const row of rows) {
      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      values.push(
        row.sourceRecordId,
        row.targetType,
        row.regionId ?? null,
        row.districtId ?? null,
        row.communeId ?? null,
        row.matchMethod,
        row.confidenceScore,
        row.status,
        row.notes ?? null,
      );
    }
    const result = await db.query<{ count: number }>(
      `INSERT INTO territory_matching
         (source_record_id, target_type, region_id, district_id, commune_id,
          match_method, confidence_score, status, notes)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async list(query: ListMatchingQuery): Promise<{ items: MatchingRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.importId) {
      conditions.push(`sr.import_id = $${idx++}`);
      values.push(query.importId);
    }
    if (query.status) {
      conditions.push(`tm.status = $${idx++}`);
      values.push(query.status);
    }
    if (query.targetType) {
      conditions.push(`tm.target_type = $${idx++}`);
      values.push(query.targetType);
    }
    if (query.minConfidence !== undefined) {
      conditions.push(`tm.confidence_score >= $${idx++}`);
      values.push(query.minConfidence);
    }
    if (query.maxConfidence !== undefined) {
      conditions.push(`tm.confidence_score <= $${idx++}`);
      values.push(query.maxConfidence);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM territory_matching tm
       JOIN source_records sr ON sr.id = tm.source_record_id
       ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<MatchingRowRaw>(
      `SELECT
         tm.id, tm.source_record_id, sr.source_name, sr.source_code,
         tm.target_type, tm.region_id, tm.district_id, tm.commune_id,
         tm.match_method, tm.confidence_score, tm.status, tm.notes,
         tm.reviewed_by, tm.reviewed_at, tm.created_at
       FROM territory_matching tm
       JOIN source_records sr ON sr.id = tm.source_record_id
       ${where}
       ORDER BY tm.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return { items: pageResult.rows.map(mapMatching), total };
  },

  async updateDecision(
    id: string,
    data: {
      status: MatchingStatus;
      notes?: string | null;
      reviewedBy: string;
    },
  ): Promise<MatchingRow | null> {
    const result = await db.query<MatchingRowRaw>(
      `UPDATE territory_matching
       SET status = $1, notes = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = $4
       RETURNING *`,
      [data.status, data.notes ?? null, data.reviewedBy, id],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      sourceRecordId: row.source_record_id,
      sourceName: null,
      sourceCode: null,
      targetType: row.target_type,
      regionId: row.region_id,
      districtId: row.district_id,
      communeId: row.commune_id,
      matchMethod: row.match_method,
      confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
      status: row.status,
      notes: row.notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  },

  async createAlias(data: {
    territoryType: ImportsTerritoryType;
    districtId?: string | null;
    communeId?: string | null;
    alias: string;
    normalizedAlias: string;
  }): Promise<{ id: string }> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO territory_aliases
         (territory_type, district_id, commune_id, alias, normalized_alias)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        data.territoryType,
        data.districtId ?? null,
        data.communeId ?? null,
        data.alias,
        data.normalizedAlias,
      ],
    );
    return { id: result.rows[0].id };
  },

  async statistics(): Promise<{
    byStatus: Array<{ status: MatchingStatus; count: number }>;
    byMethod: Array<{ matchMethod: MatchingMethod | null; count: number }>;
  }> {
    const byStatus = await db.query<{ status: MatchingStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM territory_matching GROUP BY status ORDER BY status`,
    );
    const byMethod = await db.query<{ matchMethod: MatchingMethod | null; count: string }>(
      `SELECT match_method AS "matchMethod", COUNT(*)::text AS count
       FROM territory_matching GROUP BY match_method ORDER BY match_method NULLS LAST`,
    );
    return {
      byStatus: byStatus.rows.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
      byMethod: byMethod.rows.map((r) => ({
        matchMethod: r.matchMethod,
        count: parseInt(r.count, 10),
      })),
    };
  },
};
