import { db } from '../config/database';
import type { HazardDetectionRule } from '../types/automation.types';
import type { AutomationRunStatus } from '../types/automation.types';
import type {
  DetectionGeoScope,
  DetectionRunInfo,
  EventTimelineEntry,
} from '../types/detection.types';
import type { EventStatus, SeverityLevel } from '../types/event.types';

const OBSERVATION_METRIC_COLUMNS = new Set([
  'precipitation_mm',
  'rainfall_24h_mm',
  'temperature_c',
  'humidity_percent',
  'wind_speed_kmh',
  'wind_gusts_kmh',
  'pressure_hpa',
]);

const FORECAST_METRIC_COLUMNS = new Set([
  'precipitation_sum_mm',
  'temperature_min_c',
  'temperature_max_c',
  'relative_humidity_avg',
  'wind_speed_max_kmh',
  'wind_gusts_max_kmh',
  'pressure_avg_hpa',
]);

function assertObservationColumn(column: string): void {
  if (!OBSERVATION_METRIC_COLUMNS.has(column)) {
    throw new Error(`Métrique observation non reconnue : ${column}`);
  }
}

function assertForecastColumn(column: string): void {
  if (!FORECAST_METRIC_COLUMNS.has(column)) {
    throw new Error(`Métrique prévision non reconnue : ${column}`);
  }
}

export interface ScopeResolution {
  geoKey: string;
  porteeType: DetectionGeoScope;
  label: string;
  communeIds: string[];
}

