import { db } from '../config/database';
import {
  Alert,
  AlertBasis,
  AlertListRow,
  AlertStatus,
  AlertType,
  AlertUpdateEntry,
} from '../types/alert.types';
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
  region_id: string | null;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  source: string | null;
  basis: string | null;
  valid_from: string | null;
  is_automatic: boolean;
  update_count: number;
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
  region_name: string | null;
}

interface UpdateEntryRow {
  id: string;
  alert_id: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  trigger: string;
  auto_publish: boolean;
  old_title: string | null;
  new_title: string | null;
  old_message: string | null;
  new_message: string | null;
  old_severity: string | null;
  new_severity: string | null;
  old_basis: string | null;
  new_basis: string | null;
  recorded_at: string;
}

function mapAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    eventId: row.event_id,
    districtId: row.district_id,
    communeId: row.commune_id,
    regionId: row.region_id,
    type: row.type as AlertType,
    severity: row.severity as SeverityLevel,
    status: row.status as AlertStatus,
    title: row.title,
    message: row.message,
    source: row.source,
    basis: row.basis as AlertBasis | null,
    validFrom: row.valid_from,
    isAutomatic: row.is_automatic,
    updateCount: row.update_count,
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
    regionName: row.region_name,
  };
}

function mapUpdateEntry(row: UpdateEntryRow): AlertUpdateEntry {
  return {
    id: row.id,
    alertId: row.alert_id,
    kind: row.kind as AlertUpdateEntry['kind'],
    fromStatus: row.from_status as AlertStatus | null,
    toStatus: row.to_status as AlertStatus | null,
    trigger: row.trigger as AlertUpdateEntry['trigger'],
    autoPublish: row.auto_publish,
    oldTitle: row.old_title,
    newTitle: row.new_title,
    oldMessage: row.old_message,
    newMessage: row.new_message,
    oldSeverity: row.old_severity as SeverityLevel | null,
    newSeverity: row.new_severity as SeverityLevel | null,
    oldBasis: row.old_basis as AlertBasis | null,
    newBasis: row.new_basis as AlertBasis | null,
    recordedAt: row.recorded_at,
  };
}

const ALERT_COLUMNS = `
  a.id, a.event_id, a.district_id, a.commune_id, a.region_id, a.type, a.severity,
  a.status, a.title, a.message, a.source, a.basis, a.valid_from,
  a.is_automatic, a.update_count,
  a.created_by, a.published_at, a.expires_at, a.created_at, a.updated_at
`;

const ALERT_COLUMNS_RETURNING = `
  id, event_id, district_id, commune_id, region_id, type, severity,
  status, title, message, source, basis, valid_from,
  is_automatic, update_count,
  created_by, published_at, expires_at, created_at, updated_at
`;

