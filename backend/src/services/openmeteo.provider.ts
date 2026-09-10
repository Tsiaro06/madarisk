import axios, { AxiosError, AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  WeatherCurrent,
  WeatherForecast,
  WeatherMapPoint,
  WeatherProvider,
} from '../types/weather.types';
import { AppError } from '../utils/app-error';

interface OpenMeteoCurrentResponse {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  rain: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  surface_pressure: number | null;
  weather_code: number | null;
  time: string;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: OpenMeteoCurrentResponse;
  current_units?: Record<string, string>;
  daily?: {
    time: string[];
    precipitation_sum: (number | null)[];
  };
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation: (number | null)[];
    rain: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    surface_pressure: (number | null)[];
    weather_code: (number | null)[];
  };
}

const CURRENT_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'rain',
  'wind_speed_10m',
  'wind_direction_10m',
  'surface_pressure',
  'weather_code',
].join(',');

const HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'rain',
  'wind_speed_10m',
  'wind_direction_10m',
  'surface_pressure',
  'weather_code',
].join(',');

const FORECAST_CACHE_TTL_MS = 10 * 60 * 1000;

interface ForecastCacheEntry {
  expiresAt: number;
  data: WeatherForecast;
}

function toApiError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError;
    logger.warn(
      { url: axiosErr.config?.url, status: axiosErr.response?.status },
      'Échec du fournisseur météo Open-Meteo',
    );
    const status = axiosErr.response?.status;
    if (status && status >= 400 && status < 500) {
      return new AppError(
        `Le fournisseur météo Open-Meteo a retourné une erreur HTTP ${status}`,
        status === 429 ? 429 : 422,
        true,
      );
    }
    return new AppError('Fournisseur météo Open-Meteo indisponible', 502, true);
  }

  logger.warn({ err }, 'Erreur réseau inattendue avec Open-Meteo');
  return new AppError('Erreur réseau lors de la récupération des données météo', 502, true);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RATE_LIMIT_RESET_MS = 60 * 60 * 1000;

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
      await sleep(150);
    }
  });
  await Promise.all(workers);
}

export class OpenMeteoProvider implements WeatherProvider {
  private readonly client: AxiosInstance;
  private readonly maxRetries = 2;
  private readonly batchMaxRetries = 3;
  private rateLimitedUntil = 0;
  private readonly forecastCache = new Map<string, ForecastCacheEntry>();
  private readonly batchForecastCache = new Map<
    string,
    { expiresAt: number; points: WeatherMapPoint[] }
  >();
  private readonly batchCacheKey = (date: string, hour?: number): string =>
    `${date}:${hour ?? 'day'}`;

