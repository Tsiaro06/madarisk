import { db } from '../config/database';
import { RiskLevel, RiskPhase, SeverityLevel } from '../types/event.types';
import {
  PriorityCommune,
  RiskAssessment,
  RiskConfiguration,
  RiskContext,
  RiskFactors,
  RiskMapGeoJson,
  RiskMapProperties,
} from '../types/risk.types';
import { GeoJsonGeometry, PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

interface ConfigurationRow {
  id: string;
  name: string;
  rain_weight: string;
  wind_weight: string;
  proximity_weight: string;
  vulnerability_weight: string;
  exposure_weight: string;
  low_threshold: string;
  moderate_threshold: string;
  high_threshold: string;
  extreme_threshold: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapConfiguration(row: ConfigurationRow): RiskConfiguration {
  return {
    id: row.id,
    name: row.name,
    rainWeight: parseFloat(row.rain_weight),
    windWeight: parseFloat(row.wind_weight),
    proximityWeight: parseFloat(row.proximity_weight),
    vulnerabilityWeight: parseFloat(row.vulnerability_weight),
    exposureWeight: parseFloat(row.exposure_weight),
    lowThreshold: parseFloat(row.low_threshold),
    moderateThreshold: parseFloat(row.moderate_threshold),
    highThreshold: parseFloat(row.high_threshold),
    extremeThreshold: parseFloat(row.extreme_threshold),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CONFIGURATION_COLUMNS = `
  id, name, rain_weight, wind_weight, proximity_weight, vulnerability_weight,
  exposure_weight, low_threshold, moderate_threshold, high_threshold,
  extreme_threshold, is_active, created_at, updated_at
`;

interface AssessmentRow {
  id: string;
  commune_id: string;
  event_id: string | null;
  risk_configuration_id: string | null;
  phase: RiskPhase;
  risk_score: string;
  risk_level: RiskLevel;
  rain_score: string;
  wind_score: string;
  proximity_score: string;
  vulnerability_score: string;
  exposure_score: string;
  explanation: unknown;
  model_version: string;
  assessed_at: string;
  created_at: string;
}

export interface AssessmentInsertData {
  communeId: string;
  eventId: string | null;
  configurationId: string | null;
  phase: RiskPhase;
  riskScore: number;
  riskLevel: RiskLevel;
  factors: RiskFactors;
  explanation: string[];
  assessedAt: string;
}

function mapAssessment(row: AssessmentRow): RiskAssessment {
  const explanation: string[] = Array.isArray(row.explanation) ? (row.explanation as string[]) : [];
  const factors: RiskFactors = {
    rainScore: parseFloat(row.rain_score),
    windScore: parseFloat(row.wind_score),
    proximityScore: parseFloat(row.proximity_score),
    vulnerabilityScore: parseFloat(row.vulnerability_score),
    exposureScore: parseFloat(row.exposure_score),
  };
  return {
    id: row.id,
    communeId: row.commune_id,
    eventId: row.event_id,
    riskConfigurationId: row.risk_configuration_id,
    phase: row.phase,
    riskScore: parseFloat(row.risk_score),
    riskLevel: row.risk_level,
    displayLevel: '',
    color: '',
    factors,
    explanation,
    modelVersion: row.model_version,
    assessedAt: row.assessed_at,
    createdAt: row.created_at,
  };
}

export interface RiskContextQuery {
  communeIds: string[];
  eventId: string | null;
}

export interface PriorityQuery {
  eventId?: string;
  districtId?: string;
  riskLevel?: RiskLevel;
  limit: number;
}

export interface RiskMapQuery {
  districtId?: string;
  eventId?: string;
  riskLevel?: RiskLevel;
  phase?: RiskPhase;
}

interface RiskMapRow {
  map_properties: RiskMapProperties;
  geometry: unknown;
}

export const risksRepository = {
  async listConfigurations(): Promise<RiskConfiguration[]> {
    const result = await db.query<ConfigurationRow>(
      `SELECT ${CONFIGURATION_COLUMNS}
       FROM risk_configurations
       ORDER BY is_active DESC, created_at ASC`,
    );
    return result.rows.map(mapConfiguration);
  },

  async findConfiguration(id: string): Promise<RiskConfiguration | null> {
    const result = await db.query<ConfigurationRow>(
      `SELECT ${CONFIGURATION_COLUMNS}
       FROM risk_configurations
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapConfiguration(result.rows[0]) : null;
  },

  async getActiveConfiguration(): Promise<RiskConfiguration | null> {
    const result = await db.query<ConfigurationRow>(
      `SELECT ${CONFIGURATION_COLUMNS}
       FROM risk_configurations
       WHERE is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
    );
    return result.rows[0] ? mapConfiguration(result.rows[0]) : null;
  },

  async createConfiguration(data: {
    name: string;
    rainWeight: number;
    windWeight: number;
    proximityWeight: number;
    vulnerabilityWeight: number;
    exposureWeight: number;
    lowThreshold: number;
    moderateThreshold: number;
    highThreshold: number;
    extremeThreshold: number;
    isActive: boolean;
  }): Promise<RiskConfiguration> {
    const result = await db.query<ConfigurationRow>(
      `INSERT INTO risk_configurations
         (name, rain_weight, wind_weight, proximity_weight, vulnerability_weight,
          exposure_weight, low_threshold, moderate_threshold, high_threshold,
          extreme_threshold, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${CONFIGURATION_COLUMNS}`,
      [
        data.name,
        data.rainWeight,
        data.windWeight,
        data.proximityWeight,
        data.vulnerabilityWeight,
        data.exposureWeight,
        data.lowThreshold,
        data.moderateThreshold,
        data.highThreshold,
        data.extremeThreshold,
        data.isActive,
      ],
    );
    return mapConfiguration(result.rows[0]);
  },

  async updateConfiguration(
    id: string,
    data: Partial<{
      name: string;
      rainWeight: number;
      windWeight: number;
      proximityWeight: number;
      vulnerabilityWeight: number;
      exposureWeight: number;
      lowThreshold: number;
      moderateThreshold: number;
      highThreshold: number;
      extremeThreshold: number;
      isActive: boolean;
    }>,
  ): Promise<RiskConfiguration | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const mapping: Record<string, keyof typeof data> = {
      name: 'name',
      rain_weight: 'rainWeight',
      wind_weight: 'windWeight',
      proximity_weight: 'proximityWeight',
      vulnerability_weight: 'vulnerabilityWeight',
      exposure_weight: 'exposureWeight',
      low_threshold: 'lowThreshold',
      moderate_threshold: 'moderateThreshold',
      high_threshold: 'highThreshold',
      extreme_threshold: 'extremeThreshold',
      is_active: 'isActive',
    };

    for (const [column, key] of Object.entries(mapping)) {
      if (data[key] !== undefined) {
        sets.push(`${column} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (sets.length === 0) {
      return this.findConfiguration(id);
    }

    values.push(id);
    const result = await db.query<ConfigurationRow>(
      `UPDATE risk_configurations
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING ${CONFIGURATION_COLUMNS}`,
      values,
    );
    return result.rows[0] ? mapConfiguration(result.rows[0]) : null;
  },

  async resolveTargetCommunes(query: {
    communeIds?: string[];
    districtId?: string;
    eventId?: string;
  }): Promise<string[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.communeIds?.length) {
      conditions.push(`c.id = ANY($${idx++}::uuid[])`);
      values.push(query.communeIds);
    }
    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.eventId) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM exposed_communes ec
           WHERE ec.commune_id = c.id AND ec.event_id = $${idx++}
         )`,
      );
      values.push(query.eventId);
    }

    if (conditions.length === 0) return [];

    const result = await db.query<{ id: string }>(
      `SELECT c.id
       FROM communes c
       WHERE ${conditions.join(' AND ')}`,
      values,
    );
    return result.rows.map((r) => r.id);
  },

  async getRiskContexts(query: RiskContextQuery): Promise<RiskContext[]> {
    if (query.communeIds.length === 0) return [];

    const result = await db.query<{
      communeId: string;
      vulnerabilityScore: string | null;
      population: number | null;
      rainfall24hMm: string | null;
      precipitationMm: string | null;
      windSpeedKmh: string | null;
      insideArea: boolean;
      distanceKm: string | null;
      severity: string | null;
      areaRadiusKm: string | null;
    }>(
      `SELECT
         t.id AS "communeId",
         c.vulnerability_score::text AS "vulnerabilityScore",
         c.population,
         w.rainfall_24h_mm::text AS "rainfall24hMm",
         w.precipitation_mm::text AS "precipitationMm",
         w.wind_speed_kmh::text AS "windSpeedKmh",
         EXISTS (
           SELECT 1 FROM event_areas a
           WHERE a.event_id = $2 AND ST_Intersects(c.geom, a.geom)
         ) AS "insideArea",
         d.distance_km AS "distanceKm",
         (SELECT he.severity FROM hazard_events he WHERE he.id = $2) AS "severity",
         (SELECT a.radius_km::text FROM event_areas a WHERE a.event_id = $2 ORDER BY a.created_at DESC LIMIT 1) AS "areaRadiusKm"
       FROM communes c
       JOIN unnest($1::uuid[]) AS t(id) ON t.id = c.id
       LEFT JOIN LATERAL (
         SELECT rainfall_24h_mm, precipitation_mm, wind_speed_kmh
         FROM weather_observations wo
         WHERE wo.commune_id = c.id
         ORDER BY wo.observed_at DESC
         LIMIT 1
       ) w ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           (SELECT ec.distance_to_track_km
            FROM exposed_communes ec
            WHERE ec.event_id = $2 AND ec.commune_id = c.id
            LIMIT 1),
           (SELECT ST_Distance(c.centroid::geography, tr.line::geography)::numeric(10,2) / 1000
            FROM (
              SELECT ST_MakeLine(geom ORDER BY observed_at) AS line
              FROM event_tracks
              WHERE event_id = $2
            ) tr)
         )::text AS distance_km
       ) d ON true`,
      [query.communeIds, query.eventId],
    );

    return result.rows.map((r) => ({
      communeId: r.communeId,
      vulnerabilityScore: r.vulnerabilityScore !== null ? parseFloat(r.vulnerabilityScore) : null,
      population: r.population,
      rainfall24hMm: r.rainfall24hMm !== null ? parseFloat(r.rainfall24hMm) : null,
      precipitationMm: r.precipitationMm !== null ? parseFloat(r.precipitationMm) : null,
      windSpeedKmh: r.windSpeedKmh !== null ? parseFloat(r.windSpeedKmh) : null,
      insideArea: r.insideArea,
      distanceKm: r.distanceKm !== null ? parseFloat(r.distanceKm) : null,
      severity: (r.severity ?? null) as SeverityLevel | null,
      areaRadiusKm: r.areaRadiusKm !== null ? parseFloat(r.areaRadiusKm) : null,
    }));
  },

  async saveAssessments(rows: AssessmentInsertData[]): Promise<RiskAssessment[]> {
    if (rows.length === 0) return [];

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const r of rows) {
      const n = idx;
      placeholders.push(
        `($${n}, $${n + 1}, $${n + 2}, $${n + 3}::risk_phase, $${n + 4}, $${n + 5}::risk_level` +
          `, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, $${n + 10}, $${n + 11}::jsonb, $${n + 12})`,
      );
      values.push(
        r.communeId,
        r.eventId,
        r.configurationId,
        r.phase,
        r.riskScore,
        r.riskLevel,
        r.factors.rainScore,
        r.factors.windScore,
        r.factors.proximityScore,
        r.factors.vulnerabilityScore,
        r.factors.exposureScore,
        JSON.stringify(r.explanation),
        r.assessedAt,
      );
      idx += 13;
    }

    const result = await db.query<AssessmentRow>(
      `INSERT INTO risk_assessments
         (commune_id, event_id, risk_configuration_id, phase, risk_score, risk_level,
          rain_score, wind_score, proximity_score, vulnerability_score, exposure_score,
          explanation, assessed_at)
       VALUES ${placeholders.join(', ')}
       RETURNING
         id, commune_id, event_id, risk_configuration_id, phase, risk_score, risk_level,
         rain_score, wind_score, proximity_score, vulnerability_score, exposure_score,
         explanation, model_version, assessed_at, created_at`,
      values,
    );
    return result.rows.map(mapAssessment);
  },

  async latestForCommune(communeId: string, eventId?: string): Promise<RiskAssessment | null> {
    const conditions = ['ra.commune_id = $1'];
    const values: unknown[] = [communeId];
    if (eventId) {
      conditions.push('ra.event_id = $2');
      values.push(eventId);
    }

    const result = await db.query<AssessmentRow>(
      `SELECT
         ra.id, ra.commune_id, ra.event_id, ra.risk_configuration_id, ra.phase,
         ra.risk_score, ra.risk_level, ra.rain_score, ra.wind_score, ra.proximity_score,
         ra.vulnerability_score, ra.exposure_score, ra.explanation, ra.model_version,
         ra.assessed_at, ra.created_at
       FROM risk_assessments ra
       WHERE ${conditions.join(' AND ')}
       ORDER BY ra.assessed_at DESC
       LIMIT 1`,
      values,
    );
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  },

  async historyForCommune(
    communeId: string,
    eventId: string | undefined,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<RiskAssessment>> {
    const conditions = ['ra.commune_id = $1'];
    const values: unknown[] = [communeId];
    let idx = 2;
    if (eventId) {
      conditions.push(`ra.event_id = $${idx++}`);
      values.push(eventId);
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM risk_assessments ra
       WHERE ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (page - 1) * limit;
    const pageResult = await db.query<AssessmentRow>(
      `SELECT
         ra.id, ra.commune_id, ra.event_id, ra.risk_configuration_id, ra.phase,
         ra.risk_score, ra.risk_level, ra.rain_score, ra.wind_score, ra.proximity_score,
         ra.vulnerability_score, ra.exposure_score, ra.explanation, ra.model_version,
         ra.assessed_at, ra.created_at
       FROM risk_assessments ra
       WHERE ${where}
       ORDER BY ra.assessed_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset],
    );

    return {
      items: pageResult.rows.map(mapAssessment),
      page,
      limit,
      total,
    };
  },

  async priorityCommunes(query: PriorityQuery): Promise<PriorityCommune[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.eventId) {
      conditions.push(`ra.event_id = $${idx++}`);
      values.push(query.eventId);
    }
    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.riskLevel) {
      conditions.push(`ra.risk_level = $${idx++}::risk_level`);
      values.push(query.riskLevel);
    }

    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query<{
      communeId: string;
      communeCode: string;
      communeName: string;
      districtId: string;
      districtName: string;
      riskScore: string;
      riskLevel: RiskLevel;
      population: number | null;
      assessedAt: string;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id)
           ra.commune_id, ra.event_id, ra.risk_score, ra.risk_level, ra.assessed_at
         FROM risk_assessments ra
         JOIN communes c ON c.id = ra.commune_id
         ${baseWhere}
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT
         c.id AS "communeId",
         c.admin_code AS "communeCode",
         c.name AS "communeName",
         d.id AS "districtId",
         d.name AS "districtName",
         l.risk_score::text AS "riskScore",
         l.risk_level AS "riskLevel",
         c.population,
         l.assessed_at AS "assessedAt"
       FROM latest l
       JOIN communes c ON c.id = l.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       ORDER BY l.risk_score DESC, c.population DESC NULLS LAST
       LIMIT $${idx}`,
      [...values, query.limit],
    );

    return result.rows.map((r) => ({
      communeId: r.communeId,
      communeCode: r.communeCode,
      communeName: r.communeName,
      districtId: r.districtId,
      districtName: r.districtName,
      riskScore: parseFloat(r.riskScore),
      riskLevel: r.riskLevel,
      displayLevel: '',
      color: '',
      population: r.population,
      assessedAt: r.assessedAt,
    }));
  },

  async riskMapLayer(query: RiskMapQuery): Promise<RiskMapGeoJson> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.eventId) {
      conditions.push(`ra.event_id = $${idx++}`);
      values.push(query.eventId);
    }
    if (query.riskLevel) {
      conditions.push(`ra.risk_level = $${idx++}::risk_level`);
      values.push(query.riskLevel);
    }
    if (query.phase) {
      conditions.push(`ra.phase = $${idx++}::risk_phase`);
      values.push(query.phase);
    }

    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query<RiskMapRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id)
           ra.commune_id, ra.risk_score, ra.risk_level, ra.explanation, ra.assessed_at
         FROM risk_assessments ra
         JOIN communes c ON c.id = ra.commune_id
         ${baseWhere}
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT
         jsonb_build_object(
           'communeId', c.id,
           'communeName', c.name,
           'districtName', d.name,
           'riskScore', l.risk_score,
           'riskLevel', l.risk_level,
           'displayLevel', '',
           'color', '',
           'explanation', l.explanation,
           'assessedAt', l.assessed_at
         ) AS map_properties,
         ST_AsGeoJSON(c.geom)::jsonb AS geometry
       FROM latest l
       JOIN communes c ON c.id = l.commune_id
       LEFT JOIN districts d ON d.id = c.district_id`,
      values,
    );

    return {
      type: 'FeatureCollection',
      features: result.rows.map((r) => ({
        type: 'Feature' as const,
        id: r.map_properties.communeId,
        geometry: r.geometry as GeoJsonGeometry,
        properties: r.map_properties,
      })),
    };
  },
};
