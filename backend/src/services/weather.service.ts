import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { usersRepository } from '../repositories/users.repository';
import { weatherRepository } from '../repositories/weather.repository';
import { openMeteoProvider } from './openmeteo.provider';
import { dgmMaproomProvider } from './weather-maproom.provider';
import { getWeatherProvider, setWeatherProvider } from './weather-provider';
import {
  WeatherCurrent,
  WeatherDgmIngestResult,
  WeatherForecast,
  WeatherHourPoint,
  WeatherMapGeoJson,
  WeatherMapPoint,
  WeatherProvider,
  WeatherRefreshResult,
} from '../types/weather.types';
import { PaginatedResult } from '../types/territory.types';
import { ActorRef, UserRole } from '../types/auth.types';
import { IncomingHttpHeaders } from 'http';
import { randomUUID } from 'crypto';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const MAX_HISTORY_PERIOD_DAYS = 90;
const REFRESH_CONCURRENCY = 10;
const REFRESH_REQUEST_DELAY_MS = 150;

/**
 * Nombre d'heures distinctes minimales pour qu'une journée future soit servie
 * depuis `weather_hourly` plutôt que redemandée au fournisseur.
 *
 * Une journée complète en fait 24. En dessous, l'agrégat (max de température,
 * somme de pluie) serait calculé sur une fraction de la journée et
 * sous-estimerait le risque — c'est-à-dire afficherait une couche trop calme.
 * 12 heures est le seuil qui garantit qu'une journée est majoritairement
 * représentée tout en tolérant un run horaire tronqué.
 */
const MIN_HOURS_FOR_DAILY_LAYER = 12;

function assertAdmin(actor: { role: UserRole }): void {
  if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent administrer les données météo');
  }
}

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
 * Rafraîchissements météo lancés en tâche de fond.
 *
 * Un run national interroge le fournisseur par lots de 400 coordonnées et
 * prend 3 à 4 minutes. Le faire dans la requête HTTP exposait l'utilisateur à
 * deux mauvaises surprises : le proxy et le navigateur abandonnent vers 30 à
 * 60 s, donc l'interface affichait « échec » alors que le run se terminait
 * correctement et écrivait toutes les données. Le même clic relançait alors un
 * second run, pour rien.
 *
 * Le lancement renvoie donc immédiatement un identifiant et l'état réel est
 * lu par polling. Une seule entrée à la fois : deux runs concurrents
 * doubleraient la consommation de quota Open-Meteo pour un résultat identique.
 */
const backgroundRefreshes = new Map<string, RefreshState>();
let activeRefreshId: string | null = null;

/** Durée de vie d'un état de run, pour qu'il ne reste pas accessible indéfiniment. */
const REFRESH_STATE_TTL_MS = 30 * 60 * 1000;

export type RefreshState =
  | { status: 'RUNNING'; startedAt: string }
  | { status: 'SUCCESS'; startedAt: string; finishedAt: string; result: WeatherRefreshResult }
  | {
      status: 'FAILED';
      startedAt: string;
      finishedAt: string;
      error: string;
    };

function publicRefreshState(id: string): RefreshState | null {
  const state = backgroundRefreshes.get(id);
  if (!state) return null;
  // Nettoyage opportuniste : la Map ne doit pas survivre à la session.
  if ('finishedAt' in state && Date.now() - Date.parse(state.finishedAt) > REFRESH_STATE_TTL_MS) {
    backgroundRefreshes.delete(id);
    return null;
  }
  return state;
}

