import { db } from '../config/database';
import {
  CommuneEvent,
  DistrictDetail,
  DistrictListItem,
  CommuneListItem,
  DistrictParent,
  GeoJsonGeometry,
  PaginatedResult,
  RiskSummary,
  TerritoryFeature,
  TerritoryRiskLevel,
  TerritoryRiskPhase,
  TerritorySearchResult,
  WeatherSummary,
} from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

const DISTRICT_BASE_COLUMNS = `
  d.id,
  d.admin_code AS "adminCode",
  d.name,
  d.normalized_name AS "normalizedName",
  d.population,
  d.vulnerability_score AS "vulnerabilityScore",
  ST_AsGeoJSON(d.centroid)::jsonb AS "centroid",
  (SELECT COUNT(*)::int FROM communes c WHERE c.district_id = d.id) AS "totalCommunes"
`;

const COMMUNE_BASE_COLUMNS = `
  c.id,
  c.admin_code AS "adminCode",
  c.name,
  c.normalized_name AS "normalizedName",
  c.postal_code AS "postalCode",
  c.population,
  c.vulnerability_score AS "vulnerabilityScore",
  c.district_id AS "districtId",
  d.admin_code AS "districtCode",
  d.name AS "districtName",
  ST_AsGeoJSON(c.centroid)::jsonb AS "centroid"
`;

