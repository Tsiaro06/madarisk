import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { usersRepository } from '../repositories/users.repository';
import { weatherRepository } from '../repositories/weather.repository';
import { openMeteoProvider } from './openmeteo.provider';
import {
  WeatherCurrent,
  WeatherForecast,
  WeatherMapGeoJson,
  WeatherProvider,
  WeatherRefreshResult,
} from '../types/weather.types';
import { PaginatedResult } from '../types/territory.types';
import { UserRole } from '../types/auth.types';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const MAX_HISTORY_PERIOD_DAYS = 90;
const REFRESH_CONCURRENCY = 5;

let activeProvider: WeatherProvider = openMeteoProvider;

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
    }
  });
  await Promise.all(workers);
}

export const weatherService = {
  setProvider(provider: WeatherProvider): void {
    activeProvider = provider;
  },

  async refresh(
    input: {
      communeIds?: string[];
      districtId?: string;
      eventId?: string;
      confirmAll?: boolean;
    },
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<WeatherRefreshResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent rafraîchir les données météo');
    }

    const hasFilter = Boolean(input.communeIds?.length) || Boolean(input.districtId) || Boolean(input.eventId);
    if (!hasFilter && input.confirmAll !== true) {
      throw AppError.badRequest(
        'Précisez au moins un filtre (communeIds, districtId, eventId) ou activez confirmAll',
      );
    }

    const targets = await weatherRepository.targetCommunes({
      communeIds: input.communeIds,
      districtId: input.districtId,
      eventId: input.eventId,
    });

    const sourceId = await weatherRepository.getSourceId();
    const totalTargeted = targets.length;
    const failures: { communeId: string; reason: string }[] = [];

    const rows: Parameters<typeof weatherRepository.insertObservations>[0] = [];

    await runPool(
      targets,
      async (target) => {
        try {
          const weather = await activeProvider.getCurrent(target.latitude, target.longitude);
          rows.push({
            communeId: target.id,
            eventId: input.eventId ?? null,
            observedAt: weather.observedAt,
            latitude: target.latitude,
            longitude: target.longitude,
            temperatureC: weather.temperatureC,
            humidityPercent: weather.humidityPercent,
            precipitationMm: weather.precipitationMm,
            rainfall24hMm: weather.rainfall24hMm,
            windSpeedKmh: weather.windSpeedKmh,
            windDirectionDeg: weather.windDirectionDeg,
            pressureHpa: weather.pressureHpa,
            weatherCode: weather.weatherCode,
            rawData: {
              provider: 'open-meteo',
              districtId: input.districtId ?? null,
              eventId: input.eventId ?? null,
            },
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Erreur inconnue';
          failures.push({ communeId: target.id, reason });
          logger.warn({ communeId: target.id, err }, 'Échec du rafraîchissement météo d\'une commune');
        }
      },
      REFRESH_CONCURRENCY,
    );

    let totalSaved = 0;
    if (rows.length > 0) {
      totalSaved = await weatherRepository.insertObservations(rows, sourceId);
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'WEATHER_REFRESHED',
      entityType: 'weather_observation',
      newValue: {
        targeted: totalTargeted,
        saved: totalSaved,
        failed: failures.length,
        districtId: input.districtId ?? null,
        eventId: input.eventId ?? null,
      },
      ipAddress: getIp(req),
    });

    return { totalTargeted, totalSaved, totalFailed: failures.length, failures };
  },

  async latest(communeId: string) {
    const exists = await weatherRepository.verifyCommuneExists(communeId);
    if (!exists) {
      throw AppError.notFound('Commune introuvable');
    }
    const observation = await weatherRepository.findLatest(communeId);
    if (!observation) {
      throw AppError.notFound('Aucune observation météo enregistrée pour cette commune');
    }
    return observation;
  },

  async forecast(communeId: string): Promise<WeatherForecast> {
    const coordinates = await weatherRepository.getCommuneCoordinates(communeId);
    if (!coordinates) {
      throw AppError.notFound('Commune introuvable');
    }
    return activeProvider.getForecast(coordinates.latitude, coordinates.longitude);
  },

  async history(
    communeId: string,
    query: { dateFrom?: Date; dateTo?: Date; page: number; limit: number },
  ): Promise<PaginatedResult<WeatherCurrent & { id: string; createdAt: string }>> {
    const exists = await weatherRepository.verifyCommuneExists(communeId);
    if (!exists) {
      throw AppError.notFound('Commune introuvable');
    }

    if (query.dateFrom && query.dateTo) {
      const periodMs = query.dateTo.getTime() - query.dateFrom.getTime();
      if (periodMs > MAX_HISTORY_PERIOD_DAYS * 24 * 60 * 60 * 1000) {
        throw AppError.badRequest(
          `La période maximale d'interrogation est de ${MAX_HISTORY_PERIOD_DAYS} jours`,
        );
      }
    }

    return weatherRepository.history(communeId, query);
  },

  async mapLayer(query: {
    districtId?: string;
    eventId?: string;
    observedAt?: Date;
  }): Promise<WeatherMapGeoJson> {
    return weatherRepository.mapPoints(query);
  },
};