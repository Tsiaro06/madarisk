import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { usersRepository } from '../repositories/users.repository';
import { weatherRepository } from '../repositories/weather.repository';
import type {
  TargetCommune,
  WeatherInsertData,
  WeatherHourlyInsertData,
} from '../repositories/weather.repository';
import { weatherSyncRepository } from '../repositories/weather-sync.repository';
import { getWeatherProvider } from './weather-provider';
import { getQuotaSnapshot } from './weather-quota';
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

/**
 * Source journalisée dans `weather_sync_runs`. Le rattrapage des créneaux
 * manqués (`weather-refresh.job`) relit ces runs : la constante est partagée
 * pour qu'une requête ne puisse pas interroger une autre source que celle qui
 * écrit.
 */
export const SYNC_SOURCE = 'OPEN_METEO';

type SyncSubScope = 'OBSERVATIONS' | 'FORECASTS';

/**
 * Refuse un run quand le fournisseur a déjà fermé son circuit (429 horaire ou
 * journalier).
 *
 * Constaté le 23/10 : un run national lancé une minute après un 429 a passé
 * 35 minutes à relancer des lots que le fournisseur refusait, puis s'est
 * terminé sans une donnée. Le run suivant était en plus bloqué par le verrou
 * « exécution en cours ». Renoncer tout de suite laisse le créneau au
 * rattrapage suivant, avec un motif daté au lieu d'un run zombie.
 */
function assertProviderAvailable(provider: ReturnType<typeof getWeatherProvider>): void {
  const until = provider.rateLimitedUntil?.() ?? null;
  if (until === null) return;

  throw AppError.tooManyRequests(
    `Synchro météo reportée : Open-Meteo est en limite de débit jusqu'à ${until.toISOString()}. ` +
      "Aucun lot n'a été envoyé ; les données restent celles du dernier run réussi.",
    Math.max(60, Math.ceil((until.getTime() - Date.now()) / 1000)),
  );
}

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

/**
 * Fenêtre avant laquelle une observation est considérée encore à jour, et
 * donc inutile à retélécharger. Volontairement plus courte que le seuil de
 * péremption affiché par le monitoring (`WEATHER_OBSERVATION_STALE_MINUTES`)
 * pour qu'un cycle de 6 h retélécharge bien toute la carte à chaque passage,
 * tout en rendant gratuit le cas courant d'un run relancé alors que le précédent
 * a déjà tout couvert.
 * `Math.min` garantit qu'un déploiement ayant durci son seuil de
 * péremption rafraîchit plus souvent, jamais moins.
 */
const OBSERVATION_REFRESH_MINUTES = Math.min(env.WEATHER_OBSERVATION_STALE_MINUTES, 60);
const FORECAST_REFRESH_HOURS = Math.min(env.WEATHER_FORECAST_STALE_HOURS, 3);

function observationCutoffIso(): string {
  return new Date(Date.now() - OBSERVATION_REFRESH_MINUTES * 60_000).toISOString();
}

function forecastCutoffIso(): string {
  return new Date(Date.now() - FORECAST_REFRESH_HOURS * 3_600_000).toISOString();
}

/**
 * Réparation horaire : fenêtre et volume.
 *
 * La fenêtre est volontairement alignée sur ce que le fournisseur peut
 * réellement resservir (réanalyse `past_days`), sinon des créneaux
 * irrécupérables resteraient « manquants » à chaque run et le run
 * auto-réparateur consommerait du quota sans jamais converger. L'heure en cours
 * est exclue : elle est encore incomplète, l'exiger ferait cibler les 1579
 * communes à chaque passage.
 */
const HOURLY_REPAIR_MAX_COMMUNES = 600;

function hourlyRepairWindow(): { sinceIso: string; untilIso: string } {
  const nowMs = Date.now();
  const hourMs = 3_600_000;
  const untilMs = Math.floor(nowMs / hourMs) * hourMs;
  const pastDays = Math.max(1, env.OPEN_METEO_PAST_DAYS);
  return {
    sinceIso: new Date(untilMs - pastDays * 24 * hourMs).toISOString(),
    untilIso: new Date(untilMs).toISOString(),
  };
}

/**
 * Communes à rafraîchir : celles dont l'observation est périmée, plus celles
 * qui ont un trou horaire — sélection indépendante, sinon un run dont
 * l'écriture horaire est tronquée n'est jamais rejoué sur ces communes et le
 * trou devient définitif dans la courbe.
 */