const LIST_JOINS = `
  LEFT JOIN hazard_events he ON he.id = a.event_id
  LEFT JOIN districts d ON d.id = a.district_id
  LEFT JOIN communes cm ON cm.id = a.commune_id
  LEFT JOIN regions r ON r.id = a.region_id
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
  automatic?: boolean;
  basis?: AlertBasis;
}

export interface AlertUpdateData {
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  regionId?: string | null;
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
    regionId?: string | null;
    type: AlertType;
    severity: SeverityLevel;
    status?: AlertStatus;
    title: string;
    message: string;
    source?: string | null;
    basis?: AlertBasis | null;
    validFrom?: string | null;
    isAutomatic?: boolean;
    updateCount?: number;
    createdBy?: string | null;
    expiresAt?: string | null;
    publishedAt?: string | null;
  }): Promise<Alert> {
    const result = await db.query<AlertRow>(
      `INSERT INTO alerts
         (event_id, district_id, commune_id, region_id, type, severity, status,
          title, message, source, basis, valid_from,
          is_automatic, update_count,
          created_by, expires_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      [
        data.eventId ?? null,
        data.districtId ?? null,
        data.communeId ?? null,
        data.regionId ?? null,
        data.type,
        data.severity,
        data.status ?? 'BROUILLON',
        data.title,
        data.message,
        data.source ?? null,
        data.basis ?? null,
        data.validFrom ?? null,
        data.isAutomatic ?? false,
        data.updateCount ?? 0,
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
      if (query.automatic !== undefined) {
        conditions.push(`a.is_automatic = $${idx++}`);
        values.push(query.automatic);
      }
      if (query.basis) {
        conditions.push(`a.basis = $${idx++}`);
        values.push(query.basis);
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
         COALESCE(cm.name, NULL::text) AS "commune_name",
         COALESCE(r.name, NULL::text) AS "region_name"
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
         COALESCE(cm.name, NULL::text) AS "commune_name",
         COALESCE(r.name, NULL::text) AS "region_name"
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
      ['region_id', 'regionId'],
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
      const { eventName, districtName, communeName, regionName, ...alert } = current;
      void eventName;
      void districtName;
      void communeName;
      void regionName;
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

  async applyAutomaticUpdate(
    id: string,
    data: {
      title: string;
      message: string;
      type: AlertType;
      severity: SeverityLevel;
      status: AlertStatus;
      basis: AlertBasis;
      source: string | null;
      validFrom: string | null;
      expiresAt: string | null;
      publishedAt: string | null;
    },
  ): Promise<Alert | null> {
    const result = await db.query<AlertRow>(
      `UPDATE alerts
       SET title = $2, message = $3, type = $4, severity = $5,
           status = $6, basis = $7, source = $8,
           valid_from = $9, expires_at = $10,
           published_at = COALESCE($11, published_at),
           update_count = update_count + 1, updated_at = now()
       WHERE id = $1
       RETURNING ${ALERT_COLUMNS_RETURNING}`,
      [
        id,
        data.title,
        data.message,
        data.type,
        data.severity,
        data.status,
        data.basis,
        data.source,
        data.validFrom,
        data.expiresAt,
        data.publishedAt,
      ],
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

  async findAutomaticForTarget(
    eventId: string,
    territory: { communeId?: string; districtId?: string; regionId?: string },
  ): Promise<Alert | null> {
    const isGlobal =
      territory.communeId === undefined &&
      territory.districtId === undefined &&
      territory.regionId === undefined;

    const result = await db.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS}
       FROM alerts a
       WHERE a.event_id = $1
         AND a.is_automatic = true
         AND a.status IN ('BROUILLON', 'PUBLIEE')
         AND a.commune_id IS NOT DISTINCT FROM $2
         AND a.district_id IS NOT DISTINCT FROM $3
         AND a.region_id IS NOT DISTINCT FROM $4
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [
        eventId,
        isGlobal ? null : (territory.communeId ?? null),
        isGlobal ? null : (territory.districtId ?? null),
        isGlobal ? null : (territory.regionId ?? null),
      ],
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

  async addUpdateEntry(entry: {
    alertId: string;
    kind: 'CREATED' | 'UPDATED';
    fromStatus: AlertStatus | null;
    toStatus: AlertStatus;
    trigger: string;
    autoPublish: boolean;
    oldTitle?: string | null;
    newTitle?: string | null;
    oldMessage?: string | null;
    newMessage?: string | null;
    oldSeverity?: SeverityLevel | null;
    newSeverity?: SeverityLevel | null;
    oldBasis?: AlertBasis | null;
    newBasis?: AlertBasis | null;
  }): Promise<void> {
    await db.query(
      `INSERT INTO alert_updates
         (alert_id, kind, from_status, to_status, trigger, auto_publish,
          old_title, new_title, old_message, new_message,
          old_severity, new_severity, old_basis, new_basis)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        entry.alertId,
        entry.kind,
        entry.fromStatus,
        entry.toStatus,
        entry.trigger,
        entry.autoPublish,
        entry.oldTitle ?? null,
        entry.newTitle ?? null,
        entry.oldMessage ?? null,
        entry.newMessage ?? null,
        entry.oldSeverity ?? null,
        entry.newSeverity ?? null,
        entry.oldBasis ?? null,
        entry.newBasis ?? null,
      ],
    );
  },

  async listUpdateEntries(alertId: string): Promise<AlertUpdateEntry[]> {
    const result = await db.query<UpdateEntryRow>(
      `SELECT
         id, alert_id, kind, from_status, to_status, trigger, auto_publish,
         old_title, new_title, old_message, new_message,
         old_severity, new_severity, old_basis, new_basis, recorded_at
       FROM alert_updates
       WHERE alert_id = $1
       ORDER BY recorded_at ASC, id ASC`,
      [alertId],
    );
    return result.rows.map(mapUpdateEntry);
  },
};
