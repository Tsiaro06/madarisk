import { db } from '../config/database';
import { env } from '../config/env';
import {
  CommuneInfo,
  WeatherMapGeoJson,
  WeatherMapPoint,
  WeatherObservation,
} from '../types/weather.types';
import { PaginatedResult } from '../types/territory.types';

interface CountRow {
  count: string;
}

function parseCount(row: CountRow | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

async function getOrCreateSource(
  providerType: string,
  name: string,
  baseUrl: string,
): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM weather_sources WHERE provider_type = $1 ORDER BY created_at ASC LIMIT 1`,
    [providerType],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await db.query<{ id: string }>(
    `INSERT INTO weather_sources (name, provider_type, base_url, refresh_interval_minutes, is_active)
     VALUES ($1, $2, $3, 60, true)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [name, providerType, baseUrl],
  );
  if (created.rows[0]) return created.rows[0].id;

  const retry = await db.query<{ id: string }>(
    `SELECT id FROM weather_sources WHERE provider_type = $1 ORDER BY created_at ASC LIMIT 1`,
    [providerType],
  );
  if (!retry.rows[0]) {
    throw new Error(`Impossible de récupérer la source météo ${name}`);
  }
  return retry.rows[0].id;
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
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  rawData: unknown;
}

export interface WeatherForecastInsertData {
  communeId: string;
  forecastDay: string;
  generatedAt: string;
  latitude: number;
  longitude: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  relativeHumidityAvg: number | null;
  precipitationSumMm: number | null;
  windSpeedMaxKmh: number | null;
  windGustsMaxKmh: number | null;
  windDirectionDeg: number | null;
  pressureAvgHpa: number | null;
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
  wind_gusts_kmh: string | null;
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
    windGustsKmh: row.wind_gusts_kmh !== null ? parseFloat(row.wind_gusts_kmh) : null,
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
  w.wind_gusts_kmh,
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
    return getOrCreateSource('OPEN_METEO', 'Open-Meteo', 'https://api.open-meteo.com');
  },

  async getDgmSourceId(): Promise<string> {
    return getOrCreateSource(
      'DGM_MAPROOM',
      'Météo Madagascar — Maproom DGM',
      env.DGM_MAPROOM_BASE_URL,
    );
  },

  async existingCommunesForDate(sourceId: string, date: Date): Promise<Set<string>> {
    const result = await db.query<{ commune_id: string }>(
      `SELECT DISTINCT w.commune_id
       FROM weather_observations w
       WHERE w.weather_source_id = $1 AND w.observed_at::date = $2::date AND w.commune_id IS NOT NULL`,
      [sourceId, date.toISOString()],
    );
    return new Set(result.rows.map((r) => r.commune_id));
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

  async allCommunesInfo(): Promise<CommuneInfo[]> {
    const result = await db.query<CommuneInfo>(
      `SELECT
         c.id,
         c.name,
         d.id AS "districtId",
         d.name AS "districtName",
         ST_Y(c.centroid)::float AS latitude,
         ST_X(c.centroid)::float AS longitude
       FROM communes c
       JOIN districts d ON d.id = c.district_id
       ORDER BY c.name`,
    );
    return result.rows;
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
          `, $${n + 15}, $${n + 16}` +
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
        r.windGustsKmh,
        r.windDirectionDeg,
        r.pressureHpa,
        r.weatherCode,
        'OBSERVE',
        JSON.stringify(r.rawData),
      );
      idx += 17;
    }

    const result = await db.query(
      `INSERT INTO weather_observations
         (weather_source_id, commune_id, event_id, observed_at, latitude, longitude,
          precipitation_mm, rainfall_24h_mm, temperature_c, humidity_percent,
          wind_speed_kmh, wind_gusts_kmh, wind_direction_deg, pressure_hpa, weather_code,
          data_kind, raw_data, geom)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT DO NOTHING`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async existingObservationKeys(
    sourceId: string,
    keys: { communeId: string; observedAt: string }[],
  ): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const result = await db.query<{ commune_id: string; observed_at: string }>(
      `SELECT w.commune_id, to_char(w.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS observed_at
       FROM weather_observations w
       WHERE w.weather_source_id = $1
         AND w.commune_id = ANY($2::uuid[])
         AND w.observed_at = ANY($3::timestamptz[])`,
      [sourceId, keys.map((k) => k.communeId), keys.map((k) => k.observedAt)],
    );
    return new Set(result.rows.map((r) => `${r.commune_id}|${r.observed_at}`));
  },

  async insertForecasts(rows: WeatherForecastInsertData[], sourceId: string): Promise<number> {
    if (rows.length === 0) return 0;

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const r of rows) {
      const n = idx;
      placeholders.push(
        `($${n}, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}` +
          `, $${n + 8}, $${n + 9}, $${n + 10}, $${n + 11}, $${n + 12}, $${n + 13}, $${n + 14}` +
          `, $${n + 15}, $${n + 16})`,
      );
      values.push(
        sourceId,
        r.communeId,
        r.forecastDay,
        r.generatedAt,
        r.latitude,
        r.longitude,
        r.temperatureMinC,
        r.temperatureMaxC,
        r.relativeHumidityAvg,
        r.precipitationSumMm,
        r.windSpeedMaxKmh,
        r.windGustsMaxKmh,
        r.windDirectionDeg,
        r.pressureAvgHpa,
        r.weatherCode,
        'PREVU',
        JSON.stringify(r.rawData),
      );
      idx += 17;
    }

    const result = await db.query(
      `INSERT INTO weather_forecasts
         (weather_source_id, commune_id, forecast_day, generated_at, latitude, longitude,
          temperature_min_c, temperature_max_c, relative_humidity_avg, precipitation_sum_mm,
          wind_speed_max_kmh, wind_gusts_max_kmh, wind_direction_deg, pressure_avg_hpa,
          weather_code, data_kind, raw_data)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT DO NOTHING`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async existingForecastKeys(
    sourceId: string,
    keys: { communeId: string; forecastDay: string }[],
  ): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const result = await db.query<{ commune_id: string; forecast_day: string }>(
      `SELECT f.commune_id, f.forecast_day::text
       FROM weather_forecasts f
       WHERE f.weather_source_id = $1
         AND f.commune_id = ANY($2::uuid[])
         AND f.forecast_day = ANY($3::date[])`,
      [sourceId, keys.map((k) => k.communeId), keys.map((k) => k.forecastDay)],
    );
    return new Set(result.rows.map((r) => `${r.commune_id}|${r.forecast_day}`));
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

  async latestObservationAt(): Promise<string | null> {
    const result = await db.query<{ max: string | null }>(
      `SELECT MAX(observed_at)::text AS max FROM weather_observations`,
    );
    return result.rows[0]?.max ?? null;
  },

  async weatherSources(): Promise<
    {
      name: string;
      providerType: string;
      baseUrl: string | null;
      isActive: boolean;
      refreshIntervalMinutes: number;
    }[]
  > {
    const result = await db.query<{
      name: string;
      provider_type: string;
      base_url: string | null;
      is_active: boolean;
      refresh_interval_minutes: string;
    }>(
      `SELECT name, provider_type, base_url, is_active, refresh_interval_minutes
       FROM weather_sources
       ORDER BY name`,
    );
    return result.rows.map((r) => ({
      name: r.name,
      providerType: r.provider_type,
      baseUrl: r.base_url,
      isActive: r.is_active,
      refreshIntervalMinutes: parseInt(r.refresh_interval_minutes, 10),
    }));
  },

  async latestObservationAtForSource(sourceId: string): Promise<string | null> {
    const result = await db.query<{ max: string | null }>(
      `SELECT MAX(w.observed_at)::text AS max
       FROM weather_observations w
       WHERE w.weather_source_id = $1`,
      [sourceId],
    );
    return result.rows[0]?.max ?? null;
  },

  async observationCommuneCoverage(sourceId: string): Promise<number> {
    const result = await db.query<CountRow>(
      `SELECT COUNT(DISTINCT w.commune_id)::text AS count
       FROM weather_observations w
       WHERE w.weather_source_id = $1
         AND w.commune_id IS NOT NULL
         AND w.observed_at >= now() - interval '26 hours'`,
      [sourceId],
    );
    return parseCount(result.rows[0]);
  },

  async forecastDataInfo(sourceId: string): Promise<{
    lastGeneratedAt: string | null;
    maxForecastDay: string | null;
    communesData: number;
  }> {
    const result = await db.query<{
      last_generated_at: string | null;
      max_day: string | null;
      communes: string;
    }>(
      `SELECT MAX(f.generated_at)::text AS last_generated_at,
              MAX(f.forecast_day)::text AS max_day,
              COUNT(DISTINCT f.commune_id)::text AS communes
       FROM weather_forecasts f
       WHERE f.weather_source_id = $1`,
      [sourceId],
    );
    const row = result.rows[0];
    return {
      lastGeneratedAt: row.last_generated_at ?? null,
      maxForecastDay: row.max_day ?? null,
      communesData: parseInt(row.communes ?? '0', 10),
    };
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