export const weatherService = {
  setProvider(provider: WeatherProvider): void {
    setWeatherProvider(provider);
  },

  /**
   * Lance un rafraîchissement sans bloquer la requête HTTP.
   *
   * Le District est court (une poignée de communes) et tient dans le délai du
   * client ; il reste donc synchrone, pour ne pas faire changer l'UX d'un clic
   * qui répond déjà en quelques secondes. Seul le run national passe en tâche
   * de fond.
   */
  async startRefresh(
    input: {
      communeIds?: string[];
      districtId?: string;
      eventId?: string;
      confirmAll?: boolean;
    },
    actor: ActorRef,
    req: RequestContext,
  ): Promise<{ refreshId: string; state: RefreshState; background: boolean }> {
    const isNational = !input.districtId && !input.communeIds?.length;

    if (!isNational) {
      const result = await this.refresh(input, actor, req);
      return {
        refreshId: 'sync',
        state: {
          status: 'SUCCESS',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          result,
        },
        background: false,
      };
    }

    if (activeRefreshId) {
      const current = publicRefreshState(activeRefreshId);
      if (current && current.status === 'RUNNING') {
        throw AppError.conflict(
          'Une synchronisation nationale est déjà en cours. Patientez quelques minutes avant d’en relancer une.',
        );
      }
    }

    const refreshId = randomUUID();
    const startedAt = new Date().toISOString();
    backgroundRefreshes.set(refreshId, { status: 'RUNNING', startedAt });
    activeRefreshId = refreshId;

    void this.refresh(input, actor, req)
      .then((result) => {
        backgroundRefreshes.set(refreshId, {
          status: 'SUCCESS',
          startedAt,
          finishedAt: new Date().toISOString(),
          result,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        backgroundRefreshes.set(refreshId, {
          status: 'FAILED',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: message,
        });
        logger.warn({ err, refreshId }, 'Rafraîchissement météo national en échec');
      })
      .finally(() => {
        if (activeRefreshId === refreshId) activeRefreshId = null;
      });

    return { refreshId, state: { status: 'RUNNING', startedAt }, background: true };
  },

  /** État d'un rafraîchissement lancé en tâche de fond. */
  refreshStatus(refreshId: string): RefreshState {
    const state = publicRefreshState(refreshId);
    if (!state) {
      throw AppError.notFound('Rafraîchissement météo introuvable ou expiré');
    }
    return state;
  },

  async refresh(
    input: {
      communeIds?: string[];
      districtId?: string;
      eventId?: string;
      confirmAll?: boolean;
    },
    actor: ActorRef,
    req: RequestContext,
  ): Promise<WeatherRefreshResult> {
    assertAdmin(actor);

    const hasFilter =
      Boolean(input.communeIds?.length) || Boolean(input.districtId) || Boolean(input.eventId);
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

    const provider = getWeatherProvider();
    const batch = provider.getCurrentBatch
      ? await provider.getCurrentBatch(
          targets.map((t) => ({ id: t.id, latitude: t.latitude, longitude: t.longitude })),
        )
      : null;

    if (batch) {
      const coordsById = new Map(targets.map((t) => [t.id, t]));
      for (const item of batch) {
        const target = coordsById.get(item.communeId);
        const c = item.current;
        if (!target || !c) continue;
        rows.push({
          communeId: item.communeId,
          eventId: input.eventId ?? null,
          observedAt: c.observedAt,
          latitude: target.latitude,
          longitude: target.longitude,
          temperatureC: c.temperatureC,
          humidityPercent: c.humidityPercent,
          precipitationMm: c.precipitationMm,
          rainfall24hMm: c.rainfall24hMm,
          windSpeedKmh: c.windSpeedKmh,
          windGustsKmh: c.windGustsKmh ?? null,
          windDirectionDeg: c.windDirectionDeg,
          pressureHpa: c.pressureHpa,
          weatherCode: c.weatherCode,
          rawData: {
            provider: 'open-meteo',
            districtId: input.districtId ?? null,
            eventId: input.eventId ?? null,
          },
        });
      }
      const okIds = new Set(batch.map((b) => b.communeId));
      for (const t of targets) {
        if (!okIds.has(t.id)) {
          failures.push({ communeId: t.id, reason: 'Aucune observation reçue du fournisseur' });
        }
      }
    } else {
      await runPool(
        targets,
        async (target) => {
          try {
            const weather = await provider.getCurrent(target.latitude, target.longitude);
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
              windGustsKmh: weather.windGustsKmh ?? null,
              windDirectionDeg: weather.windDirectionDeg,
              pressureHpa: weather.pressureHpa,
              weatherCode: weather.weatherCode,
              rawData: {
                provider: 'open-meteo',
                districtId: input.districtId ?? null,
                eventId: input.eventId ?? null,
              },
            });
            await new Promise((resolve) => setTimeout(resolve, REFRESH_REQUEST_DELAY_MS));
          } catch (err) {
            if (err instanceof AppError && err.statusCode === 429) {
              logger.warn(
                'Rafraîchissement météo interrompu : limite de requêtes Open-Meteo atteinte',
              );
              throw err;
            }
            const reason = err instanceof Error ? err.message : 'Erreur inconnue';
            failures.push({ communeId: target.id, reason });
            logger.warn(
              { communeId: target.id, err },
              "Échec du rafraîchissement météo d'une commune",
            );
          }
        },
        REFRESH_CONCURRENCY,
      );
    }

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
    return getWeatherProvider().getForecast(coordinates.latitude, coordinates.longitude);
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
    metric?: string;
    date?: string;
    hour?: number;
  }): Promise<WeatherMapGeoJson> {
    if (query.date) {
      const now = new Date();
      const madagascarOffset = 3 * 60 * 60 * 1000;
      const today = new Date(now.getTime() + madagascarOffset);
      const todayStr = today.toISOString().slice(0, 10);
      const isFuture = query.date > todayStr;
      const hourSelected = query.hour !== undefined;
      const useForecast = isFuture || (query.date === todayStr && hourSelected);

      if (useForecast) {
        // Mode « journée » d'une date future : la synthèse horaire de cette
        // journée est déjà en base (le run horaire écrit jusqu'à J+2). La servir
        // depuis `weather_hourly` coûte zéro appel fournisseur, alors que la
        // couche cartographique vaut 1 579 COORDONNÉES Open-Meteo par requête —
        // soit le quota gratuit journalier entier après quelques#nullable clics
        // sur la carte. C'est la source des 429 du 01/10.
        //
        // On ne bascule sur le fournisseur que si la base ne couvre pas vraiment
        // la journée (sync en retard, date hors horizon J+2, aucune donnée).
        if (query.hour === undefined && query.date > todayStr) {
          const dayStart = new Date(`${query.date}T00:00:00+03:00`);
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          const sourceId = await weatherRepository.getSourceId();
          const daily = await weatherRepository.hourlyDailyMapLayer(
            dayStart.toISOString(),
            dayEnd.toISOString(),
            { sourceId, districtId: query.districtId, minHours: MIN_HOURS_FOR_DAILY_LAYER },
          );

          if (
            daily.points.length > 0 &&
            daily.hoursCovered >= MIN_HOURS_FOR_DAILY_LAYER
          ) {
            return {
              type: 'FeatureCollection',
              features: daily.points.map((p) => ({
                type: 'Feature',
                id: p.communeId,
                geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
                properties: { ...p, observedAt: `${query.date}T12:00` },
              })),
            };
          }

          logger.info(
            { date: query.date, hoursCovered: daily.hoursCovered, points: daily.points.length },
            'Couche quotidienne future : base incomplète, repli sur le fournisseur',
          );
        }

        const communes = await weatherRepository.allCommunesInfo();
        const forecastPoints = await openMeteoProvider.getForecastBatch(
          communes,
          query.date,
          query.hour,
        );

        const infoMap = new Map(communes.map((c) => [c.id, c]));

        return {
          type: 'FeatureCollection',
          features: forecastPoints.map((fp) => {
            const info = infoMap.get(fp.communeId);
            const props: WeatherMapPoint = {
              ...fp,
              communeName: info?.name ?? '',
              districtId: info?.districtId ?? '',
              districtName: info?.districtName ?? '',
            };
            return {
              type: 'Feature',
              id: fp.communeId,
              geometry: {
                type: 'Point',
                coordinates: [fp.longitude, fp.latitude],
              },
              properties: props,
            };
          }),
        };
      }
    }

    let observedAt = query.observedAt;
    if (query.date) {
      // `date` est une date LOCALE (Madagascar, UTC+3) alors que
      // `weather_observations.observed_at` est stocké en UTC. Interpréter
      // `...T23:59:59.000Z` comme une borne UTC revenait à remonter jusqu'à
      // 02:59 du lendemain local : les observations du lendemain fuitaient dans
      // la journée demandée, et les 3 dernières heures du jour n'étaient
      // jamais couvertes. On ancre donc l'instant en heure locale puis on
      // convertit en UTC.
      const hh = String(query.hour ?? 23).padStart(2, '0');
      const mm = query.hour !== undefined ? '00' : '59';
      const ss = query.hour !== undefined ? '00' : '59';
      const localEnd = new Date(`${query.date}T${hh}:${mm}:${ss}+03:00`);
      // Garde-fou : une date illisible produirait un `Invalid Date` et ferait
      // échouer le `.toISOString()` du repository en 500 sur l'endpoint.
      if (!Number.isNaN(localEnd.getTime())) observedAt = localEnd;
    }
    return weatherRepository.mapPoints({
      districtId: query.districtId,
      eventId: query.eventId,
      observedAt,
    });
  },

  async hourlySeries(
    communeId: string,
    query: { dateFrom?: Date; dateTo?: Date },
  ): Promise<(WeatherHourPoint & { isForecast: boolean })[]> {
    const sourceId = await weatherRepository.getSourceId();
    return weatherRepository.hourlyForCommune(communeId, {
      sourceId,
      dateFrom: query.dateFrom?.toISOString(),
      dateTo: query.dateTo?.toISOString(),
    });
  },

  async hourlyMapLayer(query: {
    date?: string;
    hour?: number;
    districtId?: string;
    eventId?: string;
  }): Promise<WeatherMapGeoJson> {
    const now = new Date();
    const hourAt = new Date(
      `${query.date ?? now.toISOString().slice(0, 10)}T${String(query.hour ?? now.getHours()).padStart(2, '0')}:00:00+03:00`,
    );
    const sourceId = await weatherRepository.getSourceId();
    const points = await weatherRepository.hourlyMapLayer(hourAt.toISOString(), {
      sourceId,
      districtId: query.districtId,
      eventId: query.eventId,
    });
    return {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        id: p.communeId,
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: p as unknown as WeatherMapPoint,
      })),
    };
  },

  async latestObservationAt(): Promise<string | null> {
    return weatherRepository.latestObservationAt();
  },

  async ingestDgmMaproom(actor: ActorRef, req: RequestContext): Promise<WeatherDgmIngestResult> {
    assertAdmin(actor);

    const result = await dgmMaproomProvider.ingestLatestDekad();

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'WEATHER_DGM_INGESTED',
      entityType: 'weather_observation',
      newValue: {
        dekadLabel: result.dekadLabel,
        observedAt: result.observedAt,
        communesSampled: result.communesSampled,
        saved: result.saved,
      },
      ipAddress: getIp(req),
    });

    return result;
  },
};