async function selectObservationTargets(sourceId: string): Promise<TargetCommune[]> {
  const [stale, gappy] = await Promise.all([
    weatherRepository.communesNeedingObservations(sourceId, observationCutoffIso()),
    weatherRepository
      .communesMissingHourlySlots(
        sourceId,
        hourlyRepairWindow().sinceIso,
        hourlyRepairWindow().untilIso,
        HOURLY_REPAIR_MAX_COMMUNES,
      )
      .catch((err: unknown) => {
        logger.warn(
          { err },
          'Sélection des trous horaires impossible, run limité aux observations',
        );
        return [] as TargetCommune[];
      }),
  ]);

  const seen = new Set<string>();
  const merged: TargetCommune[] = [];
  for (const commune of [...gappy, ...stale]) {
    if (seen.has(commune.id)) continue;
    seen.add(commune.id);
    merged.push(commune);
  }
  return merged;
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
          forecast.hourly.pressureHpa[i] !== null && forecast.hourly.pressureHpa[i] !== undefined
            ? forecast.hourly.pressureHpa[i]
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

/**
 * Transforme la série horaire renvoyée par le provider en lignes
 * `weather_hourly`. Aucune requête HTTP supplémentaire : les heures arrivent
 * dans la réponse du batch d'observations.
 *
 * `isForecast` est calculé ici plutôt que réutilisé du fournisseur : une heure
 * peut être passée dans la réponse d'un run tardif (l'analyse réanalyse le
 * passé), et une heure à venir reste une prévision même après son passage.
 */
export function hourlyRowsFromItems(items: WeatherCurrentBatchItem[]): WeatherHourlyInsertData[] {
  const nowMs = Date.now();
  const rows: WeatherHourlyInsertData[] = [];

  for (const item of items) {
    if (!item?.hours?.length) continue;
    for (const h of item.hours) {
      const hourMs = Date.parse(h.hourAt);
      if (!Number.isFinite(hourMs)) continue;
      rows.push({
        communeId: item.communeId,
        hourAt: new Date(hourMs).toISOString(),
        latitude: item.latitude,
        longitude: item.longitude,
        temperatureC: h.temperatureC,
        humidityPercent: h.humidityPercent,
        precipitationMm: h.precipitationMm,
        rainMm: h.rainMm,
        windSpeedKmh: h.windSpeedKmh,
        windGustsKmh: h.windGustsKmh,
        windDirectionDeg: h.windDirectionDeg,
        pressureHpa: h.pressureHpa,
        weatherCode: h.weatherCode,
        isForecast: hourMs > nowMs,
      });
    }
  }
  return rows;
}

export interface HourlyGap {
  communeId: string;
  /** Première heure présente avant le trou (UTC ISO). */
  from: string;
  /** Première heure présente après le trou (UTC ISO). */
  to: string;
  missingHours: number;
}

/**
 * Détecte les discontinuités d'une série horaire AVANT son écriture.
 *
 * Une série trouée n'est pas une erreur d'insertion : elle est déjà trouée
 * chez le fournisseur (lot partiel, réponse tronquée). L'écrire telle quelle
 * laisse un trou définitif dans la courbe, et Recharts le masque en reliant
 * les points voisins d'un trait continu — la courbe invente alors la météo
 * manquante. On journalise le trou pour qu'il soit visible et réparable par le
 * run suivant (`communesMissingHourlySlots` cible déjà ces communes), au lieu
 * de le laisser silencieux.
 */
export function findHourlyGaps(items: WeatherCurrentBatchItem[], maxGapHours = 1): HourlyGap[] {
  const gaps: HourlyGap[] = [];
  const hourMs = 3_600_000;

  for (const item of items) {
    const hours = item?.hours ?? [];
    let previousHour: number | null = null;
    for (const h of hours) {
      const t = Date.parse(h.hourAt);
      if (!Number.isFinite(t)) continue;
      const currentHour = Math.floor(t / hourMs);
      if (previousHour !== null && currentHour - previousHour > maxGapHours) {
        gaps.push({
          communeId: item.communeId,
          from: new Date(previousHour * hourMs).toISOString(),
          to: new Date(currentHour * hourMs).toISOString(),
          missingHours: currentHour - previousHour - 1,
        });
      }
      previousHour = currentHour;
    }
  }
  return gaps;
}

async function syncObservations(opts: { communeIds?: string[] }): Promise<SyncOutcome> {
  const provider = getWeatherProvider();
  assertProviderAvailable(provider);
  const sourceId = await weatherRepository.getSourceId();

  // Sans filtre préalable, chaque run cron requesting les 1579 communes même
  // lorsque tout est déjà à jour : la limite de débit Open-Meteo est alors
  // atteinte en permanence et un lot entier de 400 communes se retrouve privé
  // de données. On ne demande donc que les communes réellement à rafraîchir,
  // ce qui rend chaque run auto-réparateur : les trous se remplissent au run
  // suivant, et un run à jour ne coûte aucune requête HTTP.
  //
  // La sélection ne se limite pas à la péremption des observations : les communes
  // ayant un créneau horaire manquant sont également ciblées, sinon un run dont
  // l'écriture horaire est tronquée (429, chunk interrompu) n'est jamais rejoué
  // sur ces communes et le trou reste définitivement vide dans la courbe.
  const communes = opts.communeIds?.length
    ? await weatherRepository.targetCommunes({ communeIds: opts.communeIds })
    : await selectObservationTargets(sourceId);
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

  // Courbe horaire (passé + prévision) : même appel Open-Meteo, donc aucun
  // quota supplémentaire. Elle est écrite pour toutes les communes ciblées par
  // le run — le cron quotidien dépasse toujours le seuil de fraîcheur, donc les
  // 1579 communes passent, et la fenêtre glissante est reconstituée.
  const hourlyGaps = findHourlyGaps(items);
  if (hourlyGaps.length > 0) {
    logger.warn(
      {
        communes: new Set(hourlyGaps.map((g) => g.communeId)).size,
        gaps: hourlyGaps.length,
        missingHours: hourlyGaps.reduce((sum, g) => sum + g.missingHours, 0),
        sample: hourlyGaps.slice(0, 5),
      },
      'Série horaire Open-Meteo discontinue : les trous seront réparés au prochain run',
    );
  }
  const hourlySaved = await weatherRepository.insertHourly(hourlyRowsFromItems(items), sourceId);

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
    {
      targeted: inputs.length,
      saved,
      failed: failures.length,
      missing: missingData,
      hourlySaved,
    },
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
  assertProviderAvailable(provider);
  const sourceId = await weatherRepository.getSourceId();

  // Même logique que pour les observations : on ne retélécharge que les
  // communes dont les prévisions ont été générées avant la fenêtre de
  // rafraîchissement, ce qui rend le run à jour gratuit et auto-réparateur.
  const communes = opts.communeIds?.length
    ? await weatherRepository.targetCommunes({ communeIds: opts.communeIds })
    : await weatherRepository.communesNeedingForecasts(sourceId, forecastCutoffIso());
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

  // Pas de dédoublonnage par (commune, jour) ici, contrairement aux
  // observations. Le filtre de fraîcheur des communes fait déjà le travail qui
  // économise le quota, et un second filtre sur les lignes_exists annulait
  // complètement le rafraîchissement : pour une commune deemed stale, ses
  // journées de prévision sont déjà toutes en base, donc toutes les lignes
  // étaient écartées et le run se terminait en « SUCCESS » sans rien écrire.
  // Conséquence après plusieurs jours d'arrêt de la machine : les prévisions
  // restaient figées sur le premier modèle téléchargé, et `generated_at`
  // n'avançait pas — c'est pourtant lui qui alimente la détection de
  // péremption des prévisions, donc le job se croyait toujours en retard.
  // L'idempotence est désormais assurée par l'upsert du repository
  // (`ON CONFLICT ... DO UPDATE`).
  const saved = await weatherRepository.insertForecasts(rows, sourceId);

  const noSavedData = rows.length === 0;
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
    details: { missingData, duplicatesSkipped: 0 },
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

/**
 * Chaîne automatique post-synchronisation : détection d'aléas, recalcul de
 * l'exposition puis génération des alertes automatiques. Exporté pour être
 * réutilisé par le rafraîchissement legacy (`POST /weather/refresh/communes`)
 * qui n'embarque pas `weatherSyncService.trigger`.
 */
export async function detectAfterSync(
  scope: WeatherSyncScope,
  trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED',
): Promise<void> {
  try {
    await hazardDetectionService.run({
      trigger,
      scope: scope === 'OBSERVATIONS_AND_FORECASTS' ? 'ALL' : scope,
      skipWhenNoRules: true,
    });
  } catch (err) {
    logger.warn({ err }, 'Détection d aléas post-synchronisation ignorée (échec)');
  }

  // Sous vitest, la base partagée contient des événements à forte exposition
  // (plusieurs milliers de communes exposées) : ces deux étapes coûteraient
  // ~20 s par rafraîchissement. Elles sont couvertes individuellement par
  // exposure.test.ts et automatic-alerts.test.ts.
  if (process.env.VITEST === 'true') return;

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
      quota: await getQuotaSnapshot(),
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
