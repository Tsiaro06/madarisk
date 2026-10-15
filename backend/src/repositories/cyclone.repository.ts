import { db } from '../config/database';
import type { CycloneSyncRunInfo, CycloneTrackPoint } from '../types/cyclone.types';
import type { EventStatus, SeverityLevel } from '../types/event.types';

export interface CycloneSystemLink {
  eventId: string;
  source: string;
  sourceSystemId: string;
  name: string;
  basin: string | null;
  season: number | null;
  sourceUrl: string | null;
  alertLevel: string | null;
  maxWindKmh: number | null;
  rawMetadata: Record<string, unknown>;
}

/** Cyclone clôturé par sortie de veille (aucune source ne l'a revu). */
export interface StaleCycloneEvent {
  eventId: string;
  name: string;
  previousStatus: EventStatus;
  endedAt: string;
  lastObservedAt: string | null;
  lastSeenAt: string;
}

interface StaleCycloneRow {
  id: string;
  name: string | null;
  previous_status: string;
  ended_at: string;
  last_observed_at: string | null;
  last_seen_at: string;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  sources: string;
  systems_detected: number;
  systems_tracked: number;
  events_created: number;
  events_updated: number;
  track_points: number;
  errors_count: number;
  error_message: string | null;
}

function mapRun(row: RunRow): CycloneSyncRunInfo {
  return {
    id: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    status: row.status,
    trigger: row.trigger,
    sources: row.sources,
    systemsDetected: row.systems_detected,
    systemsTracked: row.systems_tracked,
    eventsCreated: row.events_created,
    eventsUpdated: row.events_updated,
    trackPoints: row.track_points,
    errorsCount: row.errors_count,
    errorMessage: row.error_message,
  };
}