  constructor() {
    this.client = axios.create({
      baseURL: env.OPEN_METEO_BASE_URL,
      timeout: env.OPEN_METEO_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
  }

  private getCacheKey(latitude: number, longitude: number): string {
    return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  }

  private async request<T>(
    params: Record<string, unknown>,
    retries: number = this.maxRetries,
  ): Promise<T> {
    if (Date.now() < this.rateLimitedUntil) {
      logger.warn(
        { until: new Date(this.rateLimitedUntil).toISOString() },
        'Open-Meteo : circuit couvert activé, requête court-circuitée',
      );
      throw AppError.tooManyRequests(
        'Limite de requêtes Open-Meteo atteinte. Réessayez dans environ une heure.',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.client.get<T>('/v1/forecast', { params });
        return response.data;
      } catch (err) {
        lastError = err;
        const axiosErr = axios.isAxiosError(err) ? err : null;
        const status = axiosErr?.response?.status;
        if (status === 429) {
          const reason = String(
            (axiosErr?.response?.data as { reason?: unknown } | undefined)
              ?.reason ?? '',
          ).toLowerCase();
          const hourlyLimit = reason.includes('hour') || reason.includes('next hour');
          if (hourlyLimit) {
            const retryAfter = Number(axiosErr?.response?.headers?.['retry-after']);
            const waitMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : RATE_LIMIT_RESET_MS;
            this.rateLimitedUntil = Date.now() + Math.max(waitMs, 60 * 1000);
            logger.warn(
              { until: new Date(this.rateLimitedUntil).toISOString() },
              'Open-Meteo : limite horaire atteinte, circuit couvert activé',
            );
            break;
          }
          logger.warn(
            { reason },
            'Open-Meteo : limite de rafale atteinte, patientage puis nouvelle tentative',
          );
          if (attempt >= retries) break;
          const burstBackoff = [3000, 10000, 25000][attempt] ?? 30000;
          await sleep(burstBackoff);
          continue;
        }
        const retriable =
          status === undefined || (status !== undefined && status >= 500);
        logger.debug({ attempt: attempt + 1, status }, 'Tentative Open-Meteo échouée');
        if (!retriable || attempt >= retries) break;
        await sleep(500 * (attempt + 1) ** 2);
      }
    }
    throw toApiError(lastError);
  }

  private mapCurrent(current: OpenMeteoCurrentResponse): WeatherCurrent {
    return {
      observedAt: current.time,
      temperatureC: current.temperature_2m,
      humidityPercent: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      rainfall24hMm: null,
      windSpeedKmh: current.wind_speed_10m,
      windDirectionDeg: current.wind_direction_10m,
      pressureHpa: current.surface_pressure,
      weatherCode: current.weather_code !== null ? String(current.weather_code) : null,
    };
  }

  async getCurrent(latitude: number, longitude: number): Promise<WeatherCurrent> {
    const data = await this.request<OpenMeteoResponse>({
      latitude,
      longitude,
      current: CURRENT_VARIABLES,
      daily: 'precipitation_sum',
      timezone: 'auto',
      forecast_days: 2,
    });

    const current = data.current;
    const rainfall24hMm = data.daily?.precipitation_sum?.[0] ?? null;

    logger.debug({ latitude, longitude, rainfall24hMm }, 'Données météo actuelles récupérées');

    return { ...this.mapCurrent(current), rainfall24hMm };
  }

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
    const cacheKey = this.getCacheKey(latitude, longitude);
    const cached = this.forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await this.request<OpenMeteoResponse>({
      latitude,
      longitude,
      current: CURRENT_VARIABLES,
      hourly: HOURLY_VARIABLES,
      forecast_days: 3,
      timezone: 'auto',
    });

    const forecast: WeatherForecast = {
      generatedAt: new Date().toISOString(),
      timezone: data.timezone,
      latitude: data.latitude,
      longitude: data.longitude,
      current: this.mapCurrent(data.current),
      hourly: {
        time: data.hourly?.time ?? [],
        temperatureC: data.hourly?.temperature_2m ?? [],
        humidityPercent: data.hourly?.relative_humidity_2m ?? [],
        precipitationMm: data.hourly?.precipitation ?? [],
        rainMm: data.hourly?.rain ?? [],
        windSpeedKmh: data.hourly?.wind_speed_10m ?? [],
        windDirectionDeg: data.hourly?.wind_direction_10m ?? [],
        surfacePressureHpa: data.hourly?.surface_pressure ?? [],
        weatherCode: data.hourly?.weather_code ?? [],
      },
    };

    this.forecastCache.set(cacheKey, {
      expiresAt: Date.now() + FORECAST_CACHE_TTL_MS,
      data: forecast,
    });

    logger.debug({ latitude, longitude }, 'Prévisions météo mises en cache');

    return forecast;
  }

  async getForecastBatch(
    communes: { id: string; latitude: number; longitude: number }[],
    date: string,
    hour?: number,
  ): Promise<WeatherMapPoint[]> {
    const cacheKey = this.batchCacheKey(date, hour);
    const cached = this.batchForecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.points;
    }

    const BATCH_SIZE = 400;
    const PARTIAL_CACHE_TTL_MS = 60 * 1000;

    const chunks: { id: string; latitude: number; longitude: number }[][] = [];
    for (let i = 0; i < communes.length; i += BATCH_SIZE) {
      chunks.push(communes.slice(i, i + BATCH_SIZE));
    }

    const results: WeatherMapPoint[] = [];
    const fetchChunk = async (
      chunk: { id: string; latitude: number; longitude: number }[],
    ): Promise<boolean> => {
      try {
        const lats = chunk.map((c) => c.latitude.toFixed(3));
        const lons = chunk.map((c) => c.longitude.toFixed(3));

        const data = await this.request<OpenMeteoResponse | OpenMeteoResponse[]>(
          {
            latitude: lats.join(','),
            longitude: lons.join(','),
            hourly: HOURLY_VARIABLES,
            daily: 'precipitation_sum',
            timezone: 'auto',
            forecast_days: 4,
          },
          this.batchMaxRetries,
        );

        const responses = Array.isArray(data) ? data : [data];

        const points = responses.flatMap((resp, idx) => {
          const commune = chunk[idx];
          if (!commune || !resp.hourly) return [];

          return this.projectForecastPoints(resp, commune, date, hour);
        });

        results.push(...points);
        logger.debug(
          { chunk: chunk.length, points: points.length },
          'Lot du batch forecast Open-Meteo obtenu',
        );
        return true;
      } catch (err) {
        logger.warn(
          { err, chunk: chunk.length },
          "Échec d'un lot du batch forecast Open-Meteo",
        );
        return false;
      }
    };

    let pending = chunks;
    for (let pass = 0; pass < 2 && pending.length > 0; pass += 1) {
      if (pass > 0) await sleep(3000);
      const failedChunks: typeof chunks = [];
      await runPool(
        pending,
        async (chunk) => {
          const ok = await fetchChunk(chunk);
          if (!ok) failedChunks.push(chunk);
        },
        1,
      );
      pending = failedChunks;
    }

    const complete = results.length >= communes.length && pending.length === 0;
    const ttl = complete ? FORECAST_CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS;
    this.batchForecastCache.set(cacheKey, {
      expiresAt: Date.now() + ttl,
      points: results,
    });
    logger.info(
      { communes: communes.length, points: results.length, pending: pending.length, cacheKey },
      'Batch forecast Open-Meteo mis en cache',
    );
    return results;
  }

