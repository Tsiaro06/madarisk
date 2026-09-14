import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { usersRepository } from '../repositories/users.repository';
import { weatherRepository } from '../repositories/weather.repository';
import type { WeatherInsertData } from '../repositories/weather.repository';
import { weatherSyncRepository } from '../repositories/weather-sync.repository';
import { getWeatherProvider } from './weather-provider';
import { AutomationRunStatus } from '../types/automation.types';
import { hazardDetectionService } from './hazard-detection.service';
import { exposureService } from './exposure.service';
import { automaticAlertService } from './automatic-alerts.service';
import {
  BatchCommuneInput,
  WeatherCurrentBatchItem,
  WeatherForecast,
  WeatherForecastDay,
  WeatherForecastDailyItem,
  WeatherMonitoringInfo,
  WeatherSyncScope,
  WeatherSyncTriggerResult,
} from '../types/weather.types';
import type { UserRole } from '../types/auth.types';

const SYNC_SOURCE = 'OPEN_METEO';

type SyncSubScope = 'OBSERVATIONS' | 'FORECASTS';

const REFRESH_CONCURRENCY = 10;
const REFRESH_REQUEST_DELAY_MS = 150;

interface SyncOutcome {
  status: AutomationRunStatus;
  saved: number;
  communes: number;
  failures: number;
  error: string | null;
  details: Record<string, unknown>;
}

interface RequestContext {
  ip?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

export function dedupeByExisting<T>(
  rows: T[],
  existing: Set<string>,
  keyOf: (row: T) => string,
): { kept: T[]; skipped: number } {
  const kept: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (existing.has(keyOf(row))) {
      skipped += 1;
    } else {
      kept.push(row);
    }
  }
  return { kept, skipped };
}

function aggregateDailyFromForecast(forecast: WeatherForecast): WeatherForecastDay[] {
  const times = forecast.hourly.time;
  if (times.length === 0) return [];

  const days = new Map<string, WeatherForecastDay>();
  times.forEach((time, i) => {
    const day = time.slice(0, 10);
    const existing = days.get(day);
    if (existing) {
      const t = forecast.hourly.temperatureC[i];
      if (t !== null && t !== undefined) {
        existing.temperatureMinC =
          existing.temperatureMinC === null ? t : Math.min(existing.temperatureMinC, t);
        existing.temperatureMaxC =
          existing.temperatureMaxC === null ? t : Math.max(existing.temperatureMaxC, t);
      }
      const p = forecast.hourly.precipitationMm[i];
      if (p !== null && p !== undefined) {
        existing.precipitationSumMm = (existing.precipitationSumMm ?? 0) + p;
      }
      const w = forecast.hourly.windSpeedKmh[i];
      if (w !== null && w !== undefined) {
        existing.windSpeedMaxKmh =
          existing.windSpeedMaxKmh === null ? w : Math.max(existing.windSpeedMaxKmh, w);
      }
    } else {
      days.set(day, {
        day,
        temperatureMinC:
          forecast.hourly.temperatureC[i] !== null && forecast.hourly.temperatureC[i] !== undefined
            ? forecast.hourly.temperatureC[i]
            : null,
        temperatureMaxC:
          forecast.hourly.temperatureC[i] !== null && forecast.hourly.temperatureC[i] !== undefined
            ? forecast.hourly.temperatureC[i]
            : null,
        relativeHumidityAvg: null,
        precipitationSumMm:
          forecast.hourly.precipitationMm[i] !== null &&
          forecast.hourly.precipitationMm[i] !== undefined
            ? forecast.hourly.precipitationMm[i]
            : null,
        windSpeedMaxKmh:
          forecast.hourly.windSpeedKmh[i] !== null && forecast.hourly.windSpeedKmh[i] !== undefined
            ? forecast.hourly.windSpeedKmh[i]
            : null,
        windGustsMaxKmh: null,
        windDirectionDeg: null,
        pressureAvgHpa:
          forecast.hourly.surfacePressureHpa[i] !== null &&
          forecast.hourly.surfacePressureHpa[i] !== undefined
            ? forecast.hourly.surfacePressureHpa[i]
            : null,
        weatherCode:
          forecast.hourly.weatherCode[i] !== null && forecast.hourly.weatherCode[i] !== undefined
            ? String(forecast.hourly.weatherCode[i])
            : null,
      });
    }
  });

  days.forEach((d) => {
    if (d.precipitationSumMm !== null)
      d.precipitationSumMm = Number(d.precipitationSumMm.toFixed(2));
  });

  return Array.from(days.values());
}