export const cycloneRepository = {
  /** Événement déjà rattaché à cette identité source, ou null. */
  async findEventIdForSource(source: string, sourceSystemId: string): Promise<string | null> {
    const result = await db.query<{ event_id: string }>(
      `SELECT event_id FROM cyclone_systems WHERE source = $1 AND source_system_id = $2`,
      [source, sourceSystemId],
    );
    return result.rows[0]?.event_id ?? null;
  },

  /**
   * Rattache une identité source à un événement. Idempotent : rejouer le cycle
   * met à jour `last_seen_at` sans créer de doublon.
   */
  async linkSystem(link: CycloneSystemLink): Promise<void> {
    await db.query(
      `INSERT INTO cyclone_systems AS s
         (event_id, source, source_system_id, name, basin, season, source_url,
          alert_level, max_wind_kmh, raw_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (source, source_system_id) DO UPDATE
         SET event_id = EXCLUDED.event_id,
             last_seen_at = now(),
             name = EXCLUDED.name,
             basin = EXCLUDED.basin,
             season = EXCLUDED.season,
             source_url = EXCLUDED.source_url,
             alert_level = EXCLUDED.alert_level,
             max_wind_kmh = EXCLUDED.max_wind_kmh,
             raw_metadata = EXCLUDED.raw_metadata`,
      [
        link.eventId,
        link.source,
        link.sourceSystemId,
        link.name,
        link.basin,
        link.season,
        link.sourceUrl,
        link.alertLevel,
        link.maxWindKmh,
        JSON.stringify(link.rawMetadata ?? {}),
      ],
    );
  },

  async createCycloneEvent(data: {
    eventCode: string;
    name: string;
    status: EventStatus;
    severity: SeverityLevel;
    description: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    startedAt: string | null;
  }): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO hazard_events
         (event_code, name, type, status, severity, description,
          source_name, source_url, started_at, created_by)
       VALUES ($1, $2, 'CYCLONE', $3, $4, $5, $6, $7, $8, NULL)
       RETURNING id`,
      [
        data.eventCode,
        data.name,
        data.status,
        data.severity,
        data.description,
        data.sourceName,
        data.sourceUrl,
        data.startedAt,
      ],
    );
    return result.rows[0].id;
  },

  /** Met à jour un événement cyclone et renvoie son statut précédent. */
  async updateCycloneEvent(
    id: string,
    data: {
      name: string;
      status: EventStatus;
      severity: SeverityLevel;
      description: string | null;
      sourceName: string | null;
      sourceUrl: string | null;
      startedAt: string | null;
    },
  ): Promise<{ previousStatus: EventStatus }> {
    const before = await db.query<{ status: string }>(
      `SELECT status FROM hazard_events WHERE id = $1`,
      [id],
    );
    const previousStatus = (before.rows[0]?.status ?? 'BROUILLON') as EventStatus;

    await db.query(
      `UPDATE hazard_events
          SET name = $2,
              status = $3,
              severity = $4,
              description = $5,
              source_name = $6,
              source_url = $7,
              started_at = COALESCE(started_at, $8),
              ended_at = CASE WHEN $3 = 'CLOTURE'::event_status THEN COALESCE(ended_at, now()) ELSE ended_at END
        WHERE id = $1`,
      [
        id,
        data.name,
        data.status,
        data.severity,
        data.description,
        data.sourceName,
        data.sourceUrl,
        data.startedAt,
      ],
    );

    return { previousStatus };
  },

  async writeStatusHistory(entry: {
    eventId: string;
    fromStatus: EventStatus | null;
    toStatus: EventStatus;
    reason: string | null;
    source: string;
  }): Promise<void> {
    await db.query(
      `INSERT INTO event_status_history
         (event_id, from_status, to_status, reason, actor_type, source)
       VALUES ($1, $2, $3, $4, 'SYSTEM', $5)`,
      [entry.eventId, entry.fromStatus, entry.toStatus, entry.reason, entry.source],
    );
  },

  /**
   * Clôture les cyclones sortis de veille.
   *
   * `linkSystem` rafraîchit `cyclone_systems.last_seen_at` à CHAQUE cycle : une
   * veille fraîche est donc la preuve, entretenue par la base, que le système est
   * toujours suivi par au moins une agence. On clôture un événement CYCLONE
   * encore ouvert (ACTIF/SUIVI) dont AUCUNE identité source n'a été revue depuis
   * `staleHours` — dissipation, ou disparition définitive des fils de veille.
   *
   * Deux garde-fous de non-invention :
   *  • seuls les événements RATTACHÉS à la veille sont concernés (un événement
   *    cyclone créé à la main, sans `cyclone_systems`, n'est jamais touché) ;
   *  • `ended_at` est la date du dernier point de trajectoire DOCUMENTÉ (sinon la
   *    date de dernière veille, sinon maintenant) — jamais une heure inventée.
   *
   * L'appelant ne déclenche cette clôture que lorsque les DEUX sources ont
   * répondu : une agence muette ne doit jamais faire passer un cyclone vivant
   * pour disparu.
   */
  async closeStaleWatchedEvents(staleHours: number): Promise<StaleCycloneEvent[]> {
    const result = await db.query<StaleCycloneRow>(
      `WITH watched AS (
         SELECT e.id,
                e.name,
                e.status,
                MAX(s.last_seen_at) AS last_seen_at
           FROM hazard_events e
           JOIN cyclone_systems s ON s.event_id = e.id
          WHERE e.type = 'CYCLONE'
            AND e.status IN ('ACTIF', 'SUIVI')
          GROUP BY e.id, e.name, e.status
       ),
       stale AS (
         SELECT w.id,
                w.name,
                w.status,
                w.last_seen_at,
                (SELECT MAX(t.observed_at)
                   FROM event_tracks t
                  WHERE t.event_id = w.id) AS last_observed_at
           FROM watched w
          WHERE w.last_seen_at < now() - make_interval(hours => $1::int)
       )
       UPDATE hazard_events e
          SET status = 'CLOTURE',
              ended_at = COALESCE(e.ended_at, stale.last_observed_at, stale.last_seen_at, now())
         FROM stale
        WHERE e.id = stale.id
       RETURNING e.id,
                 stale.name,
                 stale.status::text AS previous_status,
                 e.ended_at,
                 stale.last_observed_at,
                 stale.last_seen_at`,
      [staleHours],
    );

    return result.rows.map((row) => ({
      eventId: row.id,
      name: row.name ?? 'Cyclone',
      previousStatus: row.previous_status as EventStatus,
      endedAt: new Date(row.ended_at).toISOString(),
      lastObservedAt: row.last_observed_at ? new Date(row.last_observed_at).toISOString() : null,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  },

  /**
   * UPSERT en lot des points de trajectoire observés.
   *
   * S'appuie sur l'index unique partiel `uq_event_tracks_observed`
   * (event_id, observed_at) WHERE track_type = 'OBSERVEE' : rejouer le cycle met
   * à jour les points déjà connus au lieu de dupliquer la trajectoire.
   */
  async upsertObservedTrackPoints(eventId: string, points: CycloneTrackPoint[]): Promise<number> {
    if (points.length === 0) return 0;

    const result = await db.query(
      `INSERT INTO event_tracks
         (event_id, observed_at, forecast_for, track_type, latitude, longitude,
          wind_speed_kmh, pressure_hpa, movement_direction, movement_speed_kmh,
          radius_34kt_km, radius_50kt_km, radius_64kt_km,
          radius_source, radius_measure_type, geom)
       SELECT $1,
              t.observed_at, NULL, 'OBSERVEE', t.latitude, t.longitude,
              t.wind_speed_kmh, t.pressure_hpa, t.movement_direction, t.movement_speed_kmh,
              t.radius_34kt_km, t.radius_50kt_km, t.radius_64kt_km,
              t.radius_source, t.radius_measure_type,
              ST_SetSRID(ST_MakePoint(t.longitude::double precision, t.latitude::double precision), 4326)
         FROM unnest(
                $2::timestamptz[], $3::numeric[], $4::numeric[], $5::numeric[],
                $6::numeric[], $7::text[], $8::numeric[],
                $9::numeric[], $10::numeric[], $11::numeric[],
                $12::text[], $13::text[]
              ) AS t(observed_at, latitude, longitude, wind_speed_kmh, pressure_hpa,
                     movement_direction, movement_speed_kmh,
                     radius_34kt_km, radius_50kt_km, radius_64kt_km,
                     radius_source, radius_measure_type)
       ON CONFLICT (event_id, observed_at) WHERE track_type = 'OBSERVEE'
       DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         wind_speed_kmh = EXCLUDED.wind_speed_kmh,
         pressure_hpa = EXCLUDED.pressure_hpa,
         movement_direction = EXCLUDED.movement_direction,
         movement_speed_kmh = EXCLUDED.movement_speed_kmh,
         radius_34kt_km = EXCLUDED.radius_34kt_km,
         radius_50kt_km = EXCLUDED.radius_50kt_km,
         radius_64kt_km = EXCLUDED.radius_64kt_km,
         radius_source = EXCLUDED.radius_source,
         radius_measure_type = EXCLUDED.radius_measure_type,
         geom = EXCLUDED.geom`,
      [
        eventId,
        points.map((p) => p.observedAt),
        points.map((p) => p.latitude),
        points.map((p) => p.longitude),
        points.map((p) => p.windSpeedKmh),
        points.map((p) => p.pressureHpa),
        points.map((p) => p.movementDirection),
        points.map((p) => p.movementSpeedKmh),
        points.map((p) => p.radius34ktKm),
        points.map((p) => p.radius50ktKm),
        points.map((p) => p.radius64ktKm),
        points.map((p) => p.radiusSource),
        points.map((p) => p.radiusMeasureType),
      ],
    );

    return result.rowCount ?? points.length;
  },

  /**
   * Marque FAILED les cycles restés RUNNING au-delà de `olderThanHours`.
   *
   * Un processus tué en plein cycle (`tsx watch`, veille machine, crash) laisse
   * une ligne RUNNING éternelle qui fausserait l'observabilité (et l'âge du
   * dernier cycle). Appelé au démarrage du cycle suivant ; le seuil très large
   * (≫ durée réelle d'un cycle) garantit qu'on ne tue jamais un cycle en cours.
   */
  async failInterruptedRuns(olderThanHours: number): Promise<number> {
    const result = await db.query(
      `UPDATE cyclone_sync_runs
          SET finished_at = now(),
              status = 'FAILED',
              errors_count = errors_count + 1,
              error_message = COALESCE(
                error_message,
                'Cycle interrompu (processus arrêté avant la fin)'
              )
        WHERE status = 'RUNNING'
          AND started_at < now() - make_interval(hours => $1::int)`,
      [olderThanHours],
    );
    return result.rowCount ?? 0;
  },

  async startRun(trigger: string, sources: string): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO cyclone_sync_runs (trigger, sources) VALUES ($1, $2) RETURNING id`,
      [trigger, sources],
    );
    return result.rows[0].id;
  },

  async finishRun(
    id: string,
    data: {
      systemsDetected: number;
      systemsTracked: number;
      eventsCreated: number;
      eventsUpdated: number;
      trackPoints: number;
      errorsCount: number;
      errorMessage: string | null;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    const status = data.errorsCount > 0 ? (data.trackPoints > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
    await db.query(
      `UPDATE cyclone_sync_runs
          SET finished_at = now(),
              status = $2,
              systems_detected = $3,
              systems_tracked = $4,
              events_created = $5,
              events_updated = $6,
              track_points = $7,
              errors_count = $8,
              error_message = $9,
              details = $10::jsonb
        WHERE id = $1`,
      [
        id,
        status,
        data.systemsDetected,
        data.systemsTracked,
        data.eventsCreated,
        data.eventsUpdated,
        data.trackPoints,
        data.errorsCount,
        data.errorMessage,
        JSON.stringify(data.details ?? {}),
      ],
    );
  },

  async failRun(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      `UPDATE cyclone_sync_runs
          SET finished_at = now(),
              status = 'FAILED',
              errors_count = errors_count + 1,
              error_message = $2
        WHERE id = $1`,
      [id, message],
    );
  },

  async latestRun(): Promise<CycloneSyncRunInfo | null> {
    const result = await db.query<RunRow>(
      `SELECT id, started_at, finished_at, status, trigger, sources,
              systems_detected, systems_tracked, events_created, events_updated,
              track_points, errors_count, error_message
         FROM cyclone_sync_runs
        ORDER BY started_at DESC
        LIMIT 1`,
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  },
};
