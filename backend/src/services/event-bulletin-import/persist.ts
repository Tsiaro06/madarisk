import { db } from '../../config/database';
import { usersRepository } from '../../repositories/users.repository';
import { AppError } from '../../utils/app-error';
import { CanonicalTrackPoint } from '../../types/event-bulletin-import.types';
import { UserRole } from '../../types/auth.types';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function kmhToRounded(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

export async function persistBulletinImport(params: {
  fileName: string;
  parser: string;
  points: CanonicalTrackPoint[];
  eventId?: string;
  eventCode?: string;
  name?: string;
  type?: string;
  createIfMissing: boolean;
  replaceTracks: boolean;
  actor: { id: string; role: UserRole };
  req: RequestContext;
}): Promise<{ eventId: string; eventCode: string; tracksInserted: number; created: boolean }> {
  if (params.actor.role !== 'ADMIN' && params.actor.role !== 'SUPER_ADMIN' && params.actor.role !== 'ANALYSTE_SIG') {
    throw AppError.forbidden('Permissions insuffisantes pour importer un bulletin');
  }
  if (!params.points || params.points.length === 0) {
    throw AppError.badRequest('Aucun point de trajectoire à importer');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let eventId = params.eventId ?? null;
    let eventCode = params.eventCode ?? null;
    let created = false;

    if (eventId) {
      const ex = await client.query<{ event_code: string }>('SELECT event_code FROM hazard_events WHERE id = $1', [eventId]);
      if (ex.rows.length === 0) throw AppError.notFound('Événement introuvable');
      eventCode = ex.rows[0].event_code;
    } else if (eventCode) {
      const ex = await client.query<{ id: string }>('SELECT id FROM hazard_events WHERE event_code = $1', [eventCode]);
      if (ex.rows.length > 0) {
        eventId = ex.rows[0].id;
      } else if (params.createIfMissing) {
        const name = params.name || `Cyclone importé - ${eventCode}`;
        const type = params.type || 'CYCLONE';
        const ins = await client.query<{ id: string; event_code: string }>(
          `INSERT INTO hazard_events (event_code, name, type, status, severity, description, source_name)
           VALUES ($1, $2, $3, 'PREVISION', 'ELEVEE', $4, 'Import bulletin automatique')
           RETURNING id, event_code`,
          [eventCode, name, type, `Importé depuis ${params.fileName} via parseur ${params.parser}`],
        );
        eventId = ins.rows[0].id;
        eventCode = ins.rows[0].event_code;
        created = true;
      } else {
        throw AppError.notFound("Événement avec cet eventCode introuvable et createIfMissing=false");
      }
    } else if (params.createIfMissing) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      eventCode = `CY-IMP-${y}${m}${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const name = params.name || `Cyclone importé ${eventCode}`;
      const type = params.type || 'CYCLONE';
      const ins = await client.query<{ id: string; event_code: string }>(
        `INSERT INTO hazard_events (event_code, name, type, status, severity, description, source_name)
         VALUES ($1, $2, $3, 'PREVISION', 'ELEVEE', $4, 'Import bulletin automatique')
         RETURNING id, event_code`,
        [eventCode, name, type, `Importé depuis ${params.fileName} via parseur ${params.parser}`],
      );
      eventId = ins.rows[0].id;
      eventCode = ins.rows[0].event_code;
      created = true;
    } else {
      throw AppError.badRequest('eventId ou eventCode requis');
    }

    if (params.replaceTracks && eventId) {
      await client.query('DELETE FROM event_tracks WHERE event_id = $1', [eventId]);
    }

    let tracksInserted = 0;
    for (const p of params.points) {
      try {
        await client.query(
          `INSERT INTO event_tracks
             (event_id, observed_at, track_type, latitude, longitude,
              wind_speed_kmh, gust_speed_kmh, pressure_hpa,
              movement_direction, movement_speed_kmh,
              radius_34kt_km, radius_50kt_km, radius_64kt_km,
              geom)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                   ST_SetSRID(ST_MakePoint($5::double precision,$4::double precision),4326))
           ON CONFLICT DO NOTHING`,
          [
            eventId,
            p.observedAt,
            p.trackType,
            p.lat,
            p.lon,
            kmhToRounded(p.windSpeedKmh),
            kmhToRounded(p.gustSpeedKmh),
            p.pressureHpa ?? null,
            p.movementDirection ?? null,
            kmhToRounded(p.movementSpeedKmh),
            p.radius34ktKm ?? null,
            p.radius50ktKm ?? null,
            p.radius64ktKm ?? null,
          ],
        );
        tracksInserted += 1;
      } catch {
        // skip bad point
      }
    }

    await client.query('COMMIT');

    if (eventId) {
      try {
        await usersRepository.writeAudit({
          userId: params.actor.id,
          action: 'EVENT_BULLETIN_IMPORTED',
          entityType: 'hazard_event',
          entityId: eventId,
          newValue: { fileName: params.fileName, parser: params.parser, pointsCount: params.points.length, tracksInserted },
          ipAddress: getIp(params.req),
        });
      } catch {
        // ignore audit failure
      }
    }

    if (!eventId || !eventCode) {
      throw AppError.internal("Échec de l'import du bulletin d'événement");
    }
    return { eventId, eventCode, tracksInserted, created };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AppError) throw err;
    throw AppError.internal("Échec de l'import du bulletin d'événement");
  } finally {
    client.release();
  }
}
