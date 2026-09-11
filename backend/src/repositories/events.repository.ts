import { db } from '../config/database';
import {
  AreaGeoJson,
  EventListItem,
  EventAlert,
  EventRiskDistribution,
  EventStatus,
  EventStats,
  EventTrack,
  EventTrackFeature,
  ExposureCalculationResult,
  ExposedCommuneRow,
  RiskLevel,
  RiskPhase,
  SeverityLevel,
  TrackGeoJson,
} from '../types/event.types';
import { PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

interface EventRow {
  id: string;
  event_code: string;
  name: string;
  type: string;
  status: string;
  severity: string;
  description: string | null;
  source_name: string | null;
  source_url: string | null;
  started_at: string | null;
  expected_end_at: string | null;
  ended_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapEvent(row: EventRow): EventListItem {
  return {
    id: row.id,
    eventCode: row.event_code,
    name: row.name,
    type: row.type as EventListItem['type'],
    status: row.status as EventListItem['status'],
    severity: row.severity as SeverityLevel,
    description: row.description,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    startedAt: row.started_at,
    expectedEndAt: row.expected_end_at,
    endedAt: row.ended_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EVENT_BASE_COLUMNS = `
  e.id,
  e.event_code AS "event_code",
  e.name,
  e.type,
  e.status,
  e.severity,
  e.description,
  e.source_name,
  e.source_url,
  e.started_at,
  e.expected_end_at,
  e.ended_at,
  e.created_by,
  e.created_at,
  e.updated_at
`;

export const eventsRepository = {
  async create(data: {
    eventCode: string;
    name: string;
    type: string;
    status: EventStatus;
    severity: SeverityLevel;
    description: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    startedAt: string | null;
    expectedEndAt: string | null;
    createdBy: string;
  }): Promise<EventListItem> {
    const result = await db.query<EventRow>(
      `INSERT INTO hazard_events AS e
         (event_code, name, type, status, severity, description,
          source_name, source_url, started_at, expected_end_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${EVENT_BASE_COLUMNS}`,
      [
        data.eventCode,
        data.name,
        data.type,
        data.status,
        data.severity,
        data.description,
        data.sourceName,
        data.sourceUrl,
        data.startedAt,
        data.expectedEndAt,
        data.createdBy,
      ],
    );
    return mapEvent(result.rows[0]);
  },

  async findByCode(eventCode: string): Promise<EventListItem | null> {
    const result = await db.query<EventRow>(
      `SELECT ${EVENT_BASE_COLUMNS} FROM hazard_events e WHERE e.event_code = $1`,
      [eventCode],
    );
    return result.rows[0] ? mapEvent(result.rows[0]) : null;
  },

  async findById(id: string): Promise<EventListItem | null> {
    const result = await db.query<EventRow>(
      `SELECT ${EVENT_BASE_COLUMNS} FROM hazard_events e WHERE e.id = $1`,
      [id],
    );
    return result.rows[0] ? mapEvent(result.rows[0]) : null;
  },

  async list(query: {
    page: number;
    limit: number;
    type?: string;
    status?: string;
    severity?: string;
    startedAfter?: Date;
    startedBefore?: Date;
    search?: string;
  }): Promise<PaginatedResult<EventListItem>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.type) {
      conditions.push(`e.type = $${idx++}`);
      values.push(query.type);
    }
    if (query.status) {
      conditions.push(`e.status = $${idx++}`);
      values.push(query.status);
    }
    if (query.severity) {
      conditions.push(`e.severity = $${idx++}`);
      values.push(query.severity);
    }
    if (query.startedAfter) {
      conditions.push(`e.started_at >= $${idx++}`);
      values.push(query.startedAfter.toISOString());
    }
    if (query.startedBefore) {
      conditions.push(`e.started_at <= $${idx++}`);
      values.push(query.startedBefore.toISOString());
    }
    if (query.search) {
      conditions.push(
        `(e.name ILIKE $${idx} OR e.event_code ILIKE $${idx} OR e.description ILIKE $${idx} OR e.source_name ILIKE $${idx})`,
      );
      values.push(`%${query.search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM hazard_events e ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<EventRow>(
      `SELECT ${EVENT_BASE_COLUMNS}
       FROM hazard_events e
       ${where}
       ORDER BY e.started_at DESC NULLS LAST, e.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return {
      items: pageResult.rows.map(mapEvent),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getStats(eventId: string): Promise<EventStats> {
    const result = await db.query<{
      totalTrackPoints: string;
      totalAreas: string;
      totalExposedCommunes: string;
      exposedPopulation: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM event_tracks WHERE event_id = $1) AS "totalTrackPoints",
         (SELECT COUNT(*)::text FROM event_areas WHERE event_id = $1) AS "totalAreas",
         (SELECT COUNT(*)::text FROM exposed_communes WHERE event_id = $1) AS "totalExposedCommunes",
         (SELECT SUM(ec.exposed_population)::text FROM exposed_communes ec WHERE ec.event_id = $1) AS "exposedPopulation"`,
      [eventId],
    );
    const row = result.rows[0];
    const exposedPopulation = row?.exposedPopulation ?? null;
    return {
      totalTrackPoints: parseInt(row?.totalTrackPoints ?? '0', 10),
      totalAreas: parseInt(row?.totalAreas ?? '0', 10),
      totalExposedCommunes: parseInt(row?.totalExposedCommunes ?? '0', 10),
      exposedPopulation: exposedPopulation !== null ? parseInt(exposedPopulation, 10) : null,
    };
  },

  async getRiskDistribution(eventId: string): Promise<EventRiskDistribution | null> {
    const result = await db.query<{ riskLevel: string; count: string }>(
      `SELECT ra.risk_level AS "riskLevel", COUNT(*)::text AS count
       FROM risk_assessments ra
       WHERE ra.event_id = $1
       GROUP BY ra.risk_level`,
      [eventId],
    );
    if (result.rows.length === 0) return null;
    const distribution: EventRiskDistribution = {};
    for (const row of result.rows) {
      distribution[row.riskLevel as keyof EventRiskDistribution] = parseInt(row.count, 10);
    }
    return distribution;
  },

  async getAlerts(eventId: string): Promise<EventAlert[]> {
    const result = await db.query<{
      id: string;
      title: string;
      type: string;
      status: string;
      severity: string;
      published_at: string | null;
    }>(
      `SELECT
         a.id,
         a.title,
         a.type,
         a.status,
         a.severity,
         a.published_at AS "published_at"
       FROM alerts a
       WHERE a.event_id = $1
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC`,
      [eventId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      severity: r.severity as SeverityLevel,
      publishedAt: r.published_at,
    }));
  },

  async update(
    id: string,
    data: {
      name?: string;
      type?: string;
      severity?: SeverityLevel;
      description?: string | null;
      sourceName?: string | null;
      sourceUrl?: string | null;
      startedAt?: string | null;
      expectedEndAt?: string | null;
    },
  ): Promise<EventListItem | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.type !== undefined) {
      sets.push(`type = $${idx++}`);
      values.push(data.type);
    }
    if (data.severity !== undefined) {
      sets.push(`severity = $${idx++}`);
      values.push(data.severity);
    }
    if (data.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.sourceName !== undefined) {
      sets.push(`source_name = $${idx++}`);
      values.push(data.sourceName);
    }
    if (data.sourceUrl !== undefined) {
      sets.push(`source_url = $${idx++}`);
      values.push(data.sourceUrl);
    }
    if (data.startedAt !== undefined) {
      sets.push(`started_at = $${idx++}`);
      values.push(data.startedAt);
    }
    if (data.expectedEndAt !== undefined) {
      sets.push(`expected_end_at = $${idx++}`);
      values.push(data.expectedEndAt);
    }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await db.query<EventRow>(
      `UPDATE hazard_events e
       SET ${sets.join(', ')}
       WHERE e.id = $${idx}
       RETURNING ${EVENT_BASE_COLUMNS}`,
      values,
    );
    if (!result.rows[0]) return null;
    return mapEvent(result.rows[0]);
  },

  async updateStatus(id: string, status: EventStatus): Promise<EventListItem | null> {
    const result = await db.query<EventRow>(
      `UPDATE hazard_events e
       SET status = $1, ended_at = CASE WHEN $1 = 'CLOTURE'::event_status THEN now() ELSE ended_at END
       WHERE e.id = $2
       RETURNING ${EVENT_BASE_COLUMNS}`,
      [status, id],
    );
    return result.rows[0] ? mapEvent(result.rows[0]) : null;
  },

  async countOperationalData(eventId: string): Promise<{
    tracks: number;
    areas: number;
    alerts: number;
    risks: number;
    reports: number;
  }> {
    const result = await db.query<{
      tracks: string;
      areas: string;
      alerts: string;
      risks: string;
      reports: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM event_tracks WHERE event_id = $1) AS tracks,
         (SELECT COUNT(*)::text FROM event_areas WHERE event_id = $1) AS areas,
         (SELECT COUNT(*)::text FROM alerts WHERE event_id = $1) AS alerts,
         (SELECT COUNT(*)::text FROM risk_assessments WHERE event_id = $1) AS risks,
         (SELECT COUNT(*)::text FROM reports WHERE event_id = $1) AS reports`,
      [eventId],
    );
    const r = result.rows[0];
    return {
      tracks: parseInt(r?.tracks ?? '0', 10),
      areas: parseInt(r?.areas ?? '0', 10),
      alerts: parseInt(r?.alerts ?? '0', 10),
      risks: parseInt(r?.risks ?? '0', 10),
      reports: parseInt(r?.reports ?? '0', 10),
    };
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM hazard_events WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async listActiveEventIds(): Promise<string[]> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM hazard_events WHERE status IN ('ACTIF', 'SUIVI') ORDER BY created_at`,
    );
    return result.rows.map((r) => r.id);
  },

  async addTrack(data: {
    eventId: string;
    observedAt: string;
    forecastFor: string | null;
    trackType: string;
    latitude: number;
    longitude: number;
    windSpeedKmh: number | null;
    gustSpeedKmh: number | null;
    pressureHpa: number | null;
    precipitationMm: number | null;
    movementDirection: string | null;
    movementSpeedKmh: number | null;
  }): Promise<EventTrack> {
    const result = await db.query<{
      id: string;
      event_id: string;
      observed_at: string;
      forecast_for: string | null;
      track_type: string;
      latitude: string;
      longitude: string;
      wind_speed_kmh: string | null;
      gust_speed_kmh: string | null;
      pressure_hpa: string | null;
      precipitation_mm: string | null;
      movement_direction: string | null;
      movement_speed_kmh: string | null;
      created_at: string;
    }>(
      `INSERT INTO event_tracks
         (event_id, observed_at, forecast_for, track_type, latitude, longitude,
          wind_speed_kmh, gust_speed_kmh, pressure_hpa, precipitation_mm,
          movement_direction, movement_speed_kmh, geom)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          ST_SetSRID(ST_MakePoint($6::numeric, $5::numeric), 4326))
       RETURNING
         id, event_id, observed_at, forecast_for, track_type, latitude, longitude,
         wind_speed_kmh, gust_speed_kmh, pressure_hpa, precipitation_mm,
         movement_direction, movement_speed_kmh, created_at`,
      [
        data.eventId,
        data.observedAt,
        data.forecastFor,
        data.trackType,
        data.latitude,
        data.longitude,
        data.windSpeedKmh,
        data.gustSpeedKmh,
        data.pressureHpa,
        data.precipitationMm,
        data.movementDirection,
        data.movementSpeedKmh,
      ],
    );
    const r = result.rows[0];
    return {
      id: r.id,
      eventId: r.event_id,
      observedAt: r.observed_at,
      forecastFor: r.forecast_for,
      trackType: r.track_type as EventTrack['trackType'],
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      windSpeedKmh: r.wind_speed_kmh !== null ? parseFloat(r.wind_speed_kmh) : null,
      gustSpeedKmh: r.gust_speed_kmh !== null ? parseFloat(r.gust_speed_kmh) : null,
      pressureHpa: r.pressure_hpa !== null ? parseFloat(r.pressure_hpa) : null,
      precipitationMm: r.precipitation_mm !== null ? parseFloat(r.precipitation_mm) : null,
      movementDirection: r.movement_direction,
      movementSpeedKmh: r.movement_speed_kmh !== null ? parseFloat(r.movement_speed_kmh) : null,
      createdAt: r.created_at,
    };
  },

  async listTracks(eventId: string, trackType?: string): Promise<EventTrack[]> {
    const values: unknown[] = [eventId];
    let where = 'WHERE et.event_id = $1';
    if (trackType) {
      where += ` AND et.track_type = $2`;
      values.push(trackType);
    }
    const result = await db.query<{
      id: string;
      event_id: string;
      observed_at: string;
      forecast_for: string | null;
      track_type: string;
      latitude: string;
      longitude: string;
      wind_speed_kmh: string | null;
      gust_speed_kmh: string | null;
      pressure_hpa: string | null;
      precipitation_mm: string | null;
      movement_direction: string | null;
      movement_speed_kmh: string | null;
      created_at: string;
    }>(
      `SELECT
         id, event_id, observed_at, forecast_for, track_type, latitude, longitude,
         wind_speed_kmh, gust_speed_kmh, pressure_hpa, precipitation_mm,
         movement_direction, movement_speed_kmh, created_at
       FROM event_tracks et
       ${where}
       ORDER BY et.observed_at ASC`,
      values,
    );
    return result.rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      observedAt: r.observed_at,
      forecastFor: r.forecast_for,
      trackType: r.track_type as EventTrack['trackType'],
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      windSpeedKmh: r.wind_speed_kmh !== null ? parseFloat(r.wind_speed_kmh) : null,
      gustSpeedKmh: r.gust_speed_kmh !== null ? parseFloat(r.gust_speed_kmh) : null,
      pressureHpa: r.pressure_hpa !== null ? parseFloat(r.pressure_hpa) : null,
      precipitationMm: r.precipitation_mm !== null ? parseFloat(r.precipitation_mm) : null,
      movementDirection: r.movement_direction,
      movementSpeedKmh: r.movement_speed_kmh !== null ? parseFloat(r.movement_speed_kmh) : null,
      createdAt: r.created_at,
    }));
  },

  async trackGeoJson(eventId: string): Promise<TrackGeoJson> {
    const result = await db.query<{ feature: EventTrackFeature }>(
      `SELECT
         jsonb_build_object(
           'type', 'Feature',
           'properties', jsonb_build_object(
             'trackType', et.track_type,
             'pointCount', count(et.id),
             'startedAt', min(et.observed_at),
             'endedAt', max(et.observed_at)
           ),
           'geometry',
           CASE
             WHEN count(et.id) >= 2 THEN
               ST_AsGeoJSON(ST_MakeLine(et.geom ORDER BY et.observed_at))::jsonb
             ELSE NULL
           END
         )::jsonb AS feature
       FROM event_tracks et
       WHERE et.event_id = $1
       GROUP BY et.track_type`,
      [eventId],
    );
    const features = result.rows.map((r) => r.feature).filter((f) => f.geometry !== null);
    return { type: 'FeatureCollection', features };
  },

  async calculateArea(data: {
    eventId: string;
    phase: RiskPhase;
    riskLevel: RiskLevel;
    radiusKm: number;
    source?: string;
  }): Promise<{ id: string; geometry: unknown; radiusKm: number | null } | null> {
    const result = await db.query<{
      id: string;
      geometry: unknown;
      radius_km: string | null;
    }>(
      `INSERT INTO event_areas (event_id, phase, risk_level, radius_km, source, geom)
       SELECT
         et.event_id,
         $2::risk_phase,
         $3::risk_level,
         $4,
         $5,
         ST_SetSRID(
           ST_Multi(
             ST_Buffer(
               ST_MakeLine(et.geom ORDER BY et.observed_at)::geography,
               $6::double precision * 1000
             )::geometry
           ),
           4326
         )
       FROM event_tracks et
       WHERE et.event_id = $1
       GROUP BY et.event_id
       HAVING COUNT(et.id) >= 2
       RETURNING id, ST_AsGeoJSON(geom)::jsonb AS geometry, radius_km::text AS radius_km`,
      [
        data.eventId,
        data.phase,
        data.riskLevel,
        data.radiusKm,
        data.source ?? 'manual',
        data.radiusKm,
      ],
    );
    if (!result.rows[0]) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      geometry: r.geometry,
      radiusKm: r.radius_km !== null ? parseFloat(r.radius_km) : null,
    };
  },

  async createAreaFromPolygon(data: {
    eventId: string;
    phase: RiskPhase;
    riskLevel: RiskLevel;
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
    source?: string;
  }): Promise<{ id: string; geometry: unknown; radiusKm: number | null }> {
    const result = await db.query<{
      id: string;
      geometry: unknown;
      radius_km: string | null;
    }>(
      `INSERT INTO event_areas (event_id, phase, risk_level, radius_km, source, geom)
       VALUES (
         $1,
         $2::risk_phase,
         $3::risk_level,
         NULL,
         $4,
         ST_SetSRID(
           ST_Multi(ST_GeomFromGeoJSON($5::jsonb)),
           4326
         )
       )
       RETURNING id, ST_AsGeoJSON(geom)::jsonb AS geometry, radius_km::text AS radius_km`,
      [
        data.eventId,
        data.phase,
        data.riskLevel,
        data.source ?? 'manual-polygon',
        JSON.stringify(data.geometry),
      ],
    );
    const r = result.rows[0];
    return {
      id: r.id,
      geometry: r.geometry,
      radiusKm: r.radius_km !== null ? parseFloat(r.radius_km) : null,
    };
  },

  async listAreas(eventId: string): Promise<AreaGeoJson> {
    const result = await db.query<{ feature: AreaGeoJson['features'][number] }>(
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
    return { type: 'FeatureCollection', features: result.rows.map((r) => r.feature) };
  },

  async hasAreas(eventId: string): Promise<boolean> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM event_areas WHERE event_id = $1`,
      [eventId],
    );
    return parseCount(result.rows[0]) > 0;
  },

  async latestAreaPhase(eventId: string): Promise<RiskPhase | null> {
    const result = await db.query<{ phase: string }>(
      `SELECT phase FROM event_areas WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [eventId],
    );
    return result.rows[0] ? (result.rows[0].phase as RiskPhase) : null;
  },

  async deleteArea(eventId: string, areaId: string): Promise<boolean> {
    const result = await db.query<CountRow>(
      `DELETE FROM event_areas WHERE id = $1 AND event_id = $2 RETURNING id`,
      [areaId, eventId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  },

  async clearExposedCommunes(eventId: string): Promise<void> {
    await db.query(`DELETE FROM exposed_communes WHERE event_id = $1`, [eventId]);
  },

  async removeExposedCommune(eventId: string, communeId: string): Promise<boolean> {
    const result = await db.query<CountRow>(
      `DELETE FROM exposed_communes WHERE event_id = $1 AND commune_id = $2 RETURNING id`,
      [eventId, communeId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  },

  async deleteRiskAssessments(eventId: string): Promise<void> {
    await db.query(`DELETE FROM risk_assessments WHERE event_id = $1`, [eventId]);
  },

  async deleteRiskAssessmentsForCommune(eventId: string, communeId: string): Promise<void> {
    await db.query(
      `DELETE FROM risk_assessments WHERE event_id = $1 AND commune_id = $2`,
      [eventId, communeId],
    );
  },

  async countTracks(eventId: string): Promise<number> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM event_tracks WHERE event_id = $1`,
      [eventId],
    );
    return parseCount(result.rows[0]);
  },

  async calculateExposure(
    eventId: string,
    areaId: string | null,
  ): Promise<ExposureCalculationResult> {
    const areaJoin =
      areaId !== null
        ? `CROSS JOIN event_areas a_sel WHERE a_sel.id = $2 AND ST_Intersects(c.geom, a_sel.geom)`
        : `WHERE EXISTS (SELECT 1 FROM event_areas a_all WHERE a_all.event_id = $1 AND ST_Intersects(c.geom, a_all.geom))`;

    const result = await db.query<{ totalInsertedOrUpdated: string }>(
      `WITH exposed AS (
         SELECT DISTINCT c.id AS commune_id, c.population
         FROM communes c
         ${areaJoin}
       ),
       track AS (
         SELECT ST_MakeLine(geom ORDER BY observed_at) AS line
         FROM event_tracks
         WHERE event_id = $1
         HAVING COUNT(*) >= 2
       ),
       upsert AS (
         INSERT INTO exposed_communes (event_id, commune_id, distance_to_track_km, is_inside_influence_area, exposed_population)
         SELECT
           $1,
           e.commune_id,
           CASE WHEN t.line IS NOT NULL
             THEN ST_Distance(c.centroid::geography, t.line::geography)::numeric(10,2)
             ELSE NULL
           END,
           true,
           e.population
         FROM exposed e
         JOIN communes c ON c.id = e.commune_id
         LEFT JOIN (SELECT line FROM track) t ON true
         ON CONFLICT (event_id, commune_id)
         DO UPDATE SET
           distance_to_track_km = EXCLUDED.distance_to_track_km,
           is_inside_influence_area = EXCLUDED.is_inside_influence_area,
           exposed_population = EXCLUDED.exposed_population
         RETURNING id
       )
       SELECT COUNT(*)::text AS "totalInsertedOrUpdated" FROM upsert`,
      areaId !== null ? [eventId, areaId] : [eventId],
    );

    const totalInsertedOrUpdated = parseCount({
      count: result.rows[0]?.totalInsertedOrUpdated ?? '0',
    });

    const totals = await db.query<{
      totalExposedCommuneCount: string;
      exposedPopulation: string | null;
    }>(
      `SELECT
         COUNT(*)::text AS "totalExposedCommuneCount",
         (SELECT SUM(ec2.exposed_population)::text FROM exposed_communes ec2 WHERE ec2.event_id = $1) AS "exposedPopulation"
       FROM exposed_communes ec
       WHERE ec.event_id = $1`,
      [eventId],
    );

    const exposedPopulation = totals.rows[0]?.exposedPopulation ?? null;
    return {
      totalCommunesCalculated: totalInsertedOrUpdated,
      totalIntersecting: totalInsertedOrUpdated,
      totalExposedCommuneCount: parseCount({
        count: totals.rows[0]?.totalExposedCommuneCount ?? '0',
      }),
      totalExposedPopulation: exposedPopulation !== null ? parseInt(exposedPopulation, 10) : null,
    };
  },

  async listExposedCommunes(query: {
    eventId: string;
    page: number;
    limit: number;
    districtId?: string;
    phase?: RiskPhase;
    riskLevel?: RiskLevel;
    minDistanceKm?: number;
    maxDistanceKm?: number;
  }): Promise<PaginatedResult<ExposedCommuneRow>> {
    const conditions: string[] = ['ec.event_id = $1'];
    const values: unknown[] = [query.eventId];
    let idx = 2;
    const phaseFilter = query.phase ? ` AND ra.phase = $${idx++}::risk_phase` : '';

    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.riskLevel) {
      conditions.push(`latest_risk.risk_level = $${idx++}::risk_level`);
      values.push(query.riskLevel);
    }
    if (query.minDistanceKm !== undefined) {
      conditions.push(`ec.distance_to_track_km >= $${idx++}`);
      values.push(query.minDistanceKm);
    }
    if (query.maxDistanceKm !== undefined) {
      conditions.push(`ec.distance_to_track_km <= $${idx++}`);
      values.push(query.maxDistanceKm);
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM exposed_communes ec
       JOIN communes c ON c.id = ec.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       LEFT JOIN LATERAL (
         SELECT ra.risk_level, ra.risk_score
         FROM risk_assessments ra
         WHERE ra.commune_id = ec.commune_id AND ra.event_id = ec.event_id${phaseFilter}
         ORDER BY ra.assessed_at DESC
         LIMIT 1
       ) latest_risk ON true
       WHERE ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<{
      communeId: string;
      communeCode: string;
      communeName: string;
      districtId: string;
      districtCode: string;
      districtName: string;
      distanceToTrackKm: string | null;
      isInsideInfluenceArea: boolean;
      exposedPopulation: number | null;
      population: number | null;
      riskLevel: string | null;
      riskScore: string | null;
    }>(
      `SELECT
         c.id AS "communeId",
         c.admin_code AS "communeCode",
         c.name AS "communeName",
         d.id AS "districtId",
         d.admin_code AS "districtCode",
         d.name AS "districtName",
         ec.distance_to_track_km::text AS "distanceToTrackKm",
         ec.is_inside_influence_area AS "isInsideInfluenceArea",
         ec.exposed_population AS "exposedPopulation",
         c.population AS "population",
         latest_risk.risk_level::text AS "riskLevel",
         latest_risk.risk_score::text AS "riskScore"
       FROM exposed_communes ec
       JOIN communes c ON c.id = ec.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       LEFT JOIN LATERAL (
         SELECT ra.risk_level, ra.risk_score
         FROM risk_assessments ra
         WHERE ra.commune_id = ec.commune_id AND ra.event_id = ec.event_id${phaseFilter}
         ORDER BY ra.assessed_at DESC
         LIMIT 1
       ) latest_risk ON true
       WHERE ${where}
       ORDER BY d.name, c.name
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return {
      items: pageResult.rows.map((r) => ({
        communeId: r.communeId,
        communeCode: r.communeCode,
        communeName: r.communeName,
        districtId: r.districtId,
        districtCode: r.districtCode,
        districtName: r.districtName,
        distanceToTrackKm: r.distanceToTrackKm !== null ? parseFloat(r.distanceToTrackKm) : null,
        isInsideInfluenceArea: r.isInsideInfluenceArea,
        exposedPopulation: r.exposedPopulation,
        population: r.population,
        riskLevel: r.riskLevel as RiskLevel | null,
        riskScore: r.riskScore !== null ? parseFloat(r.riskScore) : null,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  },
};
