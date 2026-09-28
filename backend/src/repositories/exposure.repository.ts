import { db } from '../config/database';
import {
  AreaSourceType,
  CreatedAreaResult,
  DetectionCommuneRow,
  ExposureLayerFeature,
  ExposureLayerGeoJson,
  ExposureRun,
  ExposureTrigger,
} from '../types/exposure.types';
import { RiskLevel, RiskPhase } from '../types/event.types';
import { GeoJsonGeometry } from '../types/territory.types';

interface CountRow {
  count: string;
}

interface NumericRow {
  n: string;
}

function parseIntOr(row: NumericRow | undefined, fallback = 0): number {
  return row && row.n !== null ? parseInt(row.n, 10) : fallback;
}

interface AreaInsertRow {
  id: string | null;
  created: boolean;
}

export const exposureRepository = {
  async upsertDetectionCommunes(eventId: string, rows: DetectionCommuneRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const placeholders: string[] = [];
    const values: unknown[] = [eventId];
    let idx = 2;
    for (const r of rows) {
      placeholders.push(`($1, $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
      values.push(r.communeId, r.metric ?? null, r.value ?? null, r.threshold ?? null);
      idx += 4;
    }

    const result = await db.query<NumericRow>(
      `INSERT INTO event_detection_communes (event_id, commune_id, metric, value, threshold)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (event_id, commune_id)
       DO UPDATE SET metric = EXCLUDED.metric,
                     value = EXCLUDED.value,
                     threshold = EXCLUDED.threshold,
                     recorded_at = now()
       RETURNING id`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async listDetectionCommunes(eventId: string): Promise<DetectionCommuneRow[]> {
    const result = await db.query<{
      commune_id: string;
      metric: string | null;
      value: string | null;
      threshold: string | null;
    }>(
      `SELECT commune_id, metric, value::text AS value, threshold::text AS threshold
       FROM event_detection_communes
       WHERE event_id = $1
       ORDER BY commune_id`,
      [eventId],
    );
    return result.rows.map((r) => ({
      communeId: r.commune_id,
      metric: r.metric,
      value: r.value !== null ? parseFloat(r.value) : null,
      threshold: r.threshold !== null ? parseFloat(r.threshold) : null,
    }));
  },

  async trackPointCount(eventId: string): Promise<number> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM event_tracks WHERE event_id = $1`,
      [eventId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },

  /** Zone estimée : tampon autour de l'union des communes au-dessus du seuil. */
  async estimationZoneGeometry(
    communeIds: string[],
    radiusKm: number,
  ): Promise<GeoJsonGeometry | null> {
    if (communeIds.length === 0) return null;
    const result = await db.query<{ geometry: unknown }>(
      `WITH target AS (
         SELECT ST_Union(c.geom) AS u
         FROM communes c
         WHERE c.id = ANY($1::uuid[]) AND c.geom IS NOT NULL
       )
       SELECT ST_AsGeoJSON(
         ST_SetSRID(
           ST_Multi(ST_Buffer(u::geography, $2::double precision * 1000)::geometry),
           4326)
       )::jsonb AS geometry
       FROM target
       WHERE u IS NOT NULL`,
      [communeIds, radiusKm],
    );
    return result.rows[0] ? (result.rows[0].geometry as GeoJsonGeometry) : null;
  },

  /** Zone autour de la trajectoire officielle (≥ 2 points réels). */
  async trajectoryZoneGeometry(eventId: string, radiusKm: number): Promise<GeoJsonGeometry | null> {
    const result = await db.query<{ geometry: unknown }>(
      `SELECT ST_AsGeoJSON(
         ST_SetSRID(
           ST_Multi(ST_Buffer(line::geography, $2::double precision * 1000)::geometry),
           4326)
       )::jsonb AS geometry
       FROM (
         SELECT ST_MakeLine(geom ORDER BY observed_at) AS line
         FROM event_tracks
         WHERE event_id = $1
         HAVING COUNT(*) >= 2
       ) t`,
      [eventId, radiusKm],
    );
    return result.rows[0] ? (result.rows[0].geometry as GeoJsonGeometry) : null;
  },

  async activeEventIds(): Promise<string[]> {
    const result = await db.query<{ id: string }>(
      `SELECT id
       FROM hazard_events
       WHERE status IN ('PREVISION', 'ACTIF', 'SUIVI')
         AND EXISTS (SELECT 1 FROM event_detection_communes dc WHERE dc.event_id = hazard_events.id)
       ORDER BY created_at`,
    );
    return result.rows.map((r) => r.id);
  },

  /**
   * Crée (ou recycle si géométrie identique) une zone d'influence automatique.
   * Idempotent : si une zone de même source existe déjà avec la même géométrie,
   * aucune ligne n'est insérée (l'historique des anciennes zones est conservé).
   */
  async createOrRefreshArea(data: {
    eventId: string;
    phase: RiskPhase;
    riskLevel: RiskLevel;
    radiusKm: number;
    sourceType: AreaSourceType;
    isEstimate: boolean;
    description: string;
    geometry: GeoJsonGeometry;
  }): Promise<CreatedAreaResult> {
    const result = await db.query<AreaInsertRow>(
      `WITH candidate AS (
         SELECT ST_SetSRID(ST_GeomFromGeoJSON($5::jsonb), 4326) AS g
       ),
       same AS (
         SELECT 1
         FROM event_areas a, candidate c
         WHERE a.event_id = $1
           AND a.source_type = $6
           AND a.is_estimate = $7
           AND ST_Equals(a.geom, c.g)
         LIMIT 1
       ),
       ins AS (
         INSERT INTO event_areas
           (event_id, phase, risk_level, radius_km, source, source_type,
            is_estimate, description, geom)
         SELECT $1, $2::risk_phase, $3::risk_level, $4, $6, $6, $7, $8, g
         FROM candidate
         WHERE NOT EXISTS (SELECT 1 FROM same)
         RETURNING id
       )
       SELECT
         (SELECT id FROM ins) AS id,
         EXISTS (SELECT 1 FROM ins) AS created`,
      [
        data.eventId,
        data.phase,
        data.riskLevel,
        data.radiusKm,
        JSON.stringify(data.geometry),
        data.sourceType,
        data.isEstimate,
        data.description,
      ],
    );
    const r = result.rows[0];
    return { id: r?.id ?? null, created: r?.created ?? false };
  },

  /**
   * Recalcule les communes exposées d'un événement à partir de l'union de ses
   * zones d'influence. Upsert (une ligne max par commune) + purge des communes
   * qui n'intersectent plus aucune zone.
   */
  async computeExposure(eventId: string): Promise<{
    communesUpserted: number;
    communesExposed: number;
  }> {
    const result = await db.query<{
      communes_upserted: string;
      communes_exposed: string;
    }>(
      `WITH track AS (
         SELECT ST_MakeLine(geom ORDER BY observed_at) AS line
         FROM event_tracks
         WHERE event_id = $1
         HAVING COUNT(*) >= 2
       ),
       mask AS (
         SELECT ST_Union(a.geom) AS geom
         FROM event_areas a
         WHERE a.event_id = $1
       ),
       meta AS (
         SELECT DISTINCT ON (c.id)
           c.id AS commune_id,
           c.population,
           CASE WHEN t.line IS NOT NULL
             THEN (ST_Distance(c.centroid::geography, t.line::geography) / 1000)::numeric(12,2)
             ELSE NULL
           END AS distance_km,
           CASE WHEN m.geom IS NOT NULL AND c.geom IS NOT NULL
             THEN ROUND(
               ((ST_Area(ST_Intersection(c.geom, m.geom)::geography) /
                NULLIF(ST_Area(c.geom::geography), 0)) * 100)::numeric,
               2)
             ELSE 0
           END AS overlap_pct,
           EXISTS (
             SELECT 1 FROM event_areas a
             WHERE a.event_id = $1 AND a.is_estimate = false
               AND ST_Intersects(c.geom, a.geom)
           ) AS has_real_area,
           EXISTS (
             SELECT 1 FROM event_detection_communes dc
             WHERE dc.event_id = $1 AND dc.commune_id = c.id
           ) AS is_seuil
         FROM communes c
         JOIN mask m ON m.geom IS NOT NULL AND ST_Intersects(c.geom, m.geom)
         LEFT JOIN track t ON true
         WHERE c.geom IS NOT NULL
         ORDER BY c.id
       ),
       upsert AS (
         INSERT INTO exposed_communes
           (event_id, commune_id, distance_to_track_km, is_inside_influence_area,
            exposed_population, source_type, data_type, overlap_percent)
         SELECT
           $1,
           meta.commune_id,
           meta.distance_km,
           true,
           meta.population,
           CASE WHEN meta.is_seuil THEN 'SEUIL' ELSE 'ZONE' END,
           CASE WHEN meta.has_real_area THEN 'REEL' ELSE 'ESTIME' END,
           meta.overlap_pct
         FROM meta
         ON CONFLICT (event_id, commune_id)
         DO UPDATE SET
           distance_to_track_km = EXCLUDED.distance_to_track_km,
           is_inside_influence_area = EXCLUDED.is_inside_influence_area,
           exposed_population = EXCLUDED.exposed_population,
           source_type = EXCLUDED.source_type,
           data_type = EXCLUDED.data_type,
           overlap_percent = EXCLUDED.overlap_percent,
           updated_at = now()
         RETURNING id
       ),
       cleanup AS (
         DELETE FROM exposed_communes ec
         USING communes c
         WHERE ec.event_id = $1
           AND ec.commune_id = c.id
           AND c.geom IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM event_areas a
             WHERE a.event_id = $1
               AND ST_Intersects(c.geom, a.geom)
           )
       )
       SELECT
         (SELECT COUNT(*)::text FROM upsert) AS "communes_upserted",
         (SELECT COUNT(*)::text FROM upsert) AS "communes_exposed"`,
      [eventId],
    );
    const r = result.rows[0];
    return {
      communesUpserted: parseInt(r?.communes_upserted ?? '0', 10),
      communesExposed: parseInt(r?.communes_exposed ?? '0', 10),
    };
  },

  async exposureLayer(eventId: string): Promise<ExposureLayerGeoJson> {
    const result = await db.query<{
      props: ExposureLayerFeature['properties'];
      geometry: unknown;
    }>(
      `SELECT
         jsonb_build_object(
           'communeId', c.id,
           'communeCode', c.admin_code,
           'communeName', c.name,
           'districtName', d.name,
           'population', c.population,
           'exposedPopulation', ec.exposed_population,
           'overlapPercent', ec.overlap_percent,
           'distanceToTrackKm', ec.distance_to_track_km,
           'sourceType', ec.source_type,
           'dataType', ec.data_type,
           'riskLevel', latest_risk.risk_level,
           'riskScore', latest_risk.risk_score,
           'updatedAt', ec.updated_at
         ) AS props,
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geom, 0.005))::jsonb AS geometry
       FROM exposed_communes ec
       JOIN communes c ON c.id = ec.commune_id
       LEFT JOIN districts d ON d.id = c.district_id
       LEFT JOIN LATERAL (
         SELECT ra.risk_level, ra.risk_score
         FROM risk_assessments ra
         WHERE ra.commune_id = ec.commune_id AND ra.event_id = ec.event_id
         ORDER BY ra.assessed_at DESC
         LIMIT 1
       ) latest_risk ON true
       WHERE ec.event_id = $1
       ORDER BY d.name, c.name`,
      [eventId],
    );
    return {
      type: 'FeatureCollection',
      features: result.rows.map((r) => ({
        type: 'Feature' as const,
        id: r.props.communeId,
        geometry: r.geometry as GeoJsonGeometry,
        properties: r.props,
      })),
    };
  },

  async createExposureRun(eventId: string, trigger: ExposureTrigger): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO event_exposure_runs (event_id, trigger)
       VALUES ($1, $2)
       RETURNING id`,
      [eventId, trigger],
    );
    return result.rows[0].id;
  },

  async finishExposureRun(
    runId: string,
    data: { areasCreated: number; communesUpserted: number },
  ): Promise<void> {
    await db.query(
      `UPDATE event_exposure_runs
       SET areas_created = $2,
           communes_upserted = $3,
           finished_at = now()
       WHERE id = $1`,
      [runId, data.areasCreated, data.communesUpserted],
    );
  },

  async listExposureRuns(eventId: string): Promise<ExposureRun[]> {
    const result = await db.query<{
      id: string;
      event_id: string;
      trigger: string;
      areas_created: string;
      communes_upserted: string;
      started_at: string;
      finished_at: string | null;
    }>(
      `SELECT id, event_id, trigger, areas_created::text AS areas_created,
              communes_upserted::text AS communes_upserted,
              started_at, finished_at
       FROM event_exposure_runs
       WHERE event_id = $1
       ORDER BY started_at DESC`,
      [eventId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      trigger: r.trigger as ExposureTrigger,
      areasCreated: parseIntOr({ n: r.areas_created }),
      communesUpserted: parseIntOr({ n: r.communes_upserted }),
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }));
  },
};
