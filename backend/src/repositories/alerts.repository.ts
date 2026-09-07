import { db } from '../config/database';
import { Alert, AlertListRow, AlertStatus, AlertType } from '../types/alert.types';
import { SeverityLevel } from '../types/event.types';
import { PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

interface AlertRow {
  id: string;
  event_id: string | null;
  district_id: string | null;
  commune_id: string | null;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  created_by: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AlertListRaw extends AlertRow {
  event_name: string | null;
  district_name: string | null;
  commune_name: string | null;
}

function mapAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    eventId: row.event_id,
    districtId: row.district_id,
    communeId: row.commune_id,
    type: row.type as AlertType,
    severity: row.severity as SeverityLevel,
    status: row.status as AlertStatus,
    title: row.title,
    message: row.message,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAlertList(row: AlertListRaw): AlertListRow {
  return {
    ...mapAlert(row),
    eventName: row.event_name,
    districtName: row.district_name,
    communeName: row.commune_name,
  };
}

const ALERT_COLUMNS = `
  a.id, a.event_id, a.district_id, a.commune_id, a.type, a.severity, a.status,
  a.title, a.message, a.created_by, a.published_at, a.expires_at, a.created_at, a.updated_at
`;

const ALERT_COLUMNS_RETURNING = `
  id, event_id, district_id, commune_id, type, severity, status,
  title, message, created_by, published_at, expires_at, created_at, updated_at
`;

const LIST_JOINS = `
  LEFT JOIN hazard_events he ON he.id = a.event_id
  LEFT JOIN districts d ON d.id = a.district_id
  LEFT JOIN communes cm ON cm.id = a.commune_id
`;

export interface AlertListQuery {
  page: number;
  limit: number;
  status?: AlertStatus;
  type?: AlertType;
  severity?: SeverityLevel;
  eventId?: string;
  districtId?: string;
  communeId?: string;
  activeOnly: boolean;
  clientOnly: boolean;
}

export interface AlertUpdateData {
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  type?: AlertType;
  severity?: SeverityLevel;
  title?: string;
  message?: string;
  expiresAt?: string | null;
}

export const alertsRepository = {
  async create(data: {
    eventId?: string | null;
    districtId?: string | null;
    communeId?: string | null;
    type: AlertType;
    severity: SeverityLevel;
    status?: AlertStatus;
    title: string;
    message: string;
    createdBy?: string | null;
    expiresAt?: string | null;
    publishedAt?: string | null;
  }): Promise<Alert> {
    const result = await db.query<AlertRow>(
      `INSERT INTO alerts
         (event_id, district_id, commune_id, type, severity, status, title, message,
          created_by, expires_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      [
        data.eventId ?? null,
        data.districtId ?? null,
        data.communeId ?? null,
        data.type,
        data.severity,
        data.status ?? 'BROUILLON',
        data.title,
        data.message,
        data.createdBy ?? null,
        data.expiresAt ?? null,
        data.publishedAt ?? null,
      ],
    );
    return mapAlert(result.rows[0]);
  },

  async list(query: AlertListQuery): Promise<PaginatedResult<AlertListRow>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.clientOnly) {
      conditions.push(`a.status = 'PUBLIEE'`);
      conditions.push(`(a.expires_at IS NULL OR a.expires_at > now())`);
    } else {
      if (query.status) {
        conditions.push(`a.status = $${idx++}`);
        values.push(query.status);
      }
      if (query.type) {
        conditions.push(`a.type = $${idx++}`);
        values.push(query.type);
      }
      if (query.severity) {
        conditions.push(`a.severity = $${idx++}`);
        values.push(query.severity);
      }
      if (query.eventId) {
        conditions.push(`a.event_id = $${idx++}`);
        values.push(query.eventId);
      }
      if (query.districtId) {
        conditions.push(`a.district_id = $${idx++}`);
        values.push(query.districtId);
      }
      if (query.communeId) {
        conditions.push(`a.commune_id = $${idx++}`);
        values.push(query.communeId);
      }
      if (query.activeOnly) {
        conditions.push(`a.status = 'PUBLIEE'`);
        conditions.push(`(a.expires_at IS NULL OR a.expires_at > now())`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM alerts a
       ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<AlertListRaw>(
      `SELECT
         ${ALERT_COLUMNS},
         COALESCE(he.name, NULL::text) AS "event_name",
         COALESCE(d.name, NULL::text) AS "district_name",
         COALESCE(cm.name, NULL::text) AS "commune_name"
       FROM alerts a
       ${LIST_JOINS}
       ${where}
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return {
      items: pageResult.rows.map(mapAlertList),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async findById(id: string): Promise<AlertListRow | null> {
    const result = await db.query<AlertListRaw>(
      `SELECT
         ${ALERT_COLUMNS},
         COALESCE(he.name, NULL::text) AS "event_name",
         COALESCE(d.name, NULL::text) AS "district_name",
         COALESCE(cm.name, NULL::text) AS "commune_name"
       FROM alerts a
       ${LIST_JOINS}
       WHERE a.id = $1`,
      [id],
    );
    return result.rows[0] ? mapAlertList(result.rows[0]) : null;
  },

  async update(id: string, data: AlertUpdateData): Promise<Alert | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const mapping: Array<[string, keyof AlertUpdateData]> = [
      ['event_id', 'eventId'],
      ['district_id', 'districtId'],
      ['commune_id', 'communeId'],
      ['type', 'type'],
      ['severity', 'severity'],
      ['title', 'title'],
      ['message', 'message'],
      ['expires_at', 'expiresAt'],
    ];

    for (const [column, key] of mapping) {
      if (data[key] !== undefined) {
        sets.push(`${column} = $${idx++}`);
        values.push(data[key] ?? null);
      }
    }

    if (sets.length === 0) {
      const current = await this.findById(id);
      if (!current) return null;
      const { eventName, districtName, communeName, ...alert } = current;
      void eventName;
      void districtName;
      void communeName;
      return alert;
    }

    values.push(id);
    const result = await db.query<AlertRow>(
      `UPDATE alerts
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      values,
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : null;
  },

  async publish(id: string): Promise<Alert | null> {
    const result = await db.query<AlertRow>(
      `UPDATE alerts
       SET status = 'PUBLIEE', published_at = now()
       WHERE id = $1
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      [id],
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : null;
  },

  async archive(id: string): Promise<Alert | null> {
    const result = await db.query<AlertRow>(
      `UPDATE alerts
       SET status = 'ARCHIVEE'
       WHERE id = $1
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      [id],
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : null;
  },

  async findActiveSimilar(eventId: string | null, communeId: string): Promise<Alert | null> {
    const result = await db.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS}
       FROM alerts a
       WHERE a.event_id IS NOT DISTINCT FROM $1
         AND a.commune_id = $2
         AND a.status IN ('BROUILLON', 'PUBLIEE')
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [eventId, communeId],
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : null;
  },

  async getCommuneName(communeId: string): Promise<string | null> {
    const result = await db.query<{ name: string }>(`SELECT name FROM communes WHERE id = $1`, [
      communeId,
    ]);
    return result.rows[0]?.name ?? null;
  },

  async getEventName(eventId: string): Promise<string | null> {
    const result = await db.query<{ name: string }>(
      `SELECT name FROM hazard_events WHERE id = $1`,
      [eventId],
    );
    return result.rows[0]?.name ?? null;
  },
};