  private projectForecastPoints(
    resp: OpenMeteoResponse,
    commune: { id: string; latitude: number; longitude: number },
    date: string,
    hour?: number,
  ): WeatherMapPoint[] {
    const hourly = resp.hourly;
    if (!hourly) return [];

    const base = {
      communeId: commune.id,
      communeName: '',
      districtId: '',
      districtName: '',
      longitude: commune.longitude,
      latitude: commune.latitude,
    };

    const hourStr = hour !== undefined ? String(hour).padStart(2, '0') : null;

    if (hourStr !== null) {
      const targetPrefix = `${date}T${hourStr}:`;
      const timeIdx = hourly.time.findIndex((t) => t.startsWith(targetPrefix));
      if (timeIdx < 0) return [];

      return [
        {
          ...base,
          observedAt: hourly.time[timeIdx],
          temperatureC: hourly.temperature_2m[timeIdx],
          humidityPercent: hourly.relative_humidity_2m[timeIdx],
          precipitationMm: hourly.precipitation[timeIdx],
          rainfall24hMm: null,
          windSpeedKmh: hourly.wind_speed_10m[timeIdx],
          windDirectionDeg: hourly.wind_direction_10m[timeIdx],
          pressureHpa: hourly.surface_pressure[timeIdx],
          weatherCode:
            hourly.weather_code[timeIdx] !== null
              ? String(hourly.weather_code[timeIdx])
              : null,
        },
      ];
    }

    const datePrefix = `${date}T`;
    const dayIndices: number[] = [];
    hourly.time.forEach((t, i) => {
      if (t.startsWith(datePrefix)) dayIndices.push(i);
    });
    if (dayIndices.length === 0) return [];

    const temps = dayIndices
      .map((i) => hourly.temperature_2m[i])
      .filter((v): v is number => v !== null);
    const humidities = dayIndices
      .map((i) => hourly.relative_humidity_2m[i])
      .filter((v): v is number => v !== null);
    const winds = dayIndices
      .map((i) => hourly.wind_speed_10m[i])
      .filter((v): v is number => v !== null);
    const pressures = dayIndices
      .map((i) => hourly.surface_pressure[i])
      .filter((v): v is number => v !== null);
    const codes = dayIndices
      .map((i) => hourly.weather_code[i])
      .filter((v): v is number => v !== null);

    const dailyRainIdx = resp.daily?.time?.indexOf(date) ?? -1;
    const dailyRain =
      dailyRainIdx >= 0 ? resp.daily?.precipitation_sum?.[dailyRainIdx] ?? null : null;

    const maxWindIdx =
      winds.length > 0 ? dayIndices[winds.indexOf(Math.max(...winds))] : -1;

    return [
      {
        ...base,
        observedAt: `${date}T12:00`,
        temperatureC: temps.length > 0 ? Math.max(...temps) : null,
        humidityPercent:
          humidities.length > 0
            ? Number((humidities.reduce((a, b) => a + b, 0) / humidities.length).toFixed(1))
            : null,
        precipitationMm: dailyRain,
        rainfall24hMm: dailyRain,
        windSpeedKmh: winds.length > 0 ? Math.max(...winds) : null,
        windDirectionDeg: maxWindIdx >= 0 ? hourly.wind_direction_10m[maxWindIdx] : null,
        pressureHpa:
          pressures.length > 0
            ? Number((pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(1))
            : null,
        weatherCode: codes.length > 0 ? String(codes[Math.floor(codes.length / 2)]) : null,
      },
    ];
  }
}

export const openMeteoProvider = new OpenMeteoProvider();