export const territoriesRepository = {
  async listDistricts(query: {
    page: number;
    limit: number;
    search?: string;
    adminCode?: string;
    includeGeometry: boolean;
  }): Promise<PaginatedResult<DistrictListItem>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`d.normalized_name ILIKE $${idx++}`);
      values.push(`%${query.search}%`);
    }
    if (query.adminCode) {
      conditions.push(`d.admin_code = $${idx++}`);
      values.push(query.adminCode);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const geometrySelect = query.includeGeometry
      ? `, ST_AsGeoJSON(d.geom)::jsonb AS geometry`
      : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM districts d ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<DistrictListItem>(
      `SELECT ${DISTRICT_BASE_COLUMNS}
         ${geometrySelect}
       FROM districts d
       ${where}
       ORDER BY d.normalized_name
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return { items: pageResult.rows, page: query.page, limit: query.limit, total };
  },

  async findDistrictById(id: string): Promise<DistrictDetail | null> {
    const result = await db.query<DistrictDetail>(
      `SELECT
         d.id,
         d.admin_code AS "adminCode",
         d.name,
         d.normalized_name AS "normalizedName",
         d.population,
         d.vulnerability_score AS "vulnerabilityScore",
         ST_AsGeoJSON(d.centroid)::jsonb AS "centroid",
         ST_AsGeoJSON(d.geom)::jsonb AS "geometry",
         (SELECT COUNT(*)::int FROM communes cm WHERE cm.district_id = d.id) AS "totalCommunes",
         (SELECT COUNT(DISTINCT ra.commune_id)::int
            FROM risk_assessments ra
            JOIN communes cm ON cm.id = ra.commune_id
           WHERE cm.district_id = d.id) AS "totalCommunesWithRisk"
       FROM districts d
       WHERE d.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async listCommunes(query: {
    page: number;
    limit: number;
    districtId?: string;
    districtCode?: string;
    search?: string;
    adminCode?: string;
    riskLevel?: TerritoryRiskLevel;
    eventId?: string;
    includeGeometry: boolean;
  }): Promise<PaginatedResult<CommuneListItem>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.districtCode) {
      conditions.push(`d.admin_code = $${idx++}`);
      values.push(query.districtCode);
    }
    if (query.search) {
      conditions.push(`c.normalized_name ILIKE $${idx++}`);
      values.push(`%${query.search}%`);
    }
    if (query.adminCode) {
      conditions.push(`c.admin_code = $${idx++}`);
      values.push(query.adminCode);
    }
    if (query.riskLevel) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM risk_assessments ra
          WHERE ra.commune_id = c.id
            AND ra.risk_level = $${idx++}::risk_level
        )
      `);
      values.push(query.riskLevel);
    }
    if (query.eventId) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM exposed_communes ec
          WHERE ec.commune_id = c.id AND ec.event_id = $${idx++}
        )
      `);
      values.push(query.eventId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const geometrySelect = query.includeGeometry
      ? `, ST_AsGeoJSON(c.geom)::jsonb AS geometry`
      : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<CommuneListItem>(
      `SELECT ${COMMUNE_BASE_COLUMNS}
         ${geometrySelect}
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       ${where}
       ORDER BY d.normalized_name, c.normalized_name
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return { items: pageResult.rows, page: query.page, limit: query.limit, total };
  },

  async findCommuneParent(id: string): Promise<DistrictParent | null> {
    const result = await db.query<DistrictParent>(
      `SELECT
         d.id,
         d.admin_code AS "adminCode",
         d.name,
         d.normalized_name AS "normalizedName"
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async findCommuneBasic(id: string): Promise<{
    id: string;
    adminCode: string;
    name: string;
    normalizedName: string;
    postalCode: string | null;
    population: number | null;
    vulnerabilityScore: number | null;
    centroid: GeoJsonGeometry | null;
    geometry: GeoJsonGeometry | null;
  } | null> {
    const result = await db.query<{
      id: string;
      adminCode: string;
      name: string;
      normalizedName: string;
      postalCode: string | null;
      population: number | null;
      vulnerabilityScore: number | null;
      centroid: GeoJsonGeometry | null;
      geometry: GeoJsonGeometry | null;
    }>(
      `SELECT
         c.id,
         c.admin_code AS "adminCode",
         c.name,
         c.normalized_name AS "normalizedName",
         c.postal_code AS "postalCode",
         c.population,
         c.vulnerability_score AS "vulnerabilityScore",
         ST_AsGeoJSON(c.centroid)::jsonb AS "centroid",
         ST_AsGeoJSON(c.geom)::jsonb AS "geometry"
       FROM communes c
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async findCommuneWeather(id: string): Promise<WeatherSummary | null> {
    const result = await db.query<WeatherSummary>(
      `SELECT
         observed_at AS "observedAt",
         precipitation_mm AS "precipitationMm",
         temperature_c AS "temperatureC",
         humidity_percent AS "humidityPercent",
         wind_speed_kmh AS "windSpeedKmh",
         wind_direction_deg AS "windDirectionDeg",
         pressure_hpa AS "pressureHpa"
       FROM weather_observations
       WHERE commune_id = $1
       ORDER BY observed_at DESC
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async findCommuneRisk(id: string): Promise<RiskSummary | null> {
    const result = await db.query<{
      riskScore: number | null;
      riskLevel: TerritoryRiskLevel;
      phase: TerritoryRiskPhase;
      assessedAt: string;
    }>(
      `SELECT
         risk_score AS "riskScore",
         risk_level AS "riskLevel",
         phase,
         assessed_at AS "assessedAt"
       FROM risk_assessments
       WHERE commune_id = $1
       ORDER BY assessed_at DESC
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...row, displayLevel: null, color: null };
  },

  async findCommuneEvents(id: string): Promise<CommuneEvent[]> {
    const result = await db.query<CommuneEvent>(
      `SELECT DISTINCT
         he.id,
         he.event_code AS "eventCode",
         he.name,
         he.type,
         he.status,
         he.started_at AS "startedAt"
       FROM exposed_communes ec
       JOIN hazard_events he ON he.id = ec.event_id
       WHERE ec.commune_id = $1
       UNION
       SELECT DISTINCT
         he.id,
         he.event_code AS "eventCode",
         he.name,
         he.type,
         he.status,
         he.started_at AS "startedAt"
       FROM risk_assessments ra
       JOIN hazard_events he ON he.id = ra.event_id
       WHERE ra.commune_id = $1
       ORDER BY "startedAt" DESC NULLS LAST`,
      [id],
    );
    return result.rows;
  },

  async searchTerritories(
    q: string,
    limit: number,
  ): Promise<TerritorySearchResult[]> {
    const like = `%${q}%`;
    const districts = await db.query<{
      type: 'district';
      id: string;
      adminCode: string;
      name: string;
      normalizedName: string;
      districtId: null;
      districtCode: null;
      districtName: null;
    }>(
      `SELECT
         'district'::text AS type,
         id,
         admin_code AS "adminCode",
         name,
         normalized_name AS "normalizedName",
         NULL::uuid AS "districtId",
         NULL::text AS "districtCode",
         NULL::text AS "districtName"
       FROM districts
       WHERE normalized_name ILIKE $1
       ORDER BY name
       LIMIT $2`,
      [like, limit],
    );

    const communes = await db.query<{
      type: 'commune';
      id: string;
      adminCode: string;
      name: string;
      normalizedName: string;
      districtId: string;
      districtCode: string;
      districtName: string;
    }>(
      `SELECT
         'commune'::text AS type,
         c.id,
         c.admin_code AS "adminCode",
         c.name,
         c.normalized_name AS "normalizedName",
         d.id AS "districtId",
         d.admin_code AS "districtCode",
         d.name AS "districtName"
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       WHERE c.normalized_name ILIKE $1
       ORDER BY c.name
       LIMIT $2`,
      [like, limit],
    );

    const districtRows = districts.rows.map((r) => ({
      type: 'district' as const,
      id: r.id,
      adminCode: r.adminCode,
      name: r.name,
      normalizedName: r.normalizedName,
      district: null as { id: string; adminCode: string; name: string } | null,
    }));

    const communeRows = communes.rows.map((r) => ({
      type: 'commune' as const,
      id: r.id,
      adminCode: r.adminCode,
      name: r.name,
      normalizedName: r.normalizedName,
      district: {
        id: r.districtId,
        adminCode: r.districtCode,
        name: r.districtName,
      },
    }));

    const combined = [...districtRows, ...communeRows];
    return combined.slice(0, limit);
  },

  async mapDistricts(query: {
    eventId?: string;
    riskLevel?: TerritoryRiskLevel;
  }): Promise<TerritoryFeature[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.eventId) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM exposed_communes ec
          JOIN communes c ON c.id = ec.commune_id
          WHERE c.district_id = d.id AND ec.event_id = $${idx++}
        )
      `);
      values.push(query.eventId);
    }
    if (query.riskLevel) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM communes c
          JOIN risk_assessments ra ON ra.commune_id = c.id
          WHERE c.district_id = d.id AND ra.risk_level = $${idx++}::risk_level
        )
      `);
      values.push(query.riskLevel);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query<{ feature: TerritoryFeature }>(
      `SELECT
         jsonb_build_object(
           'type', 'Feature',
           'id', d.id,
           'geometry', ST_AsGeoJSON(d.geom)::jsonb,
           'properties', jsonb_build_object(
             'districtId', d.id,
             'districtCode', d.admin_code,
             'district', d.name,
             'population', d.population,
             'vulnerabilityScore', d.vulnerability_score,
             'totalCommunes', (SELECT COUNT(*)::int FROM communes cc WHERE cc.district_id = d.id),
             'totalCommunesHighRisk', (SELECT COUNT(*)::int FROM communes cc
                                         JOIN risk_assessments ra ON ra.commune_id = cc.id
                                        WHERE cc.district_id = d.id AND ra.risk_level = 'ELEVE'::risk_level),
             'totalCommunesExtremeRisk', (SELECT COUNT(*)::int FROM communes cc
                                            JOIN risk_assessments ra ON ra.commune_id = cc.id
                                           WHERE cc.district_id = d.id AND ra.risk_level = 'EXTREME'::risk_level)
           )
         )::jsonb AS feature
       FROM districts d
       ${where}
       ORDER BY d.normalized_name`,
      values,
    );

    return result.rows.map((r) => r.feature);
  },

  async mapCommunes(query: {
    districtId?: string;
    districtCode?: string;
    eventId?: string;
    riskLevel?: TerritoryRiskLevel;
    phase?: TerritoryRiskPhase;
  }): Promise<TerritoryFeature[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.districtCode) {
      conditions.push(`d.admin_code = $${idx++}`);
      values.push(query.districtCode);
    }
    if (query.eventId) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM exposed_communes ec
          WHERE ec.commune_id = c.id AND ec.event_id = $${idx++}
        )
      `);
      values.push(query.eventId);
    }
    if (query.riskLevel) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM risk_assessments ra
          WHERE ra.commune_id = c.id AND ra.risk_level = $${idx++}::risk_level
        )
      `);
      values.push(query.riskLevel);
    }
    if (query.phase) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM risk_assessments ra
          WHERE ra.commune_id = c.id AND ra.phase = $${idx++}::risk_phase
        )
      `);
      values.push(query.phase);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query<{ feature: TerritoryFeature }>(
      `SELECT
         jsonb_build_object(
           'type', 'Feature',
           'id', c.id,
           'geometry', ST_AsGeoJSON(c.geom)::jsonb,
           'properties', jsonb_build_object(
             'communeId', c.id,
             'communeCode', c.admin_code,
             'commune', c.name,
             'districtId', c.district_id,
             'districtCode', d.admin_code,
             'district', d.name,
             'population', c.population,
             'vulnerabilityScore', c.vulnerability_score,
             'riskScore', (SELECT ra.risk_score FROM risk_assessments ra
                             WHERE ra.commune_id = c.id
                             ORDER BY ra.assessed_at DESC LIMIT 1),
             'riskLevel', (SELECT ra.risk_level FROM risk_assessments ra
                             WHERE ra.commune_id = c.id
                             ORDER BY ra.assessed_at DESC LIMIT 1),
             'phase', (SELECT ra.phase FROM risk_assessments ra
                         WHERE ra.commune_id = c.id
                         ORDER BY ra.assessed_at DESC LIMIT 1),
             'assessedAt', (SELECT ra.assessed_at FROM risk_assessments ra
                              WHERE ra.commune_id = c.id
                              ORDER BY ra.assessed_at DESC LIMIT 1),
             'precipitationMm', (SELECT wo.precipitation_mm FROM weather_observations wo
                                   WHERE wo.commune_id = c.id
                                   ORDER BY wo.observed_at DESC LIMIT 1),
             'windSpeedKmh', (SELECT wo.wind_speed_kmh FROM weather_observations wo
                                WHERE wo.commune_id = c.id
                                ORDER BY wo.observed_at DESC LIMIT 1)
           )
         )::jsonb AS feature
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       ${where}
       ORDER BY d.normalized_name, c.normalized_name`,
      values,
    );

    return result.rows.map((r) => r.feature);
  },

  async communeExists(id: string): Promise<boolean> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM communes WHERE id = $1`,
      [id],
    );
    return parseCount(result.rows[0]) > 0;
  },
};