export interface MetricValueRow {
  communeId: string;
  communeName: string;
  value: number;
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface MonitoringRow {
  eventId: string;
  detectionKey: string;
  status: string;
  hazardType: string;
  consecutiveNormalCycles: number;
  monitoringSince: string | null;
  lastDetectedAt: string | null;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  rules_evaluated: string;
  detections: string;
  rules_triggered: string;
  events_created: string;
  events_updated: string;
  error_message: string | null;
}

function mapRun(row: RunRow): DetectionRunInfo {
  return {
    runId: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as AutomationRunStatus,
    trigger: row.trigger as DetectionRunInfo['trigger'],
    rulesEvaluated: parseInt(row.rules_evaluated, 10),
    detections: parseInt(row.detections, 10),
    rulesTriggered: parseInt(row.rules_triggered, 10),
    eventsCreated: parseInt(row.events_created, 10),
    eventsUpdated: parseInt(row.events_updated, 10),
    errorMessage: row.error_message,
  };
}

interface MetricRow {
  commune_id: string;
  commune_name: string;
  value: string;
  timestamp: string;
  latitude: string;
  longitude: string;
}

function mapMetricRow(row: MetricRow): MetricValueRow {
  return {
    communeId: row.commune_id,
    communeName: row.commune_name,
    value: parseFloat(row.value),
    timestamp: row.timestamp,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
  };
}

export const hazardDetectionRepository = {
  async resolveScopeInfo(rule: HazardDetectionRule): Promise<ScopeResolution> {
    if (rule.communeId) {
      const rows = await db.query<{ id: string; name: string }>(
        `SELECT id, name FROM communes WHERE id = $1`,
        [rule.communeId],
      );
      if (!rows.rows[0]) {
        return {
          geoKey: rule.communeId,
          porteeType: 'commune',
          label: 'Commune inconnue',
          communeIds: [],
        };
      }
      return {
        geoKey: rule.communeId,
        porteeType: 'commune',
        label: rows.rows[0].name,
        communeIds: [rule.communeId],
      };
    }

    if (rule.districtId) {
      const district = await db.query<{ name: string }>(
        `SELECT name FROM districts WHERE id = $1`,
        [rule.districtId],
      );
      const communes = await db.query<{ id: string }>(
        `SELECT id FROM communes WHERE district_id = $1 ORDER BY name`,
        [rule.districtId],
      );
      return {
        geoKey: rule.districtId,
        porteeType: 'district',
        label: district.rows[0]?.name ?? 'District inconnu',
        communeIds: communes.rows.map((r) => r.id),
      };
    }

    if (rule.regionId) {
      const region = await db.query<{ name: string }>(`SELECT name FROM regions WHERE id = $1`, [
        rule.regionId,
      ]);
      const communes = await db.query<{ id: string }>(
        `SELECT c.id
         FROM communes c
         JOIN districts d ON d.id = c.district_id
         WHERE d.region_id = $1
         ORDER BY c.name`,
        [rule.regionId],
      );
      return {
        geoKey: rule.regionId,
        porteeType: 'region',
        label: region.rows[0]?.name ?? 'Région inconnue',
        communeIds: communes.rows.map((r) => r.id),
      };
    }

    const communes = await db.query<{ id: string }>(
      `SELECT id FROM communes ORDER BY name LIMIT 5000`,
    );
    return {
      geoKey: 'NATIONAL',
      porteeType: 'national',
      label: 'Nationale',
      communeIds: communes.rows.map((r) => r.id),
    };
  },

  async observationValues(
    column: string,
    communeIds: string[],
    since: string,
  ): Promise<MetricValueRow[]> {
    if (communeIds.length === 0) return [];
    assertObservationColumn(column);
    const result = await db.query<MetricRow>(
      `SELECT DISTINCT ON (wo.commune_id)
         wo.commune_id,
         c.name AS commune_name,
         wo.${column}::text AS value,
         wo.observed_at::text AS timestamp,
         wo.latitude::text AS latitude,
         wo.longitude::text AS longitude
       FROM weather_observations wo
       JOIN communes c ON c.id = wo.commune_id
       WHERE wo.commune_id = ANY($1::uuid[])
         AND wo.observed_at >= $2
         AND wo.${column} IS NOT NULL
         AND wo.data_kind = 'OBSERVE'
       ORDER BY wo.commune_id, wo.observed_at DESC`,
      [communeIds, since],
    );
    return result.rows.map(mapMetricRow);
  },

  async forecastValues(
    column: string,
    communeIds: string[],
    forecastDay: string,
  ): Promise<MetricValueRow[]> {
    if (communeIds.length === 0) return [];
    assertForecastColumn(column);
    const result = await db.query<MetricRow>(
      `SELECT DISTINCT ON (wf.commune_id)
         wf.commune_id,
         c.name AS commune_name,
         wf.${column}::text AS value,
         wf.forecast_day::text AS timestamp,
         wf.latitude::text AS latitude,
         wf.longitude::text AS longitude
       FROM weather_forecasts wf
       JOIN communes c ON c.id = wf.commune_id
       WHERE wf.commune_id = ANY($1::uuid[])
         AND wf.forecast_day = $2
         AND wf.${column} IS NOT NULL
         AND wf.data_kind = 'PREVU'
       ORDER BY wf.commune_id, wf.generated_at DESC`,
      [communeIds, forecastDay],
    );
    return result.rows.map(mapMetricRow);
  },

  async createRun(trigger: string): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO hazard_detection_runs (trigger) VALUES ($1) RETURNING id`,
      [trigger],
    );
    return result.rows[0].id;
  },

  async finishRun(
    runId: string,
    data: {
      status: AutomationRunStatus;
      rulesEvaluated: number;
      detections: number;
      rulesTriggered: number;
      eventsCreated: number;
      eventsUpdated: number;
      errorMessage?: string | null;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE hazard_detection_runs
       SET finished_at = now(),
           status = $2,
           rules_evaluated = $3,
           detections = $4,
           rules_triggered = $5,
           events_created = $6,
           events_updated = $7,
           error_message = $8,
           details = $9
       WHERE id = $1`,
      [
        runId,
        data.status,
        data.rulesEvaluated,
        data.detections,
        data.rulesTriggered,
        data.eventsCreated,
        data.eventsUpdated,
        data.errorMessage ?? null,
        JSON.stringify(data.details ?? {}),
      ],
    );
  },

  async listRuns(limit: number): Promise<DetectionRunInfo[]> {
    const result = await db.query<RunRow>(
      `SELECT id, started_at, finished_at, status, trigger,
              rules_evaluated, detections, rules_triggered,
              events_created, events_updated, error_message
       FROM hazard_detection_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 100))],
    );
    return result.rows.map(mapRun);
  },

  async findOpenEventByKey(
    detectionKey: string,
    sinceDedupe: string,
  ): Promise<{ id: string; status: string; severity: string } | null> {
    const result = await db.query<{ id: string; status: string; severity: string }>(
      `SELECT e.id, e.status, e.severity
       FROM event_detection_keys k
       JOIN hazard_events e ON e.id = k.event_id
       WHERE k.detection_key = $1
         AND e.status IN ('PREVISION', 'ACTIF', 'SUIVI')
         AND k.first_seen_at >= $2
       ORDER BY k.last_seen_at DESC
       LIMIT 1`,
      [detectionKey, sinceDedupe],
    );
    return result.rows[0] ?? null;
  },

  async createEvent(data: {
    eventCode: string;
    name: string;
    type: string;
    status: EventStatus;
    severity: SeverityLevel;
    description: string | null;
    sourceName: string | null;
    startupTime: string;
  }): Promise<{ id: string; status: string; severity: string }> {
    const result = await db.query<{ id: string; status: string; severity: string }>(
      `INSERT INTO hazard_events
         (event_code, name, type, status, severity, description,
          source_name, started_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
       RETURNING id, status, severity`,
      [
        data.eventCode,
        data.name,
        data.type,
        data.status,
        data.severity,
        data.description,
        data.sourceName,
        data.startupTime,
      ],
    );
    return result.rows[0];
  },

  async attachDetectionKey(eventId: string, detectionKey: string): Promise<void> {
    await db.query(
      `INSERT INTO event_detection_keys (event_id, detection_key)
       VALUES ($1, $2)
       ON CONFLICT (event_id, detection_key)
       DO UPDATE SET last_seen_at = now()`,
      [eventId, detectionKey],
    );
  },

  async insertMonitoring(eventId: string, detectionKey: string, when: string): Promise<void> {
    await db.query(
      `INSERT INTO event_monitoring (event_id, detection_key, consecutive_normal_cycles, last_detected_at, last_evaluated_at)
       VALUES ($1, $2, 0, $3, $3)
       ON CONFLICT (event_id)
       DO UPDATE SET detection_key = EXCLUDED.detection_key,
                     last_evaluated_at = EXCLUDED.last_evaluated_at`,
      [eventId, detectionKey, when],
    );
  },

  async markDetected(eventId: string, when: string): Promise<void> {
    await db.query(
      `UPDATE event_monitoring
       SET consecutive_normal_cycles = 0,
           last_detected_at = $2,
           last_evaluated_at = $2
       WHERE event_id = $1`,
      [eventId, when],
    );
  },

  async incrementNormalCycle(eventId: string, when: string): Promise<number> {
    const result = await db.query<{ cycles: string }>(
      `UPDATE event_monitoring
       SET consecutive_normal_cycles = consecutive_normal_cycles + 1,
           last_evaluated_at = $2
       WHERE event_id = $1
       RETURNING consecutive_normal_cycles::text AS cycles`,
      [eventId, when],
    );
    return result.rows[0] ? parseInt(result.rows[0].cycles, 10) : 0;
  },

  async beginMonitoring(eventId: string, when: string): Promise<void> {
    await db.query(
      `UPDATE event_monitoring
       SET monitoring_since = $2, last_evaluated_at = $2
       WHERE event_id = $1`,
      [eventId, when],
    );
  },

  async listMonitorings(): Promise<MonitoringRow[]> {
    const result = await db.query<{
      event_id: string;
      detection_key: string;
      status: string;
      type: string;
      consecutive_normal_cycles: string;
      monitoring_since: string | null;
      last_detected_at: string | null;
    }>(
      `SELECT m.event_id, m.detection_key, e.status, e.type::text AS type,
              m.consecutive_normal_cycles::text AS consecutive_normal_cycles,
              m.monitoring_since::text AS monitoring_since,
              m.last_detected_at::text AS last_detected_at
       FROM event_monitoring m
       JOIN hazard_events e ON e.id = m.event_id
       WHERE e.status IN ('ACTIF', 'SUIVI')`,
    );
    return result.rows.map((r) => ({
      eventId: r.event_id,
      detectionKey: r.detection_key,
      status: r.status,
      hazardType: r.type,
      consecutiveNormalCycles: parseInt(r.consecutive_normal_cycles, 10),
      monitoringSince: r.monitoring_since,
      lastDetectedAt: r.last_detected_at,
    }));
  },

  async deleteMonitoring(eventId: string): Promise<void> {
    await db.query(`DELETE FROM event_monitoring WHERE event_id = $1`, [eventId]);
  },

  async writeStatusHistory(data: {
    eventId: string;
    fromStatus: EventStatus | null;
    toStatus: EventStatus;
    reason: string | null;
    source: string;
    actorType?: 'SYSTEM' | 'USER';
    actorId?: string | null;
  }): Promise<void> {
    await db.query(
      `INSERT INTO event_status_history (event_id, from_status, to_status, reason, actor_type, actor_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.eventId,
        data.fromStatus,
        data.toStatus,
        data.reason,
        data.actorType ?? 'SYSTEM',
        data.actorId ?? null,
        data.source,
      ],
    );
  },

  async writeSnapshot(data: {
    eventId: string;
    trigger: string;
    status: EventStatus;
    severity: SeverityLevel;
    exposedCommuneCount: number;
    riskLevelSummary: Record<string, unknown>;
    metricValues: Record<string, unknown>;
    details: Record<string, unknown>;
  }): Promise<void> {
    await db.query(
      `INSERT INTO event_snapshots
         (event_id, trigger, status, severity, exposed_commune_count,
          risk_level_summary, metric_values, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.eventId,
        data.trigger,
        data.status,
        data.severity,
        data.exposedCommuneCount,
        JSON.stringify(data.riskLevelSummary),
        JSON.stringify(data.metricValues),
        JSON.stringify(data.details),
      ],
    );
  },

  async countExposedCommunes(eventId: string): Promise<number> {
    const result = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM exposed_communes WHERE event_id = $1`,
      [eventId],
    );
    return parseInt(result.rows[0]?.n ?? '0', 10);
  },

  async getEventTimeline(eventId: string): Promise<EventTimelineEntry[]> {
    const result = await db.query<
      {
        kind: string;
        recorded_at: string;
        from_status: string | null;
        to_status: string | null;
        reason: string | null;
        source: string;
        actor_type: string;
        severity: string | null;
        exposed_commune_count: string | null;
        metric_values: unknown;
        details: unknown;
      } & { index: string }
    >(
      `SELECT * FROM (
         SELECT 'STATUS_CHANGE' AS kind,
                h.recorded_at, h.from_status::text AS from_status,
                h.to_status::text AS to_status, h.reason, h.source,
                h.actor_type, NULL AS severity,
                NULL AS exposed_commune_count, NULL AS metric_values, NULL AS details,
                h.recorded_at AS sort_key
           FROM event_status_history h
          WHERE h.event_id = $1
         UNION ALL
         SELECT 'SNAPSHOT' AS kind,
                s.recorded_at, NULL AS from_status, s.status::text AS to_status,
                NULL AS reason, s.trigger AS source, 'SYSTEM' AS actor_type,
                s.severity::text AS severity,
                s.exposed_commune_count::text AS exposed_commune_count,
                s.metric_values, s.details,
                s.recorded_at AS sort_key
           FROM event_snapshots s
          WHERE s.event_id = $1
       ) t
       ORDER BY t.sort_key DESC`,
      [eventId],
    );
    return result.rows.map((r) => ({
      recordedAt: r.recorded_at,
      kind: r.kind as EventTimelineEntry['kind'],
      fromStatus: r.from_status as EventTimelineEntry['fromStatus'],
      toStatus: r.to_status as EventTimelineEntry['toStatus'],
      reason: r.reason,
      source: r.source,
      actorType: r.actor_type,
      severity: r.severity as EventTimelineEntry['severity'],
      exposedCommuneCount:
        r.exposed_commune_count !== null ? parseInt(r.exposed_commune_count, 10) : null,
      metricValues:
        r.metric_values !== null && r.metric_values !== undefined
          ? (r.metric_values as Record<string, unknown>)
          : null,
      details:
        r.details !== null && r.details !== undefined
          ? (r.details as Record<string, unknown>)
          : null,
    }));
  },
};
