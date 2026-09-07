import axios, { AxiosError, AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { WeatherCurrent, WeatherForecast, WeatherProvider } from '../types/weather.types';
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

export class OpenMeteoProvider implements WeatherProvider {
  private readonly client: AxiosInstance;
  private readonly forecastCache = new Map<string, ForecastCacheEntry>();
  private readonly maxRetries = 2;

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

  private async request<T>(params: Record<string, unknown>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.get<T>('/v1/forecast', { params });
        return response.data;
      } catch (err) {
        lastError = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const retriable = status === undefined || status === 429 || status >= 500;
        logger.debug({ attempt: attempt + 1, status }, 'Tentative Open-Meteo échouée');
        if (!retriable || attempt >= this.maxRetries) break;
        await sleep(300 * (attempt + 1));
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
}

export const openMeteoProvider = new OpenMeteoProvider();