function subScopes(scope: WeatherSyncScope): SyncSubScope[] {
  return scope === 'OBSERVATIONS_AND_FORECASTS' ? ['OBSERVATIONS', 'FORECASTS'] : [scope];
}

async function fetchObservations(
  provider: ReturnType<typeof getWeatherProvider>,
  inputs: BatchCommuneInput[],
): Promise<{ items: WeatherCurrentBatchItem[]; failures: string[] }> {
  const failures: string[] = [];
  if (provider.getCurrentBatch) {
    const batch = await provider.getCurrentBatch(inputs);
    const okIds = new Set(batch.map((b) => b.communeId));
    failures.push(...inputs.filter((i) => !okIds.has(i.id)).map((i) => i.id));
    return { items: batch, failures };
  }

  const items: WeatherCurrentBatchItem[] = [];
  await runPool(
    inputs,
    async (c) => {
      try {
        const current = await provider.getCurrent(c.latitude, c.longitude);
        items.push({ communeId: c.id, latitude: c.latitude, longitude: c.longitude, current });
        await sleep(REFRESH_REQUEST_DELAY_MS);
      } catch (err) {
        failures.push(c.id);
      }
    },
    REFRESH_CONCURRENCY,
  );
  return { items, failures };
}

async function fetchForecasts(
  provider: ReturnType<typeof getWeatherProvider>,
  inputs: BatchCommuneInput[],
): Promise<{ items: WeatherForecastDailyItem[]; failures: string[] }> {
  const failures: string[] = [];
  if (provider.getForecastDailyBatch) {
    const batch = await provider.getForecastDailyBatch(inputs);
    const okIds = new Set(batch.map((b) => b.communeId));
    failures.push(...inputs.filter((i) => !okIds.has(i.id)).map((i) => i.id));
    return { items: batch, failures };
  }

  const items: WeatherForecastDailyItem[] = [];
  await runPool(
    inputs,
    async (c) => {
      try {
        const forecast = await provider.getForecast(c.latitude, c.longitude);
        items.push({
          communeId: c.id,
          latitude: c.latitude,
          longitude: c.longitude,
          days: aggregateDailyFromForecast(forecast),
        });
        await sleep(REFRESH_REQUEST_DELAY_MS);
      } catch (err) {
        failures.push(c.id);
      }
    },
    REFRESH_CONCURRENCY,
  );
  return { items, failures };
}

function observationRowsFromItems(items: WeatherCurrentBatchItem[]): {
  rows: WeatherInsertData[];
  missingData: number;
} {
  const rows: WeatherInsertData[] = [];
  let missingData = 0;
  for (const item of items) {
    try {
      if (!item || !item.current) {
        missingData += 1;
        continue;
      }
      const c = item.current;
      if (
        c.temperatureC === null &&
        c.humidityPercent === null &&
        c.precipitationMm === null &&
        c.rainfall24hMm === null &&
        c.windSpeedKmh === null &&
        c.pressureHpa === null &&
        c.weatherCode === null
      ) {
        missingData += 1;
        continue;
      }
      rows.push({
        communeId: item.communeId,
        eventId: null,
        observedAt: new Date(c.observedAt).toISOString(),
        latitude: item.latitude,
        longitude: item.longitude,
        temperatureC: c.temperatureC,
        humidityPercent: c.humidityPercent,
        precipitationMm: c.precipitationMm,
        rainfall24hMm: c.rainfall24hMm,
        windSpeedKmh: c.windSpeedKmh,
        windGustsKmh: c.windGustsKmh ?? null,
        windDirectionDeg: c.windDirectionDeg,
        pressureHpa: c.pressureHpa,
        weatherCode: c.weatherCode,
        rawData: { provider: 'open-meteo', sync: 'auto' },
      });
    } catch {
      missingData += 1;
    }
  }
  return { rows, missingData };
}

