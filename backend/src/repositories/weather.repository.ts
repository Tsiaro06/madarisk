import { db } from '../config/database';
import { WeatherMapGeoJson, WeatherMapPoint, WeatherObservation } from '../types/weather.types';
import { PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

export interface WeatherInsertData {
  communeId: string;
  eventId: string | null;
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  rawData: unknown;
}

export interface TargetCommune {
  id: string;
  longitude: number;
  latitude: number;
}

export interface TargetCommunesQuery {
  communeIds?: string[];
  districtId?: string;
  eventId?: string;
}

interface ObservationRow {
  id: string;
  commune_id: string | null;
  event_id: string | null;
  observed_at: string;
  latitude: string;
  longitude: string;
  temperature_c: string | null;
  humidity_percent: string | null;
  precipitation_mm: string | null;
  rainfall_24h_mm: string | null;
  wind_speed_kmh: string | null;
  wind_direction_deg: string | null;
  pressure_hpa: string | null;
  weather_code: string | null;
  created_at: string;
}

function mapObservation(row: ObservationRow): WeatherObservation {
  return {
    id: row.id,
    communeId: row.commune_id,
    eventId: row.event_id,
    observedAt: row.observed_at,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    temperatureC: row.temperature_c !== null ? parseFloat(row.temperature_c) : null,
    humidityPercent: row.humidity_percent !== null ? parseFloat(row.humidity_percent) : null,
    precipitationMm: row.precipitation_mm !== null ? parseFloat(row.precipitation_mm) : null,
    rainfall24hMm: row.rainfall_24h_mm !== null ? parseFloat(row.rainfall_24h_mm) : null,
    windSpeedKmh: row.wind_speed_kmh !== null ? parseFloat(row.wind_speed_kmh) : null,
    windDirectionDeg: row.wind_direction_deg !== null ? parseFloat(row.wind_direction_deg) : null,
    pressureHpa: row.pressure_hpa !== null ? parseFloat(row.pressure_hpa) : null,
    weatherCode: row.weather_code,
    createdAt: row.created_at,
  };
}

const OBSERVATION_COLUMNS = `
  w.id,
  w.commune_id,
  w.event_id,
  w.observed_at,
  w.latitude,
  w.longitude,
  w.temperature_c,
  w.humidity_percent,
  w.precipitation_mm,
  w.rainfall_24h_mm,
  w.wind_speed_kmh,
  w.wind_direction_deg,
  w.pressure_hpa,
  w.weather_code,
  w.created_at
`;

export const weatherRepository = {
  async verifyCommuneExists(communeId: string): Promise<boolean> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM communes WHERE id = $1`,
      [communeId],
    );
    return parseCount(result.rows[0]) > 0;
  },

  async getSourceId(): Promise<string> {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM weather_sources WHERE provider_type = 'OPEN_METEO' ORDER BY created_at ASC LIMIT 1`,
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await db.query<{ id: string }>(
      `INSERT INTO weather_sources (name, provider_type, base_url, refresh_interval_minutes, is_active)
       VALUES ('Open-Meteo', 'OPEN_METEO', $1, 60, true)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      ['https://api.open-meteo.com'],
    );
    if (created.rows[0]) return created.rows[0].id;

    const retry = await db.query<{ id: string }>(
      `SELECT id FROM weather_sources WHERE provider_type = 'OPEN_METEO' ORDER BY created_at ASC LIMIT 1`,
    );
    if (!retry.rows[0]) {
      throw new Error('Impossible de récupérer la source météo Open-Meteo');
    }
    return retry.rows[0].id;
  },

  async getCommuneCoordinates(communeId: string): Promise<{
    latitude: number;
    longitude: number;
  } | null> {
    const result = await db.query<{ longitude: string; latitude: string }>(
      `SELECT ST_X(c.centroid)::text AS longitude, ST_Y(c.centroid)::text AS latitude
       FROM communes c
       WHERE c.id = $1`,
      [communeId],
    );
    const row = result.rows[0];
    return row
      ? { latitude: parseFloat(row.latitude), longitude: parseFloat(row.longitude) }
      : null;
  },

  async targetCommunes(query: TargetCommunesQuery): Promise<TargetCommune[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.communeIds?.length) {
      conditions.push(`c.id = ANY($${idx++}::uuid[])`);
      values.push(query.communeIds);
    }
    if (query.districtId) {
      conditions.push(`c.district_id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.eventId) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM exposed_communes ec
           WHERE ec.commune_id = c.id AND ec.event_id = $${idx++}
         )`,
      );
      values.push(query.eventId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query<{ id: string; longitude: string; latitude: string }>(
      `SELECT
         c.id,
         ST_X(c.centroid)::text AS longitude,
         ST_Y(c.centroid)::text AS latitude
       FROM communes c
       ${where}
       ORDER BY c.name`,
      values,
    );
    return result.rows.map((r) => ({
      id: r.id,
      longitude: parseFloat(r.longitude),
      latitude: parseFloat(r.latitude),
    }));
  },

  async insertObservations(rows: WeatherInsertData[], sourceId: string): Promise<number> {
    if (rows.length === 0) return 0;

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const r of rows) {
      const n = idx;
      placeholders.push(
        `($${n}, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}` +
          `, $${n + 8}, $${n + 9}, $${n + 10}, $${n + 11}, $${n + 12}, $${n + 13}, $${n + 14}` +
          `, ST_SetSRID(ST_MakePoint($${n + 5}::numeric, $${n + 4}::numeric), 4326))`,
      );
      values.push(
        sourceId,
        r.communeId,
        r.eventId,
        r.observedAt,
        r.latitude,
        r.longitude,
        r.precipitationMm,
        r.rainfall24hMm,
        r.temperatureC,
        r.humidityPercent,
        r.windSpeedKmh,
        r.windDirectionDeg,
        r.pressureHpa,
        r.weatherCode,
        JSON.stringify(r.rawData),
      );
      idx += 15;
    }

    const result = await db.query(
      `INSERT INTO weather_observations
         (weather_source_id, commune_id, event_id, observed_at, latitude, longitude,
          precipitation_mm, rainfall_24h_mm, temperature_c, humidity_percent,
          wind_speed_kmh, wind_direction_deg, pressure_hpa, weather_code, raw_data, geom)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async findLatest(communeId: string): Promise<WeatherObservation | null> {
    const result = await db.query<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS}
       FROM weather_observations w
       WHERE w.commune_id = $1
       ORDER BY w.observed_at DESC
       LIMIT 1`,
      [communeId],
    );
    return result.rows[0] ? mapObservation(result.rows[0]) : null;
  },

  async history(
    communeId: string,
    query: { dateFrom?: Date; dateTo?: Date; page: number; limit: number },
  ): Promise<PaginatedResult<WeatherObservation>> {
    const conditions: string[] = ['w.commune_id = $1'];
    const values: unknown[] = [communeId];
    let idx = 2;

    if (query.dateFrom) {
      conditions.push(`w.observed_at >= $${idx++}`);
      values.push(query.dateFrom.toISOString());
    }
    if (query.dateTo) {
      conditions.push(`w.observed_at <= $${idx++}`);
      values.push(query.dateTo.toISOString());
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM weather_observations w
       WHERE ${where}`,
      values,
    );
    const total = parseCount(countResult.rows[0]);

    const offset = (query.page - 1) * query.limit;
    const pageResult = await db.query<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS}
       FROM weather_observations w
       WHERE ${where}
       ORDER BY w.observed_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, query.limit, offset],
    );

    return {
      items: pageResult.rows.map(mapObservation),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async mapPoints(query: {
    districtId?: string;
    eventId?: string;
    observedAt?: Date;
  }): Promise<WeatherMapGeoJson> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (query.districtId) {
      conditions.push(`d.id = $${idx++}`);
      values.push(query.districtId);
    }
    if (query.eventId) {
      conditions.push(`w.event_id = $${idx++}`);
      values.push(query.eventId);
    }
    if (query.observedAt) {
      conditions.push(`w.observed_at <= $${idx++}`);
      values.push(query.observedAt.toISOString());
    }

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const result = await db.query<WeatherMapPoint>(
      `SELECT DISTINCT ON (w.commune_id)
         c.id AS "communeId",
         c.name AS "communeName",
         d.id AS "districtId",
         d.name AS "districtName",
         w.longitude::float AS longitude,
         w.latitude::float AS latitude,
         w.observed_at AS "observedAt",
         w.temperature_c::float AS "temperatureC",
         w.humidity_percent::float AS "humidityPercent",
         w.wind_speed_kmh::float AS "windSpeedKmh",
         w.wind_direction_deg::float AS "windDirectionDeg",
         w.precipitation_mm::float AS "precipitationMm",
         w.rainfall_24h_mm::float AS "rainfall24hMm",
         w.pressure_hpa::float AS "pressureHpa",
         w.weather_code AS "weatherCode"
       FROM weather_observations w
       JOIN communes c ON c.id = w.commune_id
       JOIN districts d ON d.id = c.district_id
       WHERE w.commune_id IS NOT NULL ${where}
       ORDER BY w.commune_id, w.observed_at DESC`,
      values,
    );

    return {
      type: 'FeatureCollection',
      features: result.rows.map((r) => ({
        type: 'Feature',
        id: r.communeId,
        geometry: {
          type: 'Point',
          coordinates: [r.longitude, r.latitude],
        },
        properties: r,
      })),
    };
  },
};
