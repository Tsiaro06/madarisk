import { db } from '../config/database';
import {
  AreaGeoJson,
  CommuneAlertInfoType,
  CommuneAlertScope,
  CommuneImpactsResult,
  EventCommuneAlertHistory,
  EventCommuneAlertHistoryRow,
  EventCommuneAlertRow,
  EventCommuneAlertsResult,
  EventCommuneAlertsSummary,
  EventCommuneImpactRow,
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
  TrackStatePoint,
} from '../types/event.types';
import { PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

/** Ligne brute `event_tracks` (colonnes de base + rayons de vent documentés). */
interface TrackStateRow {
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
  radius_34kt_km: string | null;
  radius_50kt_km: string | null;
  radius_64kt_km: string | null;
  radius_max_km: string | null;
  radius_source: string | null;
  radius_measure_type: string | null;
  radius_quality: string | null;
  data_quality: string | null;
  confidence: string | null;
  created_at: string;
}

const TRACK_STATE_COLUMNS = `
  id, event_id, observed_at, forecast_for, track_type, latitude, longitude,
  wind_speed_kmh, gust_speed_kmh, pressure_hpa, precipitation_mm,
  movement_direction, movement_speed_kmh,
  radius_34kt_km, radius_50kt_km, radius_64kt_km, radius_max_km,
  radius_source, radius_measure_type, radius_quality, data_quality, confidence,
  created_at
`;

/**
 * Rang de préséance appliqué quand une même commune porte plusieurs alertes
 * actives au même instant (voir `listCommuneAlertsAt`). Du plus fort au plus
 * faible :
 *  1. bulletin officiel nommant la commune (OFFICIELLE) ;
 *  2. impact observé daté (IMPACT_OBSERVE) — une commune réellement touchée est
 *     rouge, même si son district / sa région n'était qu'en alerte jaune ou
 *     n'était pas cité ;
 *  3. bulletin officiel dont le niveau est hérité d'un district / d'une région
 *     (ESTIMATION de portée DISTRICT/REGION/EVENEMENT) ;
 *  4. zone de prévision documentée (PREVISION) ;
 *  5. estimation spatiale dérivée de portée communale (ESTIMATION, ex. danger
 *     résiduel après passage).
 * À rang égal, la portée la plus locale tranche, puis la validité la plus
 * récente.
 */
const ALERT_PRECEDENCE_SQL = `CASE h.info_type
    WHEN 'OFFICIELLE' THEN 40
    WHEN 'IMPACT_OBSERVE' THEN 30
    WHEN 'ESTIMATION' THEN CASE
      WHEN h.territory_scope IN ('DISTRICT', 'REGION', 'EVENEMENT') THEN 25
      ELSE 10
    END
    WHEN 'PREVISION' THEN 20
    ELSE 0
  END DESC,
  CASE h.territory_scope
    WHEN 'COMMUNE' THEN 4 WHEN 'DISTRICT' THEN 3 WHEN 'REGION' THEN 2 ELSE 1
  END DESC,
  h.valid_from DESC`;

/** Méthode descriptive renvoyée par les trois endpoints d'alertes communales. */
const COMMUNE_ALERT_METHOD =
  "Niveau d'alerte affiché à l'instant consulté : alerte officielle (communale ou héritée d'un " +
  "district/d'une région), sinon impact observé daté, sinon zone de prévision ou estimation " +
  "spatiale documentée. Aucune commune n'est colorée à partir de sa seule distance au cyclone.";

/**
 * Normalise une ligne `event_commune_alert_history` (colonnes déjà aliasées en
 * camelCase) en objet d'API. pg renvoie les timestamptz en Date JS : on force
 * l'ISO-8601, la forme `String(Date)` casserait le parsing côté UI.
 */
function mapCommuneAlertRow(r: Record<string, unknown>): EventCommuneAlertRow {
  const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
  const isoOrNull = (v: unknown): string | null =>
    v === null || v === undefined ? null : new Date(v as string | Date).toISOString();
  return {
    communeId: String(r.communeId),
    communeName: String(r.communeName),
    communeCode:
      r.communeCode !== null && r.communeCode !== undefined ? String(r.communeCode) : null,
    districtId: r.districtId !== null && r.districtId !== undefined ? String(r.districtId) : null,
    districtName:
      r.districtName !== null && r.districtName !== undefined ? String(r.districtName) : null,
    alertLevel: r.alertLevel as EventCommuneAlertRow['alertLevel'],
    validFrom: iso(r.validFrom),
    validTo: isoOrNull(r.validTo),
    infoType: r.infoType as CommuneAlertInfoType,
    territoryScope: r.territoryScope as CommuneAlertScope,
    sourceName: r.sourceName !== null && r.sourceName !== undefined ? String(r.sourceName) : null,
    sourceUrl: r.sourceUrl !== null && r.sourceUrl !== undefined ? String(r.sourceUrl) : null,
    comment: r.comment !== null && r.comment !== undefined ? String(r.comment) : null,
    confidence:
      r.confidence !== null && r.confidence !== undefined ? parseFloat(String(r.confidence)) : null,
  };
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

function mapTrackRow(r: TrackStateRow): import('../types/event.types').EventTrack {
  return {
    id: r.id,
    eventId: r.event_id,
    observedAt: r.observed_at,
    forecastFor: r.forecast_for,
    trackType: r.track_type as import('../types/event.types').EventTrack['trackType'],
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
}

/**
 * Colonnes de traçabilité des rayons de vent documentés (nullable, jamais
 * inventés) : uniquement présents quand une source fiable les fournit.
 */
function mapTrackStatePoint(r: TrackStateRow): TrackStatePoint {
  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : parseFloat(String(v));
  return {
    ...mapTrackRow(r),
    radius34ktKm: num(r.radius_34kt_km),
    radius50ktKm: num(r.radius_50kt_km),
    radius64ktKm: num(r.radius_64kt_km),
    radiusMaxKm: num(r.radius_max_km),
    radiusSource: r.radius_source ?? null,
    radiusMeasureType: r.radius_measure_type ?? null,
    radiusQuality: r.radius_quality ?? null,
    dataQuality: r.data_quality ?? null,
    confidence: num(r.confidence),
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

  async getAlerts(
    eventId: string,
    options: { publishedOnly?: boolean } = {},
  ): Promise<EventAlert[]> {
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
         AND (
           $2::boolean = false
           OR (a.status = 'PUBLIEE' AND (a.expires_at IS NULL OR a.expires_at > now()))
         )
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC`,
      [eventId, options.publishedOnly ?? false],
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
    const result = await db.query<TrackStateRow>(
      `SELECT ${TRACK_STATE_COLUMNS}
       FROM event_tracks et
       ${where}
       ORDER BY et.observed_at ASC`,
      values,
    );
    return result.rows.map((r) => mapTrackStatePoint(r));
  },

  /**
   * État de la trajectoire observée à une date/heure donnée : point courant
   * (dernier point observé ≤ `at`), points antérieurs, et présence d'un rayon
   * de vent documenté (jamais inventé). Uniquement la trajectoire OBSERVEE :
   * les prévisions historiques n'entrent jamais dans l'état observé.
   */
  async getTrackStateAt(
    eventId: string,
    at: Date,
  ): Promise<{
    current: TrackStatePoint | null;
    previous: TrackStatePoint[];
    total: number;
    radius: { has: boolean; src: string | null; mtype: string | null; rmax: number | null };
  }> {
    const result = await db.query<TrackStateRow>(
      `SELECT ${TRACK_STATE_COLUMNS}
       FROM event_tracks
       WHERE event_id = $1 AND observed_at <= $2 AND track_type = 'OBSERVEE'
       ORDER BY observed_at ASC`,
      [eventId, at.toISOString()],
    );
    const previous = result.rows.map((r) => mapTrackStatePoint(r));
    const current = previous.length > 0 ? previous[previous.length - 1] : null;

    const totalResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM event_tracks
       WHERE event_id = $1 AND track_type = 'OBSERVEE'`,
      [eventId],
    );
    const total = parseInt(totalResult.rows[0]?.count ?? '0', 10);

    const hasRadius =
      current !== null &&
      (current.radius34ktKm !== null ||
        current.radius50ktKm !== null ||
        current.radius64ktKm !== null ||
        current.radiusMaxKm !== null);

    return {
      current,
      previous,
      total,
      radius: {
        has: hasRadius,
        src: current?.radiusSource ?? null,
        mtype: current?.radiusMeasureType ?? null,
        rmax: current?.radiusMaxKm ?? null,
      },
    };
  },

  /**
   * Impacts communaux observés à une date/heure donnée : communes dont le
   * premier impact observé (event_commune_impacts.first_affected_at) est
   * antérieur ou égal à `at`. Une commune n'apparaît donc colorée qu'après le
   * passage réellement documenté, jamais d'avance.
   */
  async listCommuneImpactsAt(eventId: string, at: Date): Promise<CommuneImpactsResult> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         eci.commune_id AS "communeId",
         c.name AS "communeName",
         c.admin_code AS "communeCode",
         d.id AS "districtId",
         d.name AS "districtName",
         eci.first_affected_at AS "firstAffectedAt",
         eci.last_affected_at AS "lastAffectedAt",
         eci.impact_state AS "impactState",
         eci.observed_risk_level AS "observedRiskLevel",
         eci.forecast_risk_level AS "forecastRiskLevel",
         eci.source_name AS "sourceName",
         eci.source_url AS "sourceUrl",
         eci.confidence AS "confidence",
         eci.method AS "method",
         eci.notes AS "notes"
       FROM event_commune_impacts eci
       JOIN communes c ON c.id = eci.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       WHERE eci.event_id = $1
         AND eci.impact_state <> 'NOT_REACHED'
         AND (eci.first_affected_at IS NULL OR eci.first_affected_at <= $2)
       ORDER BY eci.first_affected_at ASC NULLS LAST, c.name ASC`,
      [eventId, at.toISOString()],
    );

    const radius = await db.query<{
      has: boolean;
      src: string | null;
      mtype: string | null;
      rmax: string | null;
    }>(
      `SELECT
         (COUNT(*) FILTER (
            WHERE et.radius_34kt_km IS NOT NULL
               OR et.radius_50kt_km IS NOT NULL
               OR et.radius_64kt_km IS NOT NULL
               OR et.radius_max_km IS NOT NULL
         )) > 0 AS has,
         (SELECT et2.radius_source FROM event_tracks et2
           WHERE et2.event_id = $1 AND et2.radius_source IS NOT NULL LIMIT 1) AS src,
         (SELECT et3.radius_measure_type FROM event_tracks et3
           WHERE et3.event_id = $1 AND et3.radius_measure_type IS NOT NULL LIMIT 1) AS mtype,
         (SELECT MAX(et4.radius_max_km)::text FROM event_tracks et4
           WHERE et4.event_id = $1) AS rmax
       FROM event_tracks et
       WHERE et.event_id = $1`,
      [eventId],
    );

    const communes: EventCommuneImpactRow[] = result.rows.map((r) => ({
      communeId: String(r.communeId),
      communeName: String(r.communeName),
      communeCode: r.communeCode !== null ? String(r.communeCode) : null,
      districtId: r.districtId !== null ? String(r.districtId) : null,
      districtName: r.districtName !== null ? String(r.districtName) : null,
      // pg renvoie les timestamptz en Date JS : on force l'ISO-8601 (la forme
      // "Fri Feb 05 ..." de String(Date) casserait le tri/le parsing côté UI).
      firstAffectedAt:
        r.firstAffectedAt !== null
          ? new Date(r.firstAffectedAt as string | Date).toISOString()
          : null,
      lastAffectedAt:
        r.lastAffectedAt !== null
          ? new Date(r.lastAffectedAt as string | Date).toISOString()
          : null,
      impactState: r.impactState as EventCommuneImpactRow['impactState'],
      observedRiskLevel: r.observedRiskLevel as EventCommuneImpactRow['observedRiskLevel'],
      forecastRiskLevel: r.forecastRiskLevel !== null ? String(r.forecastRiskLevel) : null,
      sourceName: r.sourceName !== null ? String(r.sourceName) : null,
      sourceUrl: r.sourceUrl !== null ? String(r.sourceUrl) : null,
      confidence: r.confidence !== null ? parseFloat(String(r.confidence)) : null,
      method: r.method !== null ? String(r.method) : null,
      notes: r.notes !== null ? String(r.notes) : null,
    }));

    const radiusRow = radius.rows[0];
    const radiusMaxKm =
      radiusRow?.rmax !== null && radiusRow?.rmax !== undefined ? parseFloat(radiusRow.rmax) : null;

    return {
      eventId,
      at: at.toISOString(),
      count: communes.length,
      hasRadiusData: radiusRow?.has ?? false,
      radiusKm: radiusRow?.has ? radiusMaxKm : null,
      radiusSource: radiusRow?.src ?? null,
      communes,
      method:
        communes.length > 0
          ? `Communes dont le centre observé a atteint le territoire au plus tard à ${at.toISOString()} (données d'impact enregistrées, voir source/méthode par commune).`
          : `Aucune commune affectée documentée à ${at.toISOString()}.`,
    };
  },

  /**
   * Niveaux d'alerte communaux actifs à un instant donné : une seule ligne par
   * commune (la plus prioritaire selon ALERT_PRECEDENCE_SQL). Aucune commune
   * n'est colorée à partir de sa seule distance au cyclone : il faut une ligne
   * documentée (bulletin officiel, impact observé ou estimation tracée).
   */
  async listCommuneAlertsAt(eventId: string, at: Date): Promise<EventCommuneAlertsResult> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT resolved.* FROM (
         SELECT DISTINCT ON (h.commune_id)
           h.commune_id AS "communeId",
           c.name AS "communeName",
           c.admin_code AS "communeCode",
           d.id AS "districtId",
           d.name AS "districtName",
           h.alert_level AS "alertLevel",
           h.valid_from AS "validFrom",
           h.valid_to AS "validTo",
           h.info_type AS "infoType",
           h.territory_scope AS "territoryScope",
           h.source_name AS "sourceName",
           h.source_url AS "sourceUrl",
           h.comment AS "comment",
           h.confidence AS "confidence"
         FROM event_commune_alert_history h
         JOIN communes c ON c.id = h.commune_id
         LEFT JOIN districts d ON d.id = c.district_id
         WHERE h.event_id = $1
           AND h.valid_from <= $2
           AND (h.valid_to IS NULL OR h.valid_to >= $2)
         ORDER BY h.commune_id, ${ALERT_PRECEDENCE_SQL}
       ) resolved
       ORDER BY resolved."communeName" ASC`,
      [eventId, at.toISOString()],
    );

    const communes = result.rows.map((r) => mapCommuneAlertRow(r));
    return {
      eventId,
      at: at.toISOString(),
      count: communes.length,
      source: communes.find((c) => c.sourceName !== null)?.sourceName ?? null,
      method: COMMUNE_ALERT_METHOD,
      communes,
    };
  },

  /**
   * Répartition par niveau à un instant, pour la légende : chaque commune de la
   * base est comptée une fois (GRIS = aucune ligne active). `eventHasAlertData`
   * permet à l'UI de distinguer « événement sans alertes documentées » de
   * « instant hors période d'alerte ».
   */
  async getCommuneAlertsSummary(eventId: string, at: Date): Promise<EventCommuneAlertsSummary> {
    const result = await db.query<Record<string, unknown>>(
      `WITH active AS (
         SELECT DISTINCT ON (h.commune_id)
           h.commune_id,
           h.alert_level,
           h.info_type,
           h.territory_scope,
           h.source_name
         FROM event_commune_alert_history h
         WHERE h.event_id = $1
           AND h.valid_from <= $2
           AND (h.valid_to IS NULL OR h.valid_to >= $2)
         ORDER BY h.commune_id, ${ALERT_PRECEDENCE_SQL}
       )
       SELECT
         (SELECT count(*)::int FROM communes) AS "total",
         count(*) FILTER (WHERE alert_level = 'VERT')::int AS "VERT",
         count(*) FILTER (WHERE alert_level = 'JAUNE')::int AS "JAUNE",
         count(*) FILTER (WHERE alert_level = 'ROUGE')::int AS "ROUGE",
         count(*) FILTER (WHERE alert_level = 'BLEU')::int AS "BLEU",
         count(*) FILTER (
           WHERE info_type = 'ESTIMATION' OR territory_scope <> 'COMMUNE'
         )::int AS "estimated",
         coalesce(
           array_agg(DISTINCT source_name) FILTER (WHERE source_name IS NOT NULL),
           '{}'
         ) AS "sources",
         (SELECT EXISTS (
            SELECT 1 FROM event_commune_alert_history WHERE event_id = $1
         )) AS "eventHasAlertData"
       FROM active`,
      [eventId, at.toISOString()],
    );

    const row = result.rows[0] ?? {};
    const VERT = Number(row.VERT ?? 0);
    const JAUNE = Number(row.JAUNE ?? 0);
    const ROUGE = Number(row.ROUGE ?? 0);
    const BLEU = Number(row.BLEU ?? 0);
    const total = Number(row.total ?? 0);
    const sources = Array.isArray(row.sources) ? (row.sources as string[]) : [];
    return {
      eventId,
      at: at.toISOString(),
      total,
      levels: {
        VERT,
        JAUNE,
        ROUGE,
        BLEU,
        GRIS: Math.max(0, total - VERT - JAUNE - ROUGE - BLEU),
      },
      estimated: Number(row.estimated ?? 0),
      eventHasAlertData: Boolean(row.eventHasAlertData),
      sources,
      method: COMMUNE_ALERT_METHOD,
    };
  },

  /**
   * Historique complet et traçable d'une commune : toutes les lignes documentées
   * (toutes natures confondues), triées chronologiquement, avec le drapeau
   * « active à l'instant consulté ». Retourne `null` si la commune n'existe pas.
   */
  async getCommuneAlertHistory(
    eventId: string,
    communeId: string,
    at: Date,
  ): Promise<EventCommuneAlertHistory | null> {
    const commune = await db.query<{ name: string }>('SELECT name FROM communes WHERE id = $1', [
      communeId,
    ]);
    if (commune.rowCount === 0) return null;
    const result = await db.query<Record<string, unknown>>(
      `SELECT
         h.commune_id AS "communeId",
         c.name AS "communeName",
         c.admin_code AS "communeCode",
         d.id AS "districtId",
         d.name AS "districtName",
         h.alert_level AS "alertLevel",
         h.valid_from AS "validFrom",
         h.valid_to AS "validTo",
         h.info_type AS "infoType",
         h.territory_scope AS "territoryScope",
         h.source_name AS "sourceName",
         h.source_url AS "sourceUrl",
         h.comment AS "comment",
         h.confidence AS "confidence",
         (h.valid_from <= $3 AND (h.valid_to IS NULL OR h.valid_to >= $3)) AS "activeAt"
       FROM event_commune_alert_history h
       JOIN communes c ON c.id = h.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       WHERE h.event_id = $1 AND h.commune_id = $2
       ORDER BY h.valid_from ASC, h.alert_level ASC`,
      [eventId, communeId, at.toISOString()],
    );
    const rows: EventCommuneAlertHistoryRow[] = result.rows.map((r) => ({
      ...mapCommuneAlertRow(r),
      activeAt: Boolean(r.activeAt),
    }));
    return {
      eventId,
      communeId,
      communeName: commune.rows[0].name,
      rows,
      count: rows.length,
      method: COMMUNE_ALERT_METHOD,
    };
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
              'source', a.source,
              'sourceType', COALESCE(a.source_type, 'MANUEL'),
              'isEstimate', a.is_estimate,
              'description', a.description
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

  async listExposedCommuneIds(eventId: string): Promise<string[]> {
    const result = await db.query<{ commune_id: string }>(
      `SELECT commune_id FROM exposed_communes WHERE event_id = $1 ORDER BY commune_id`,
      [eventId],
    );
    return result.rows.map((r) => r.commune_id);
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
    await db.query(`DELETE FROM risk_assessments WHERE event_id = $1 AND commune_id = $2`, [
      eventId,
      communeId,
    ]);
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
      overlapPercent: string | null;
      sourceType: string;
      dataType: string;
      updatedAt: string;
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
         latest_risk.risk_score::text AS "riskScore",
         ec.overlap_percent::text AS "overlapPercent",
         COALESCE(ec.source_type, 'ZONE') AS "sourceType",
         COALESCE(ec.data_type, 'ESTIME') AS "dataType",
         ec.updated_at AS "updatedAt"
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
        overlapPercent: r.overlapPercent !== null ? parseFloat(r.overlapPercent) : null,
        sourceType: r.sourceType as ExposedCommuneRow['sourceType'],
        dataType: r.dataType as ExposedCommuneRow['dataType'],
        updatedAt: r.updatedAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  },
};
