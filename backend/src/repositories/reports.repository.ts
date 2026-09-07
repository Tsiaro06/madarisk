import { db } from '../config/database';
import { PaginatedResult } from '../types/territory.types';

export type ReportFormat = 'PDF' | 'CSV' | 'XLSX' | 'GEOJSON' | 'PNG';

export interface Report {
  id: string;
  generatedBy: string | null;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  title: string;
  reportType: string;
  format: ReportFormat;
  periodStart: string | null;
  periodEnd: string | null;
  filePath: string | null;
  parameters: Record<string, unknown>;
  generatedAt: string;
}

export interface ReportListRow extends Report {
  eventName: string | null;
  districtName: string | null;
  communeName: string | null;
}

export interface ReportFilters {
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

export interface SaveReportInput {
  generatedBy: string | null;
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  title: string;
  reportType: string;
  format: ReportFormat;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  filePath: string | null;
  parameters: Record<string, unknown>;
}

interface CountRow {
  count: string;
}

interface ReportRawRow {
  id: string;
  generated_by: string | null;
  event_id: string | null;
  district_id: string | null;
  commune_id: string | null;
  title: string;
  report_type: string;
  format: ReportFormat;
  period_start: string | null;
  period_end: string | null;
  file_path: string | null;
  parameters: unknown;
  generated_at: string;
}

interface ReportListRawRow extends ReportRawRow {
  event_name: string | null;
  district_name: string | null;
  commune_name: string | null;
}

interface GeoRow {
  props: Record<string, unknown>;
  geometry: unknown;
}

const REPORT_COLUMNS = `id, generated_by, event_id, district_id, commune_id, title, report_type, format, period_start, period_end, file_path, parameters, generated_at`;

function mapReport(row: ReportRawRow): Report {
  return {
    id: row.id,
    generatedBy: row.generated_by,
    eventId: row.event_id,
    districtId: row.district_id,
    communeId: row.commune_id,
    title: row.title,
    reportType: row.report_type,
    format: row.format,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    filePath: row.file_path,
    parameters: (row.parameters ?? {}) as Record<string, unknown>,
    generatedAt: row.generated_at,
  };
}

function mapReportList(row: ReportListRawRow): ReportListRow {
  return {
    ...mapReport(row),
    eventName: row.event_name,
    districtName: row.district_name,
    communeName: row.commune_name,
  };
}

export const reportsRepository = {
  async save(input: SaveReportInput): Promise<Report> {
    const result = await db.query<ReportRawRow>(
      `INSERT INTO reports
         (generated_by, event_id, district_id, commune_id, title, report_type, format,
          period_start, period_end, file_path, parameters, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING ${REPORT_COLUMNS}`,
      [
        input.generatedBy,
        input.eventId ?? null,
        input.districtId ?? null,
        input.communeId ?? null,
        input.title,
        input.reportType,
        input.format,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.filePath,
        input.parameters ?? {},
      ],
    );
    return mapReport(result.rows[0]);
  },

  async list(query: {
    page: number;
    limit: number;
    format?: ReportFormat;
    reportType?: string;
    eventId?: string;
  }): Promise<PaginatedResult<ReportListRow>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.format) {
      conditions.push(`r.format = $${idx++}`);
      values.push(query.format);
    }
    if (query.reportType) {
      conditions.push(`r.report_type = $${idx++}`);
      values.push(query.reportType);
    }
    if (query.eventId) {
      conditions.push(`r.event_id = $${idx++}`);
      values.push(query.eventId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM reports r ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pageResult = await db.query<ReportListRawRow>(
      `SELECT
         r.id, r.generated_by, r.event_id, r.district_id, r.commune_id,
         r.title, r.report_type, r.format, r.period_start, r.period_end,
         r.file_path, r.parameters, r.generated_at,
         COALESCE(he.name, NULL::text) AS "event_name",
         COALESCE(d.name, NULL::text) AS "district_name",
         COALESCE(cm.name, NULL::text) AS "commune_name"
       FROM reports r
       LEFT JOIN hazard_events he ON he.id = r.event_id
       LEFT JOIN districts d ON d.id = r.district_id
       LEFT JOIN communes cm ON cm.id = r.commune_id
       ${where}
       ORDER BY r.generated_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, (query.page - 1) * query.limit],
    );

    return {
      items: pageResult.rows.map(mapReportList),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async findById(id: string): Promise<ReportListRow | null> {
    const result = await db.query<ReportListRawRow>(
      `SELECT
         r.id, r.generated_by, r.event_id, r.district_id, r.commune_id,
         r.title, r.report_type, r.format, r.period_start, r.period_end,
         r.file_path, r.parameters, r.generated_at,
         COALESCE(he.name, NULL::text) AS "event_name",
         COALESCE(d.name, NULL::text) AS "district_name",
         COALESCE(cm.name, NULL::text) AS "commune_name"
       FROM reports r
       LEFT JOIN hazard_events he ON he.id = r.event_id
       LEFT JOIN districts d ON d.id = r.district_id
       LEFT JOIN communes cm ON cm.id = r.commune_id
       WHERE r.id = $1`,
      [id],
    );
    return result.rows[0] ? mapReportList(result.rows[0]) : null;
  },

  async csvCommunes(filters: ReportFilters): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         c.id AS "id",
         c.admin_code AS "communeCode",
         c.name AS "communeName",
         c.normalized_name AS "normalizedName",
         c.postal_code AS "postalCode",
         c.population::text AS "population",
         c.vulnerability_score::text AS "vulnerabilityScore",
         d.name AS "districtName"
       FROM communes c
       LEFT JOIN districts d ON d.id = c.district_id
       WHERE ($1::uuid IS NULL OR c.id = $1)
         AND ($2::uuid IS NULL OR d.id = $2)
       ORDER BY d.name, c.name`,
      [filters.communeId ?? null, filters.districtId ?? null],
    );
    return result.rows;
  },

  async csvDistricts(filters: ReportFilters): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         d.id AS "id",
         d.admin_code AS "adminCode",
         d.name AS "districtName",
         d.normalized_name AS "normalizedName",
         d.population::text AS "population",
         d.vulnerability_score::text AS "vulnerabilityScore",
         d.region_name AS "regionName"
       FROM v_districts_map d
       WHERE ($1::uuid IS NULL OR d.id = $1)
       ORDER BY d.name`,
      [filters.districtId ?? null],
    );
    return result.rows;
  },

  async csvEvents(filters: ReportFilters): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         e.id AS "id",
         e.event_code AS "eventCode",
         e.name AS "eventName",
         e.type AS "type",
         e.status AS "status",
         e.severity AS "severity",
         e.description AS "description",
         e.started_at AS "startedAt",
         e.expected_end_at AS "expectedEndAt",
         e.ended_at AS "endedAt",
         e.source_name AS "sourceName"
       FROM hazard_events e
       WHERE ($1::uuid IS NULL OR e.id = $1)
         AND ($2::timestamptz IS NULL OR e.started_at >= $2)
         AND ($3::timestamptz IS NULL OR e.started_at <= $3)
       ORDER BY e.started_at DESC`,
      [filters.eventId ?? null, filters.dateFrom ?? null, filters.dateTo ?? null],
    );
    return result.rows;
  },

  async csvAlerts(filters: ReportFilters, clientOnly: boolean): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         a.id AS "id",
         a.title AS "title",
         a.type AS "type",
         a.severity AS "severity",
         a.status AS "status",
         a.message AS "message",
         a.event_id AS "eventId",
         a.district_id AS "districtId",
         a.commune_id AS "communeId",
         a.published_at AS "publishedAt",
         a.expires_at AS "expiresAt"
       FROM alerts a
       WHERE ($1::uuid IS NULL OR a.event_id = $1)
         AND ($2::uuid IS NULL OR a.district_id = $2)
         AND ($3::uuid IS NULL OR a.commune_id = $3)
         AND (
           $4::boolean = false
           OR (a.status = 'PUBLIEE' AND (a.expires_at IS NULL OR a.expires_at > now()))
         )
         AND ($5::timestamptz IS NULL OR a.published_at >= $5)
         AND ($6::timestamptz IS NULL OR a.published_at <= $6)
       ORDER BY a.published_at DESC NULLS LAST`,
      [
        filters.eventId ?? null,
        filters.districtId ?? null,
        filters.communeId ?? null,
        clientOnly,
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
      ],
    );
    return result.rows;
  },

  async csvRisks(filters: ReportFilters): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id)
           ra.commune_id, ra.event_id, ra.risk_score, ra.risk_level, ra.phase, ra.assessed_at
         FROM risk_assessments ra
         WHERE ($1::uuid IS NULL OR ra.event_id = $1)
           AND ($5::timestamptz IS NULL OR ra.assessed_at >= $5)
           AND ($6::timestamptz IS NULL OR ra.assessed_at <= $6)
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT
         l.commune_id AS "communeId",
         c.name AS "communeName",
         d.name AS "districtName",
         l.event_id AS "eventId",
         l.risk_score::text AS "riskScore",
         l.risk_level AS "riskLevel",
         l.phase AS "phase",
         c.population::text AS "population",
         l.assessed_at AS "assessedAt"
       FROM latest l
       JOIN communes c ON c.id = l.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       WHERE ($2::uuid IS NULL OR c.district_id = $2)
         AND ($3::uuid IS NULL OR c.id = $3)
       ORDER BY l.risk_score DESC NULLS LAST`,
      [
        filters.eventId ?? null,
        filters.districtId ?? null,
        filters.communeId ?? null,
        false,
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
      ],
    );
    return result.rows;
  },

  async csvExposedCommunes(filters: ReportFilters): Promise<Record<string, unknown>[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         ve.event_id AS "eventId",
         ve.event_name AS "eventName",
         ve.commune_id AS "communeId",
         ve.commune_name AS "communeName",
         ve.district_id AS "districtId",
         ve.district_name AS "districtName",
         ve.distance_to_track_km::text AS "distanceToTrackKm",
         ve.is_inside_influence_area AS "isInsideInfluenceArea",
         ve.exposed_population::text AS "exposedPopulation",
         ve.risk_score::text AS "riskScore",
         ve.risk_level AS "riskLevel"
       FROM v_event_impacted_communes ve
       WHERE ($1::uuid IS NULL OR ve.event_id = $1)
         AND ($2::uuid IS NULL OR ve.district_id = $2)
         AND ($3::uuid IS NULL OR ve.commune_id = $3)
       ORDER BY ve.risk_score DESC NULLS LAST`,
      [filters.eventId ?? null, filters.districtId ?? null, filters.communeId ?? null],
    );
    return result.rows;
  },

  async geojsonCommunes(communeId?: string | null): Promise<GeoRow[]> {
    const result = await db.query<GeoRow>(
      `SELECT
         jsonb_build_object(
           'communeId', c.id,
           'communeCode', c.admin_code,
           'communeName', c.name,
           'postalCode', c.postal_code,
           'population', c.population,
           'vulnerabilityScore', c.vulnerability_score,
           'districtId', c.district_id,
           'districtName', c.district_name
         ) AS props,
         ST_AsGeoJSON(c.geom)::jsonb AS geometry
       FROM v_communes_map c
       WHERE ($1::uuid IS NULL OR c.id = $1)
       ORDER BY c.name`,
      [communeId ?? null],
    );
    return result.rows;
  },

  async geojsonDistricts(): Promise<GeoRow[]> {
    const result = await db.query<GeoRow>(
      `SELECT
         jsonb_build_object(
           'districtId', d.id,
           'adminCode', d.admin_code,
           'districtName', d.name,
           'population', d.population,
           'vulnerabilityScore', d.vulnerability_score,
           'regionName', d.region_name
         ) AS props,
         ST_AsGeoJSON(d.geom)::jsonb AS geometry
       FROM v_districts_map d
       ORDER BY d.name`,
    );
    return result.rows;
  },

  async geojsonEventAreas(eventId: string): Promise<GeoRow[]> {
    const result = await db.query<GeoRow>(
      `SELECT
         jsonb_build_object(
           'areaId', a.id,
           'phase', a.phase,
           'riskLevel', a.risk_level,
           'radiusKm', a.radius_km,
           'validFrom', a.valid_from,
           'validTo', a.valid_to,
           'source', a.source
         ) AS props,
         ST_AsGeoJSON(a.geom)::jsonb AS geometry
       FROM event_areas a
       WHERE a.event_id = $1
       ORDER BY a.created_at DESC`,
      [eventId],
    );
    return result.rows;
  },

  async geojsonRisks(filters: ReportFilters): Promise<GeoRow[]> {
    const result = await db.query<GeoRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id)
           ra.commune_id, ra.event_id, ra.risk_score, ra.risk_level, ra.phase, ra.assessed_at
         FROM risk_assessments ra
         WHERE ($1::uuid IS NULL OR ra.event_id = $1)
           AND ($2::timestamptz IS NULL OR ra.assessed_at >= $2)
           AND ($3::timestamptz IS NULL OR ra.assessed_at <= $3)
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT
         jsonb_build_object(
           'communeId', c.id,
           'communeName', c.name,
           'districtName', d.name,
           'riskScore', l.risk_score,
           'riskLevel', l.risk_level,
           'phase', l.phase,
           'assessedAt', l.assessed_at
         ) AS props,
         ST_AsGeoJSON(c.geom)::jsonb AS geometry
       FROM latest l
       JOIN communes c ON c.id = l.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       WHERE ($4::uuid IS NULL OR c.id = $4)
         AND ($5::uuid IS NULL OR c.district_id = $5)
       ORDER BY l.risk_score DESC NULLS LAST`,
      [
        filters.eventId ?? null,
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
        filters.communeId ?? null,
        filters.districtId ?? null,
      ],
    );
    return result.rows;
  },

  async dashboardReport(range: { dateFrom: Date; dateTo: Date }): Promise<{
    eventsByStatus: Record<string, number>;
    alerts: { total: number; published: number; active: number };
    riskDistribution: Record<string, number>;
    communesAssessed: number;
    exposure: { communes: number; population: number };
    pendingMatchings: number;
    priorityCommunes: Record<string, unknown>[];
    latestAlerts: Record<string, unknown>[];
  }> {
    const params = [range.dateFrom.toISOString(), range.dateTo.toISOString()];

    const eventsResult = await db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM hazard_events
       WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
       GROUP BY status`,
      params,
    );
    const eventsByStatus: Record<string, number> = {};
    for (const row of eventsResult.rows) {
      eventsByStatus[row.status] = parseInt(row.count, 10);
    }

    const alertsResult = await db.query<{
      total: string;
      published: string;
      active: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'PUBLIEE')::text AS published,
         COUNT(*) FILTER (WHERE status = 'PUBLIEE' AND (expires_at IS NULL OR expires_at > now()))::text AS active
       FROM alerts
       WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz`,
      params,
    );

    const distributionResult = await db.query<{ risk_level: string; count: string }>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id) ra.commune_id, ra.risk_level
         FROM risk_assessments ra
         WHERE ra.assessed_at BETWEEN $1::timestamptz AND $2::timestamptz
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT COALESCE(risk_level::text, 'INCONNU') AS risk_level, COUNT(*)::text AS count
       FROM latest
       GROUP BY risk_level`,
      params,
    );
    const riskDistribution: Record<string, number> = {};
    for (const row of distributionResult.rows) {
      riskDistribution[row.risk_level] = parseInt(row.count, 10);
    }

    const assessedResult = await db.query<CountRow>(
      `SELECT COUNT(DISTINCT commune_id)::text AS count
       FROM risk_assessments
       WHERE assessed_at BETWEEN $1::timestamptz AND $2::timestamptz`,
      params,
    );

    const exposureResult = await db.query<{ communes: string; population: string }>(
      `SELECT
         COUNT(*)::text AS communes,
         COALESCE(SUM(exposed_population), 0)::text AS population
       FROM exposed_communes
       WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz`,
      params,
    );

    const pendingResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM v_pending_matching`,
    );

    const priorityResult = await db.query<Record<string, unknown>>(
      `WITH latest AS (
         SELECT DISTINCT ON (ra.commune_id) ra.commune_id, ra.risk_score, ra.risk_level
         FROM risk_assessments ra
         WHERE ra.assessed_at BETWEEN $1::timestamptz AND $2::timestamptz
         ORDER BY ra.commune_id, ra.assessed_at DESC
       )
       SELECT
         l.commune_id AS "communeId",
         l.risk_score::text AS "riskScore",
         l.risk_level AS "riskLevel",
         c.name AS "communeName",
         d.name AS "districtName",
         c.population::text AS "population"
       FROM latest l
       JOIN communes c ON c.id = l.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       ORDER BY l.risk_score DESC NULLS LAST
       LIMIT 10`,
      params,
    );

    const latestAlertsResult = await db.query<Record<string, unknown>>(
      `SELECT
         a.id AS "id",
         a.title AS "title",
         a.type AS "type",
         a.severity AS "severity",
         a.status AS "status",
         a.published_at AS "publishedAt",
         COALESCE(he.name, NULL::text) AS "eventName",
         COALESCE(cm.name, NULL::text) AS "communeName"
       FROM alerts a
       LEFT JOIN hazard_events he ON he.id = a.event_id
       LEFT JOIN communes cm ON cm.id = a.commune_id
       WHERE a.created_at BETWEEN $1::timestamptz AND $2::timestamptz
       ORDER BY a.published_at DESC NULLS LAST
       LIMIT 5`,
      params,
    );

    return {
      eventsByStatus,
      alerts: {
        total: parseInt(alertsResult.rows[0]?.total ?? '0', 10),
        published: parseInt(alertsResult.rows[0]?.published ?? '0', 10),
        active: parseInt(alertsResult.rows[0]?.active ?? '0', 10),
      },
      riskDistribution,
      communesAssessed: parseInt(assessedResult.rows[0]?.count ?? '0', 10),
      exposure: {
        communes: parseInt(exposureResult.rows[0]?.communes ?? '0', 10),
        population: parseInt(exposureResult.rows[0]?.population ?? '0', 10),
      },
      pendingMatchings: parseInt(pendingResult.rows[0]?.count ?? '0', 10),
      priorityCommunes: priorityResult.rows,
      latestAlerts: latestAlertsResult.rows,
    };
  },

  async eventReport(
    eventId: string,
    clientOnly: boolean,
  ): Promise<{
    event: Record<string, unknown> | null;
    areas: { type: 'FeatureCollection'; features: Array<Record<string, unknown>> };
    exposedCommunes: Record<string, unknown>[];
    exposedPopulation: number;
    riskDistribution: Record<string, number>;
    riskCount: number;
    weather: {
      available: boolean;
      latestObservedAt: string | null;
      latest: Record<string, unknown> | null;
    };
    alerts: Record<string, unknown>[];
  }> {
    const eventResult = await db.query<Record<string, unknown>>(
      `SELECT
         id,
         event_code AS "eventCode",
         name,
         type,
         status,
         severity,
         description,
         started_at AS "startedAt",
         expected_end_at AS "expectedEndAt",
         ended_at AS "endedAt",
         source_name AS "sourceName",
         source_url AS "sourceUrl",
         created_at AS "createdAt"
       FROM hazard_events
       WHERE id = $1`,
      [eventId],
    );
    const event = eventResult.rows[0] ?? null;

    const areasResult = await db.query<{ feature: Record<string, unknown> }>(
      `SELECT
         jsonb_build_object(
           'type', 'Feature',
           'id', a.id,
           'geometry', ST_AsGeoJSON(a.geom)::jsonb,
           'properties', jsonb_build_object(
             'areaId', a.id,
             'phase', a.phase,
             'riskLevel', a.risk_level,
             'radiusKm', a.radius_km,
             'validFrom', a.valid_from,
             'validTo', a.valid_to,
             'source', a.source
           )
         )::jsonb AS feature
       FROM event_areas a
       WHERE a.event_id = $1
       ORDER BY a.created_at DESC`,
      [eventId],
    );

    const exposedResult = await db.query<Record<string, unknown>>(
      `SELECT
         commune_id AS "communeId",
         commune_name AS "communeName",
         district_id AS "districtId",
         district_name AS "districtName",
         distance_to_track_km::text AS "distanceToTrackKm",
         is_inside_influence_area AS "isInsideInfluenceArea",
         exposed_population::text AS "exposedPopulation",
         risk_score::text AS "riskScore",
         risk_level AS "riskLevel"
       FROM v_event_impacted_communes
       WHERE event_id = $1
       ORDER BY risk_score DESC NULLS LAST`,
      [eventId],
    );

    const populationResult = await db.query<{ population: string }>(
      `SELECT COALESCE(SUM(exposed_population), 0)::text AS population
       FROM exposed_communes
       WHERE event_id = $1`,
      [eventId],
    );

    const distributionResult = await db.query<{ risk_level: string; count: string }>(
      `SELECT COALESCE(risk_level::text, 'INCONNU') AS risk_level, COUNT(*)::text AS count
       FROM risk_assessments
       WHERE event_id = $1
       GROUP BY risk_level`,
      [eventId],
    );
    const riskDistribution: Record<string, number> = {};
    for (const row of distributionResult.rows) {
      riskDistribution[row.risk_level] = parseInt(row.count, 10);
    }

    const riskCountResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM risk_assessments WHERE event_id = $1`,
      [eventId],
    );

    const weatherCountResult = await db.query<{
      count: string;
      latest_observed_at: string | null;
    }>(
      `SELECT
         COUNT(*)::text AS count,
         MAX(wo.observed_at) AS latest_observed_at
       FROM weather_observations wo
       WHERE EXISTS (
         SELECT 1 FROM exposed_communes ec WHERE ec.event_id = $1 AND ec.commune_id = wo.commune_id
       )`,
      [eventId],
    );
    const weatherCount = parseInt(weatherCountResult.rows[0]?.count ?? '0', 10);

    const weatherLatestResult = await db.query<Record<string, unknown>>(
      `SELECT
         wo.temperature_c::text AS "temperatureC",
         wo.wind_speed_kmh::text AS "windSpeedKmh",
         wo.precipitation_mm::text AS "precipitationMm",
         wo.humidity_percent::text AS "humidityPercent",
         wo.observed_at AS "observedAt",
         c.name AS "communeName"
       FROM weather_observations wo
       JOIN communes c ON c.id = wo.commune_id
       WHERE EXISTS (
         SELECT 1 FROM exposed_communes ec WHERE ec.event_id = $1 AND ec.commune_id = wo.commune_id
       )
       ORDER BY wo.observed_at DESC
       LIMIT 1`,
      [eventId],
    );

    const alertsResult = await db.query<Record<string, unknown>>(
      `SELECT
         id,
         title,
         type,
         severity,
         status,
         message,
         district_id AS "districtId",
         commune_id AS "communeId",
         published_at AS "publishedAt",
         expires_at AS "expiresAt"
       FROM alerts
       WHERE event_id = $1
         AND (
           $2::boolean = false
           OR (status = 'PUBLIEE' AND (expires_at IS NULL OR expires_at > now()))
         )
       ORDER BY published_at DESC NULLS LAST`,
      [eventId, clientOnly],
    );

    return {
      event,
      areas: {
        type: 'FeatureCollection',
        features: areasResult.rows.map((r) => r.feature),
      },
      exposedCommunes: exposedResult.rows,
      exposedPopulation: parseInt(populationResult.rows[0]?.population ?? '0', 10),
      riskDistribution,
      riskCount: parseInt(riskCountResult.rows[0]?.count ?? '0', 10),
      weather: {
        available: weatherCount > 0,
        latestObservedAt: weatherCountResult.rows[0]?.latest_observed_at ?? null,
        latest: weatherLatestResult.rows[0] ?? null,
      },
      alerts: alertsResult.rows,
    };
  },
};
