import { db } from '../config/database';

interface LatestAlertRow {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  publishedAt: string | null;
}

export interface DashboardSummaryData {
  activeEvents: number;
  forecastEvents: number;
  activeAlerts: number;
  totalDistricts: number;
  totalCommunes: number;
  extremeRiskCommunes: number;
  highRiskCommunes: number;
  exposedPopulation: number | null;
  lastUpdatedAt: string | null;
}

export interface RiskDistributionEntry {
  riskLevel: string;
  count: number;
}

export interface EventsTimelineEntry {
  date: string;
  total: number;
  byType: Record<string, number>;
}

export const dashboardRepository = {
  async summaryData(eventId?: string): Promise<DashboardSummaryData> {
    const has = Boolean(eventId);
    const evClause = has ? 'id = $1 AND' : '';
    const alertClause = has ? ' AND event_id = $1' : '';
    const raClause = has ? ' AND event_id = $1' : '';
    const expClause = has ? 'ec.event_id = $1' : "he.status IN ('ACTIF', 'SUIVI')";
    const values: unknown[] = has ? [eventId] : [];

    const result = await db.query<{
      activeEvents: number;
      forecastEvents: number;
      activeAlerts: number;
      totalDistricts: number;
      totalCommunes: number;
      extremeRiskCommunes: number;
      highRiskCommunes: number;
      exposedPopulation: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::integer FROM hazard_events
           WHERE ${evClause} status IN ('ACTIF', 'SUIVI')) AS "activeEvents",
         (SELECT COUNT(*)::integer FROM hazard_events
           WHERE ${evClause} status = 'PREVISION') AS "forecastEvents",
         (SELECT COUNT(*)::integer FROM alerts
           WHERE (status = 'BROUILLON'
              OR (status = 'PUBLIEE' AND (expires_at IS NULL OR expires_at > now())))${alertClause}) AS "activeAlerts",
         (SELECT COUNT(*)::integer FROM districts) AS "totalDistricts",
         (SELECT COUNT(*)::integer FROM communes) AS "totalCommunes",
         (SELECT COUNT(*)::integer FROM (
            SELECT DISTINCT ON (commune_id) commune_id, risk_level
            FROM risk_assessments ra
            WHERE TRUE${raClause}
            ORDER BY commune_id, assessed_at DESC
         ) latest WHERE risk_level = 'EXTREME') AS "extremeRiskCommunes",
         (SELECT COUNT(*)::integer FROM (
            SELECT DISTINCT ON (commune_id) commune_id, risk_level
            FROM risk_assessments ra
            WHERE TRUE${raClause}
            ORDER BY commune_id, assessed_at DESC
         ) latest WHERE risk_level = 'ELEVE') AS "highRiskCommunes",
         (SELECT COALESCE(SUM(ec.exposed_population), 0)::text
            FROM exposed_communes ec
            JOIN hazard_events he ON he.id = ec.event_id
           WHERE ${expClause}) AS "exposedPopulation"`,
      values,
    );
    const row = result.rows[0];

    const lastUpdated = await db.query<{ value: string | null }>(
      `SELECT GREATEST(
         (SELECT MAX(assessed_at) FROM risk_assessments),
         (SELECT MAX(observed_at) FROM weather_observations),
         (SELECT MAX(updated_at) FROM hazard_events),
         (SELECT MAX(published_at) FROM alerts)
       )::text AS value`,
    );

    return {
      activeEvents: row.activeEvents,
      forecastEvents: row.forecastEvents,
      activeAlerts: row.activeAlerts,
      totalDistricts: row.totalDistricts,
      totalCommunes: row.totalCommunes,
      extremeRiskCommunes: row.extremeRiskCommunes,
      highRiskCommunes: row.highRiskCommunes,
      exposedPopulation:
        row.exposedPopulation !== null ? parseInt(row.exposedPopulation, 10) : null,
      lastUpdatedAt: lastUpdated.rows[0]?.value ?? null,
    };
  },

  async countCommunes(): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM communes`,
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  async countPendingMatchings(): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM territory_matching WHERE status = 'EN_ATTENTE'`,
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  async latestAlerts(limit: number, eventId?: string): Promise<LatestAlertRow[]> {
    const eventClause = eventId ? ' AND event_id = $1' : '';
    const limitIdx = eventId ? 2 : 1;
    const values: unknown[] = eventId ? [eventId, limit] : [limit];
    const result = await db.query<LatestAlertRow>(
      `SELECT
         id,
         title,
         type,
         severity,
         status,
         event_id AS "eventId",
         district_id AS "districtId",
         commune_id AS "communeId",
         published_at AS "publishedAt"
       FROM alerts
       WHERE status = 'PUBLIEE' AND (expires_at IS NULL OR expires_at > now())${eventClause}
       ORDER BY published_at DESC NULLS LAST
       LIMIT $${limitIdx}`,
      values,
    );
    return result.rows;
  },

  async riskDistribution(eventId?: string): Promise<RiskDistributionEntry[]> {
    const eventClause = eventId ? ' WHERE event_id = $1' : '';
    const values: unknown[] = eventId ? [eventId] : [];
    const result = await db.query<{ riskLevel: string; count: number }>(
      `WITH latest AS (
         SELECT DISTINCT ON (commune_id) commune_id, risk_level
         FROM risk_assessments
         ${eventClause}
         ORDER BY commune_id, assessed_at DESC
       ),
       counts AS (
         SELECT risk_level, COUNT(*)::integer AS count
         FROM latest
         GROUP BY risk_level
       )
       SELECT risk_level::text AS "riskLevel", count
       FROM counts
       ORDER BY risk_level`,
      values,
    );
    return result.rows.map((r) => ({ riskLevel: r.riskLevel, count: r.count }));
  },

  async eventsTimeline(
    dateFrom: Date,
    dateTo: Date,
    eventId?: string,
  ): Promise<EventsTimelineEntry[]> {
    const rows = eventId
      ? (
          await db.query<{ date: string; type: string; count: number }>(
            `SELECT
               to_char(date_trunc('day', assessed_at), 'YYYY-MM-DD') AS date,
               ra.risk_level::text AS type,
               COUNT(*)::integer AS count
             FROM risk_assessments ra
             WHERE ra.event_id = $3
               AND date_trunc('day', assessed_at) >= date_trunc('day', $1::timestamptz)
               AND date_trunc('day', assessed_at) <= date_trunc('day', $2::timestamptz)
             GROUP BY 1, 2
             ORDER BY 1 ASC`,
            [dateFrom.toISOString(), dateTo.toISOString(), eventId],
          )
        ).rows
      : (
          await db.query<{ date: string; type: string; count: number }>(
            `SELECT
               to_char(day, 'YYYY-MM-DD') AS date,
               e.type,
               COUNT(*)::integer AS count
             FROM hazard_events e
             CROSS JOIN LATERAL (
               SELECT date_trunc('day', COALESCE(e.started_at, e.created_at)) AS day
             ) d
             WHERE d.day >= date_trunc('day', $1::timestamptz)
               AND d.day <= date_trunc('day', $2::timestamptz)
             GROUP BY 1, 2
             ORDER BY 1 ASC`,
            [dateFrom.toISOString(), dateTo.toISOString()],
          )
        ).rows;

    const byDate = new Map<string, Map<string, number>>();
    for (const row of rows) {
      let types = byDate.get(row.date);
      if (!types) {
        types = new Map<string, number>();
        byDate.set(row.date, types);
      }
      types.set(row.type, row.count);
    }

    return Array.from(byDate.entries())
      .map(([date, types]) => {
        const total = Array.from(types.values()).reduce((sum, n) => sum + n, 0);
        const byType: Record<string, number> = {};
        for (const [type, count] of types.entries()) {
          byType[type] = count;
        }
        return { date, total, byType };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  },
};