async function syncObservations(opts: { communeIds?: string[] }): Promise<SyncOutcome> {
  const provider = getWeatherProvider();
  const sourceId = await weatherRepository.getSourceId();

  const communes = opts.communeIds?.length
    ? await weatherRepository.targetCommunes({ communeIds: opts.communeIds })
    : await weatherRepository.allCommunesInfo();
  const inputs: BatchCommuneInput[] = communes.map((c) => ({
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const { items, failures } = await fetchObservations(provider, inputs);
  const { rows, missingData } = observationRowsFromItems(items);

  const existing = await weatherRepository.existingObservationKeys(
    sourceId,
    rows.map((r) => ({ communeId: r.communeId, observedAt: r.observedAt })),
  );
  const dedupe = dedupeByExisting(
    rows,
    existing,
    (r) => `${r.communeId}|${new Date(r.observedAt).toISOString().slice(0, 19)}`,
  );
  const saved = await weatherRepository.insertObservations(dedupe.kept, sourceId);

  const noSavedData = dedupe.kept.length === 0;
  let status: AutomationRunStatus;
  if (failures.length > 0) {
    status = noSavedData && items.length === 0 ? 'FAILED' : 'PARTIAL';
  } else if (missingData > 0) {
    status = noSavedData ? 'FAILED' : 'PARTIAL';
  } else {
    status = 'SUCCESS';
  }

  logger.info(
    { targeted: inputs.length, saved, failed: failures.length, missing: missingData },
    'Synchronisation météo : observations terminées',
  );

  return {
    status,
    saved,
    communes: inputs.length,
    failures: failures.length + missingData,
    error: failures.length === inputs.length ? 'Aucune donnée observation obtenue' : null,
    details: { missingData, duplicatesSkipped: dedupe.skipped },
  };
}

async function syncForecasts(opts: { communeIds?: string[] }): Promise<SyncOutcome> {
  const provider = getWeatherProvider();
  const sourceId = await weatherRepository.getSourceId();

  const communes = opts.communeIds?.length
    ? await weatherRepository.targetCommunes({ communeIds: opts.communeIds })
    : await weatherRepository.allCommunesInfo();
  const inputs: BatchCommuneInput[] = communes.map((c) => ({
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const { items, failures } = await fetchForecasts(provider, inputs);

  const generatedAt = new Date().toISOString();
  const rows: {
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
  }[] = [];
  let missingData = 0;

  for (const item of items) {
    try {
      if (!item || !item.days?.length) {
        missingData += 1;
        continue;
      }
      for (const day of item.days) {
        rows.push({
          communeId: item.communeId,
          forecastDay: day.day,
          generatedAt,
          latitude: item.latitude,
          longitude: item.longitude,
          temperatureMinC: day.temperatureMinC,
          temperatureMaxC: day.temperatureMaxC,
          relativeHumidityAvg: day.relativeHumidityAvg,
          precipitationSumMm: day.precipitationSumMm,
          windSpeedMaxKmh: day.windSpeedMaxKmh,
          windGustsMaxKmh: day.windGustsMaxKmh ?? null,
          windDirectionDeg: day.windDirectionDeg,
          pressureAvgHpa: day.pressureAvgHpa,
          weatherCode: day.weatherCode,
          rawData: { provider: 'open-meteo', sync: 'auto' },
        });
      }
    } catch {
      missingData += 1;
    }
  }

  const existing = await weatherRepository.existingForecastKeys(
    sourceId,
    rows.map((r) => ({ communeId: r.communeId, forecastDay: r.forecastDay })),
  );
  const dedupe = dedupeByExisting(rows, existing, (r) => `${r.communeId}|${r.forecastDay}`);
  const saved = await weatherRepository.insertForecasts(dedupe.kept, sourceId);

  const noSavedData = dedupe.kept.length === 0;
  let status: AutomationRunStatus;
  if (failures.length > 0) {
    status = noSavedData && items.length === 0 ? 'FAILED' : 'PARTIAL';
  } else if (missingData > 0) {
    status = noSavedData ? 'FAILED' : 'PARTIAL';
  } else {
    status = 'SUCCESS';
  }

  logger.info(
    { targeted: inputs.length, saved, failed: failures.length, missing: missingData },
    'Synchronisation météo : prévisions terminées',
  );

  return {
    status,
    saved,
    communes: inputs.length,
    failures: failures.length + missingData,
    error: failures.length === inputs.length ? 'Aucune donnée prévision obtenue' : null,
    details: { missingData, duplicatesSkipped: dedupe.skipped },
  };
}

async function runSubScopeBody(
  scope: SyncSubScope,
  opts: { communeIds?: string[] },
): Promise<string> {
  const runId = await weatherSyncRepository.createRun(scope, SYNC_SOURCE);
  const lock = inflight.get(scope);
  if (lock) lock.runId = runId;
  try {
    const outcome =
      scope === 'OBSERVATIONS' ? await syncObservations(opts) : await syncForecasts(opts);
    await weatherSyncRepository.finishRun(runId, {
      status: outcome.status,
      recordsProcessed: outcome.saved,
      communesProcessed: outcome.communes,
      errorsCount: outcome.failures,
      errorMessage: outcome.error,
      details: outcome.details,
    });
    return runId;
  } catch (err) {
    const statusCode = err instanceof AppError ? err.statusCode : null;
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    logger.warn({ err, runId, scope }, 'Synchronisation météo : échec de la synchro');
    await weatherSyncRepository.recordProviderError({
      provider: SYNC_SOURCE,
      operation: scope === 'OBSERVATIONS' ? 'OBSERVATIONS_SYNC' : 'FORECASTS_SYNC',
      statusCode,
      message,
    });
    await weatherSyncRepository.finishRun(runId, {
      status: 'FAILED',
      recordsProcessed: 0,
      communesProcessed: 0,
      errorsCount: 1,
      errorMessage: message,
    });
    return runId;
  }
}

const inflight = new Map<string, { runId: string | null }>();

async function detectAfterSync(scope: WeatherSyncScope): Promise<void> {
  try {
    await hazardDetectionService.run({
      trigger: 'SCHEDULED',
      scope: scope === 'OBSERVATIONS_AND_FORECASTS' ? 'ALL' : scope,
      skipWhenNoRules: true,
    });
  } catch (err) {
    logger.warn({ err }, 'Détection d aléas post-synchronisation ignorée (échec)');
  }

  // Après une nouvelle synchronisation : recalcule automatique (idempotent)
  // de l'exposition et des risques pour tous les événements détectés.
  try {
    await exposureService.recomputeActiveEvents('SYNC');
  } catch (err) {
    logger.warn({ err }, 'Recalcul de l exposition post-synchronisation ignoré (échec)');
  }

  // Alertes automatiques : création ou mise à jour pour chaque événement actif.
  try {
    await automaticAlertService.generateForActiveEvents();
  } catch (err) {
    logger.warn({ err }, 'Génération d alertes automatiques post-synchronisation ignorée (échec)');
  }
}

export const weatherSyncService = {
  async trigger(
    input: { scope: WeatherSyncScope; communeIds?: string[] },
    actor?: { id: string; role: UserRole },
    req?: RequestContext,
  ): Promise<WeatherSyncTriggerResult> {
    const scopes = subScopes(input.scope);
    const busy = scopes.find((s) => inflight.has(s));
    if (busy) {
      const lock = inflight.get(busy);
      logger.info(
        { scope: busy, runId: lock?.runId },
        'Synchro météo : exécution déjà en cours, rejoint',
      );
      return {
        status: 'RUNNING',
        started: false,
        joinedExisting: true,
        runs: [{ scope: busy, runId: lock?.runId ?? '', status: 'RUNNING' }],
      };
    }

    for (const scope of scopes) inflight.set(scope, { runId: null });

    const runStatuses: AutomationRunStatus[] = [];
    const runIds: string[] = [];
    try {
      for (const scope of scopes) {
        const runId = await runSubScopeBody(scope, { communeIds: input.communeIds });
        runIds.push(runId);
        const latest = await weatherSyncRepository.latestRun(scope, SYNC_SOURCE);
        runStatuses.push((latest?.status as AutomationRunStatus) ?? 'FAILED');
      }
    } finally {
      for (const scope of scopes) inflight.delete(scope);
    }

    await detectAfterSync(input.scope);

    const successCount = runStatuses.filter((s) => s === 'SUCCESS').length;
    const failedCount = runStatuses.length - successCount;

    if (actor) {
      await usersRepository.writeAudit({
        userId: actor.id,
        action: 'WEATHER_SYNC_RUN',
        entityType: 'weather_observation',
        newValue: {
          scope: input.scope,
          runIds,
          status: failedCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL' : 'FAILED',
        },
        ipAddress: req?.ip,
      });
    }

    return {
      status: failedCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL' : 'FAILED',
      started: true,
      joinedExisting: false,
      runs: scopes.map((scope, i) => ({
        scope,
        runId: runIds[i],
        status: runStatuses[i],
      })),
    };
  },

  async runScheduled(scope: WeatherSyncScope): Promise<void> {
    try {
      const result = await weatherSyncService.trigger({ scope });
      logger.info(
        { scope, status: result.status, runs: result.runs.length },
        'Job météo : synchronisation planifiée terminée',
      );
    } catch (err) {
      logger.error({ err, scope }, 'Job météo : échec de la synchronisation planifiée');
    }
  },

  async monitoring(): Promise<WeatherMonitoringInfo> {
    const sourceId = await weatherRepository.getSourceId();
    const [
      sources,
      obsLastRun,
      obsLastSuccess,
      obsLastData,
      obsCoverage,
      fInfo,
      fLastRun,
      fLastSuccess,
    ] = await Promise.all([
      weatherRepository.weatherSources(),
      weatherSyncRepository.latestRun('OBSERVATIONS', SYNC_SOURCE),
      weatherSyncRepository.latestSuccessfulRun('OBSERVATIONS', SYNC_SOURCE),
      weatherRepository.latestObservationAtForSource(sourceId),
      weatherRepository.observationCommuneCoverage(sourceId),
      weatherRepository.forecastDataInfo(sourceId),
      weatherSyncRepository.latestRun('FORECASTS', SYNC_SOURCE),
      weatherSyncRepository.latestSuccessfulRun('FORECASTS', SYNC_SOURCE),
    ]);

    const obsLagMinutes =
      obsLastData !== null ? (Date.now() - new Date(obsLastData).getTime()) / 60000 : null;
    const forecastLagHours =
      fInfo.lastGeneratedAt !== null
        ? (Date.now() - new Date(fInfo.lastGeneratedAt).getTime()) / 3600000
        : null;

    return {
      generatedAt: new Date().toISOString(),
      sources: sources.map((s) => ({
        name: s.name,
        providerType: s.providerType,
        baseUrl: s.baseUrl,
        isActive: s.isActive,
        refreshIntervalMinutes: s.refreshIntervalMinutes,
        keyConfigured: false,
      })),
      sync: {
        observations: {
          lastRun: obsLastRun,
          lastSuccessAt: obsLastSuccess?.finishedAt ?? null,
          lastDataAt: obsLastData,
          lagMinutes: obsLagMinutes !== null ? Math.round(obsLagMinutes) : null,
          status:
            obsLagMinutes === null
              ? 'NEVER'
              : obsLagMinutes <= env.WEATHER_OBSERVATION_STALE_MINUTES
                ? 'FRESH'
                : 'STALE',
          communesData: obsCoverage,
        },
        forecasts: {
          lastRun: fLastRun,
          lastSuccessAt: fLastSuccess?.finishedAt ?? null,
          lastDataAt: fInfo.lastGeneratedAt,
          lagHours: forecastLagHours !== null ? Math.round(forecastLagHours) : null,
          status:
            fInfo.lastGeneratedAt === null
              ? 'NEVER'
              : (forecastLagHours ?? Infinity) <= env.WEATHER_FORECAST_STALE_HOURS
                ? 'FRESH'
                : 'STALE',
          communesData: fInfo.communesData,
          maxForecastDay: fInfo.maxForecastDay,
        },
      },
    };
  },
};
