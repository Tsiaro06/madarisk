import axios, { AxiosError, AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  WeatherCurrent,
  WeatherForecast,
  WeatherMapPoint,
  WeatherProvider,
  BatchCommuneInput,
  WeatherCurrentBatchItem,
  WeatherForecastDailyItem,
  WeatherHourPoint,
} from '../types/weather.types';
import { AppError } from '../utils/app-error';
import {
  classifyRateLimit,
  dailyResetRetryAfter,
  nextDailyReset,
  nextHourlyReset,
  openMeteoCoordinateLimiter,
  rateLimitMessage,
  reserveQuota,
  type RateLimitKind,
} from './weather-quota';

interface OpenMeteoCurrentResponse {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  rain: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  wind_gusts_10m: number | null;
  pressure_msl: number | null;
  weather_code: number | null;
  time: string;
}

interface OpenMeteoDailyResponse {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  wind_speed_10m_max: (number | null)[];
  wind_gusts_10m_max: (number | null)[];
  wind_direction_10m_dominant: (number | null)[];
  relative_humidity_2m_mean: (number | null)[];
  pressure_msl_mean: (number | null)[];
  weather_code: (number | null)[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: OpenMeteoCurrentResponse;
  current_units?: Record<string, string>;
  daily?: OpenMeteoDailyResponse;
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation: (number | null)[];
    rain: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    pressure_msl: (number | null)[];
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
  'wind_gusts_10m',
  'pressure_msl',
  'weather_code',
].join(',');

const HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'rain',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'pressure_msl',
  'weather_code',
].join(',');

const DAILY_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'relative_humidity_2m_mean',
  'pressure_msl_mean',
  'weather_code',
].join(',');

const FORECAST_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Plafond d'entrées du cache de prévisions.
 *
 * `forecastCache` est indexé par coordonnées arrondies : il est naturellement
 * borné par le nombre de communes. `batchForecastCache` est indexé par
 * `date:heure` et gagne une entrée à chaque heure consultée sur la carte, sans
 * jamais être purgé : sur un process qui tourne des mois (le service API démarre
 * au boot et n'est jamais relancé), la Map accumule des milliers d'entrées de
 * 1 579 points. Le plafond borne cette croissance, l'éviction expire d'abord ce
 * qui ne sert plus.
 *
 * 288 entrées = 12 jours d'heures cartographiées, très au-delà de la fenêtre
 * affichée (72 h) et des jours que la couche affiche encore.
 */
const MAX_FORECAST_CACHE_ENTRIES = 288;

interface ForecastCacheEntry {
  expiresAt: number;
  data: WeatherForecast;
}

/**
 * Évicte les entrées expirées puis, si le cache dépasse le plafond, les entrées
 * qui expirent le plus tôt. La `Map` conserve l'ordre d'insertion, mais `set`
 * sur une clé existante ne la déplace pas : on trie donc sur `expiresAt` plutôt
 * que de compter sur l'ordre.
 */
export function pruneForecastCache(cache: Map<string, { expiresAt: number }>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  if (cache.size <= MAX_FORECAST_CACHE_ENTRIES) return;

  const byDeadline = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const excess = cache.size - MAX_FORECAST_CACHE_ENTRIES;
  for (let i = 0; i < excess; i += 1) {
    const key = byDeadline[i]?.[0];
    if (key !== undefined) cache.delete(key);
  }
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

/**
 * Politique de convergence des lots multi-coordonnées.
 *
 * Open-Meteo plafonne le débit (600 req/min, 5000 req/h sur l'offre gratuite).
 * Un HTTP 429 vient donc du NOMBRE de requêtes, pas de la taille d'une
 * requête : scinder un lot refusé ne sert à rien et aggrave la situation
 * (deux requêtes au lieu d'une). On se contente donc de réessayer le lot
 * fautif avec un recul progressif, en gardant les points déjà obtenus pour
 * les autres lots, ce qui garantit qu'un refus ne fait perdre que le lot
 * concerné et pas l'ensemble du run.
 */
const BATCH_MAX_PASSES = 5;
const BATCH_RETRY_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

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
  /** Nature du plafond ayant fermé le circuit, pour adapter le message. */
  private rateLimitKind: RateLimitKind | null = null;
  private readonly forecastCache = new Map<string, ForecastCacheEntry>();
  private readonly batchForecastCache = new Map<
    string,
    { expiresAt: number; points: WeatherMapPoint[] }
  >();
  private readonly batchCacheKey = (date: string, hour?: number): string =>
    `${date}:${hour ?? 'day'}`;

  /**
   * File d'attente des appels à Open-Meteo.
   *
   * Le fournisseur rationne par IP et refuse deux requêtes simultanées
   * (`too many concurrent requests`). Or rien, dans le processus, n'empêchait
   * les lots d'observations et de prévisions de partir ensemble : le job météo
   * ne sérialise que par sous-périmètre, et une synchronisation déclenchée à la
   * main depuis l'interfacecourt-circuite même ce garde-fou. Deux lots
   * nationaliaux simultanés = 1579 communes, et un 429 sur un lot de 400 en
   * fait perdre 400 d'un coup.
   *
   * Un seul appel en vol à la fois, quel que soit le déclencheur. Le quota
   * d'Open-Meteo étant dimensionné pour un seul flux, sérialiser ne coûte
   * rien : chaque sous-périmètre est déjà traité en série en interne.
   */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Interrompt un batch quand le quota journalier est épuisé.
   *
   * Sans cette garde, un batch qui a reçu un 429 journalier enchaîne jusqu'à 5
   * passes de lots : chaque passe attend, échoue, et le run se termine sur un
   * décompte de 1579 communes en échec. Relancer ne peut pas aboutir avant le
   * reset, on rend donc une erreur unique, datée, que le frontend sait exploiter.
   */
  private abortIfDailyQuotaExhausted(): void {
    if (this.rateLimitKind !== 'daily' || Date.now() >= this.rateLimitedUntil) return;
    throw AppError.tooManyRequests(
      rateLimitMessage('daily', new Date(this.rateLimitedUntil)),
      dailyResetRetryAfter(),
    );
  }

  /**
   * Refuse l'envoi tant que le circuit est fermé.
   *
   * Appelé avant la réservation de quota et avant la cadence par minute : une
   * requête que le circuit va de toute façon refuser ne doit ni facturer le
   * budget journalier, ni faire attendre son lot une minute entière pour rien.
   */
  private assertCircuitOpen(): void {
    if (Date.now() >= this.rateLimitedUntil) return;
    const resetAt = new Date(this.rateLimitedUntil);
    const retryAfter = Math.max(60, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    logger.warn(
      { until: resetAt.toISOString(), kind: this.rateLimitKind },
      'Open-Meteo : circuit couvert activé, requête court-circuitée',
    );
    throw AppError.tooManyRequests(
      rateLimitMessage(this.rateLimitKind ?? 'hourly', resetAt),
      retryAfter,
    );
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    // `then(task, task)` : un appel précédent en échec ne doit pas bloquer la
    // file, sinon un 429 monterait en tête et paralyserait les runs suivants.
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

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

  private request<T>(
    params: Record<string, unknown>,
    retries: number = this.maxRetries,
  ): Promise<T> {
    return this.enqueue(() => this.requestNow<T>(params, retries));
  }

  private async requestNow<T>(params: Record<string, unknown>, retries: number): Promise<T> {
    this.assertCircuitOpen();

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
            (axiosErr?.response?.data as { reason?: unknown } | undefined)?.reason ?? '',
          ).toLowerCase();
          const kind = classifyRateLimit(reason);

          // Plafond journalier : aucune relance ne peut aboutir avant le reset
          // de 00:00 UTC. On échoue tout de suite et on couvre le circuit jusqu'à
          // cette échéance, pour que les autres runs de la journée ne repartent
          // pas facturer des coordonnées que le fournisseur refusera aussi.
          if (kind === 'daily') {
            const resetAt = nextDailyReset();
            this.rateLimitKind = 'daily';
            this.rateLimitedUntil = resetAt.getTime();
            logger.warn(
              { reason, until: resetAt.toISOString() },
              "Open-Meteo : quota journalier atteint, circuit couvert jusqu'au reset",
            );
            // On leve ICI et pas via un `break` : après la boucle, l'erreur
            // repasserait par `toApiError`, qui reconstruirait un 429 générique
            // en perdant l'heure de reset. C'est pourtant le premier 429 de la
            // journée, donc le seul que l'utilisateur voit, celui qui doit
            // porter le `Retry-After`.
            throw AppError.tooManyRequests(
              rateLimitMessage('daily', resetAt),
              dailyResetRetryAfter(),
            );
          }

          if (kind === 'hourly') {
            // Le compteur horaire se rebat en début d'heure UTC, pas une heure
            // après le 429 : attendre `RATE_LIMIT_RESET_MS` (ancien défaut)
            // faisait ouvrir le circuit jusqu'à 09:48 UTC pour un reset à
            // 09:00 (constaté le 08/10). La prochaine heure borne l'attente
            // par le reset réel ; le header reste prioritaire quand il existe,
            // plafonné lui aussi à ce reset pour ne pas attendre au-delà.
            const retryAfter = Number(axiosErr?.response?.headers?.['retry-after']);
            const untilNextHour = nextHourlyReset().getTime() - Date.now();
            const waitMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, untilNextHour)
                : untilNextHour;
            this.rateLimitKind = 'hourly';
            this.rateLimitedUntil = Date.now() + Math.max(waitMs, 60 * 1000);
            const resetAt = new Date(this.rateLimitedUntil);
            logger.warn(
              { until: resetAt.toISOString() },
              'Open-Meteo : limite horaire atteinte, circuit couvert jusqu au reset horaire',
            );
            // Même raisonnement que le plafond journalier ci-dessus : lever
            // ICI conserve l'heure de reset dans le message que l'utilisateur
            // voit, là où `toApiError` reconstruirait un 429 générique.
            throw AppError.tooManyRequests(
              rateLimitMessage('hourly', resetAt),
              Math.max(60, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
            );
          }
          logger.warn(
            { reason },
            'Open-Meteo : limite de rafale atteinte, patientage puis nouvelle tentative',
          );
          if (attempt >= retries) break;
          // Chaque retry doit traverser une minute entière. Les anciens délais
          // (3 s, 10 s, 25 s) retombaient dans la même fenêtre FIXE du
          // fournisseur et brûlaient les tentatives pour rien : c'est ce qui a
          // fait échouer le run du 08/10 11:35 (38 s d'attente cumulée, puis
          // 429 « minutely » définitif) alors que le fournisseur lui-même
          // demande « please try again in one minute ».
          const burstBackoff = [70_000, 65_000, 65_000][attempt] ?? 65_000;
          await sleep(burstBackoff);
          continue;
        }
        const retriable = status === undefined || (status !== undefined && status >= 500);
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
      windGustsKmh: current.wind_gusts_10m,
      windDirectionDeg: current.wind_direction_10m,
      pressureHpa: current.pressure_msl,
      weatherCode: current.weather_code !== null ? String(current.weather_code) : null,
    };
  }

  /**
   * Valeur de `daily` pour la date du jour, cherchee par date et non par
   * index. L'appel observations demande `past_days`, donc `daily.time[0]`
   * correspond a hier : lire le premier index donnerait le cumul d'hier au
   * lieu du cumul du jour (et afficherait de la pluie dans le passe).
   */
  private dailyValueForToday(resp: OpenMeteoResponse, key: 'precipitation_sum'): number | null {
    const daily = resp.daily;
    if (!daily?.time) return null;
    const idx = daily.time.indexOf(this.localDateIn(resp.timezone));
    if (idx >= 0) return daily[key]?.[idx] ?? null;
    return daily[key]?.[0] ?? null;
  }

  /** Date du jour (YYYY-MM-DD) dans le fuseau renvoye par le fournisseur. */
  private localDateIn(timezone: string | undefined): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Serie horaire (passe + prevision) au format du fournisseur, dont les
   * horodatages sont en heure LOCALE de la commune et sans suffixe de fuseau
   * (`2026-10-01T15:00`). Sans conversion, `new Date('2026-10-01T15:00')`
   * serait lu comme UTC : Madagascar (+03) decalerait toute la courbe de trois
   * heures, et l'heure affichee ne serait plus celle demandee.
   */
  private mapHourlySeries(resp: OpenMeteoResponse): WeatherHourPoint[] {
    const hourly = resp.hourly;
    if (!hourly?.time?.length) return [];

    const offsetMinutes = this.timezoneOffsetMinutes(resp.timezone);
    const hours: WeatherHourPoint[] = [];

    hourly.time.forEach((local, i) => {
      const hourMs = Date.parse(`${local}Z`) - offsetMinutes * 60_000;
      if (!Number.isFinite(hourMs)) return;
      hours.push({
        hourAt: new Date(hourMs).toISOString(),
        temperatureC: hourly.temperature_2m?.[i] ?? null,
        humidityPercent: hourly.relative_humidity_2m?.[i] ?? null,
        precipitationMm: hourly.precipitation?.[i] ?? null,
        rainMm: hourly.rain?.[i] ?? null,
        windSpeedKmh: hourly.wind_speed_10m?.[i] ?? null,
        windGustsKmh: hourly.wind_gusts_10m?.[i] ?? null,
        windDirectionDeg: hourly.wind_direction_10m?.[i] ?? null,
        pressureHpa: hourly.pressure_msl?.[i] ?? null,
        weatherCode:
          hourly.weather_code?.[i] !== null && hourly.weather_code?.[i] !== undefined
            ? String(hourly.weather_code[i])
            : null,
      });
    });

    return hours;
  }

  /** Decalage du fuseau en minutes (ex. 180 pour Africa/Nairobi, +03). */
  private timezoneOffsetMinutes(timezone: string | undefined): number {
    if (!timezone) return 0;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(new Date());
      const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
      const asUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour') % 24,
        get('minute'),
        get('second'),
      );
      return Math.round((asUtc - Date.now()) / 60_000);
    } catch {
      return 0;
    }
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

  async getCurrentBatch(communes: BatchCommuneInput[]): Promise<WeatherCurrentBatchItem[]> {
    const BATCH_SIZE = 400;

    const chunks: BatchCommuneInput[][] = [];
    for (let i = 0; i < communes.length; i += BATCH_SIZE) {
      chunks.push(communes.slice(i, i + BATCH_SIZE));
    }

    const results: WeatherCurrentBatchItem[] = [];
    const fetchChunk = async (chunk: BatchCommuneInput[]): Promise<boolean> => {
      try {
        const lats = chunk.map((c) => c.latitude.toFixed(3));
        const lons = chunk.map((c) => c.longitude.toFixed(3));

        this.assertCircuitOpen();
        await reserveQuota(chunk.length);
        await openMeteoCoordinateLimiter.acquire(chunk.length);

        const data = await this.request<OpenMeteoResponse | OpenMeteoResponse[]>(
          {
            latitude: lats.join(','),
            longitude: lons.join(','),
            current: CURRENT_VARIABLES,
            hourly: HOURLY_VARIABLES,
            daily: 'precipitation_sum',
            timezone: 'auto',
            forecast_days: 2,
            // 1 jour de reanalysis : c'est ce qui permet d'afficher une heure
            // PASSEE (ex. la temp de 15h) et pas seulement l'heure courante et
            // la prevision. `past_days` decale aussi `daily`, donc le cumul de
            // pluie n'est plus en index 0 : il est lu par date plus bas.
            past_days: env.OPEN_METEO_PAST_DAYS,
          },
          this.batchMaxRetries,
        );

        const responses = Array.isArray(data) ? data : [data];

        responses.forEach((resp, idx) => {
          const commune = chunk[idx];
          if (!commune || !resp.current) return;
          const rainfall24hMm = this.dailyValueForToday(resp, 'precipitation_sum');
          results.push({
            communeId: commune.id,
            latitude: commune.latitude,
            longitude: commune.longitude,
            current: { ...this.mapCurrent(resp.current), rainfall24hMm },
            hours: this.mapHourlySeries(resp),
          });
        });
        logger.debug(
          { chunk: chunk.length, points: responses.length },
          'Lot d observations Open-Meteo obtenu',
        );
        return true;
      } catch (err) {
        // Un 429 ne se converge pas : le circuit est déjà ouvert, et relancer
        // les mêmes lots ne peut qu'aggraver la situation. Il remonte donc au
        // caller, qui rendra une erreur unique et datée.
        if (err instanceof AppError && err.statusCode === 429) throw err;
        logger.warn(
          { err, chunk: chunk.length },
          "Échec d'un lot du batch observations Open-Meteo",
        );
        return false;
      }
    };

    let pending = chunks;
    let rateLimitError: AppError | null = null;

    for (let pass = 0; pass < BATCH_MAX_PASSES && pending.length > 0; pass += 1) {
      this.abortIfDailyQuotaExhausted();
      if (pass > 0) {
        const backoff =
          BATCH_RETRY_BACKOFF_MS[Math.min(pass - 1, BATCH_RETRY_BACKOFF_MS.length - 1)] ?? 60_000;
        await sleep(backoff);
      }
      const failedChunks: typeof chunks = [];
      await runPool(
        pending,
        async (chunk) => {
          if (rateLimitError) return;
          try {
            const ok = await fetchChunk(chunk);
            if (!ok) failedChunks.push(chunk);
          } catch (err) {
            // Un 429 survenu en cours de route ne doit pas effacer ce qui a
            // déjà été récupéré sur les lots précédents : on cesse les lots
            // restants et on conserve les observations et les heures déjà
            // obtenues. Avant, l'exception remontait hors de `getCurrentBatch` et
            // un rate-limit tardif transformait en trou définitif toute la
            // fenêtre horaire déjà payée.
            rateLimitError = err as AppError;
          }
        },
        1,
      );
      if (rateLimitError) break;
      pending = failedChunks;
    }

    // Run entièrement rate-limité : aucune donnée du tout, l'erreur 429 est
    // alors la seule information utile et doit remonter telle quelle.
    if (rateLimitError && results.length === 0) throw rateLimitError;

    if (rateLimitError) {
      // Le circuit vient d'être armé par le 429 : recontrôler ici ne ferait que
      // renvoyer l'exception et annulerait les partiels que l'on veut justement
      // conserver. On s'en tient à l'avertissement.
      logger.warn(
        {
          communes: communes.length,
          points: results.length,
          lost: communes.length - results.length,
        },
        'Open-Meteo : limite de débit atteinte, batch interrompu avec les résultats partiels',
      );
    } else {
      this.abortIfDailyQuotaExhausted();
    }

    if (pending.length > 0) {
      logger.warn(
        { lostCommunes: pending.reduce((n, c) => n + c.length, 0) },
        'Open-Meteo : des communes resteront sans observation après convergence',
      );
    }

    logger.info(
      { communes: communes.length, points: results.length, pending: pending.length },
      'Batch observations Open-Meteo traité',
    );
    return results;
  }

  async getForecastDailyBatch(communes: BatchCommuneInput[]): Promise<WeatherForecastDailyItem[]> {
    const BATCH_SIZE = 400;
    // 3 jours et non 4 : Open-Meteo pondère le coût d'un appel au nombre de
    // couples (jours x variables), donc chaque jour en plus renchérit le run
    // national de ~25 %. À 1579 communes, c'est la différence entre rester sous
    // le plafond quotidien de 10 000 appels et le dépasser.
    const FORECAST_DAYS = 3;

    const chunks: BatchCommuneInput[][] = [];
    for (let i = 0; i < communes.length; i += BATCH_SIZE) {
      chunks.push(communes.slice(i, i + BATCH_SIZE));
    }

    const results: WeatherForecastDailyItem[] = [];
    const fetchChunk = async (chunk: BatchCommuneInput[]): Promise<boolean> => {
      try {
        const lats = chunk.map((c) => c.latitude.toFixed(3));
        const lons = chunk.map((c) => c.longitude.toFixed(3));

        this.assertCircuitOpen();
        await reserveQuota(chunk.length);
        await openMeteoCoordinateLimiter.acquire(chunk.length);

        const data = await this.request<OpenMeteoResponse | OpenMeteoResponse[]>(
          {
            latitude: lats.join(','),
            longitude: lons.join(','),
            daily: DAILY_VARIABLES,
            timezone: 'auto',
            forecast_days: FORECAST_DAYS,
          },
          this.batchMaxRetries,
        );

        const responses = Array.isArray(data) ? data : [data];

        responses.forEach((resp, idx) => {
          const commune = chunk[idx];
          const daily = resp.daily;
          if (!commune || !daily || !daily.time) return;

          const days = daily.time.map((day, di) => ({
            day,
            temperatureMinC: daily.temperature_2m_min?.[di] ?? null,
            temperatureMaxC: daily.temperature_2m_max?.[di] ?? null,
            relativeHumidityAvg: daily.relative_humidity_2m_mean?.[di] ?? null,
            precipitationSumMm: daily.precipitation_sum?.[di] ?? null,
            windSpeedMaxKmh: daily.wind_speed_10m_max?.[di] ?? null,
            windGustsMaxKmh: daily.wind_gusts_10m_max?.[di] ?? null,
            windDirectionDeg: daily.wind_direction_10m_dominant?.[di] ?? null,
            pressureAvgHpa: daily.pressure_msl_mean?.[di] ?? null,
            weatherCode:
              daily.weather_code?.[di] !== null && daily.weather_code?.[di] !== undefined
                ? String(daily.weather_code[di])
                : null,
          }));

          results.push({
            communeId: commune.id,
            latitude: commune.latitude,
            longitude: commune.longitude,
            days,
          });
        });
        logger.debug(
          { chunk: chunk.length, communes: responses.length },
          'Lot du batch prévisions quotidiennes Open-Meteo obtenu',
        );
        return true;
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 429) throw err;
        logger.warn({ err, chunk: chunk.length }, "Échec d'un lot du batch prévisions Open-Meteo");
        return false;
      }
    };

    let pending = chunks;
    for (let pass = 0; pass < BATCH_MAX_PASSES && pending.length > 0; pass += 1) {
      this.abortIfDailyQuotaExhausted();
      if (pass > 0) {
        const backoff =
          BATCH_RETRY_BACKOFF_MS[Math.min(pass - 1, BATCH_RETRY_BACKOFF_MS.length - 1)] ?? 60_000;
        await sleep(backoff);
      }
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
    this.abortIfDailyQuotaExhausted();

    if (pending.length > 0) {
      logger.warn(
        { lostCommunes: pending.reduce((n, c) => n + c.length, 0) },
        'Open-Meteo : des communes resteront sans prévision après convergence',
      );
    }

    logger.info(
      { communes: communes.length, results: results.length, pending: pending.length },
      'Batch prévisions quotidiennes Open-Meteo mis en cache',
    );
    return results;
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
        pressureHpa: data.hourly?.pressure_msl ?? [],
        weatherCode: data.hourly?.weather_code ?? [],
      },
    };

    this.forecastCache.set(cacheKey, {
      expiresAt: Date.now() + FORECAST_CACHE_TTL_MS,
      data: forecast,
    });
    pruneForecastCache(this.forecastCache);

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

        this.assertCircuitOpen();
        await reserveQuota(chunk.length);
        await openMeteoCoordinateLimiter.acquire(chunk.length);

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
        // Même règle qu'ailleurs : un 429 remonte. Une carte vide sans motif
        // afficher serait plus trompeuse qu'un refus accompagné de l'heure de
        // reset, que le frontend sait rendre.
        if (err instanceof AppError && err.statusCode === 429) throw err;
        logger.warn({ err, chunk: chunk.length }, "Échec d'un lot du batch forecast Open-Meteo");
        return false;
      }
    };

    // Volontairement 2 passes seulement, contrairement aux batchs
    // observations/prévisions : celui-ci alimente la carte interactive, où
    // l'utilisateur attend le rendu. En cas de saturation Open-Meteo, mieux
    // vaut renvoyer les points déjà obtenus (et servir le cache au prochain
    // appel) que bloquer la carte pendant plusieurs minutes.
    let pending = chunks;
    // Pas de `abortIfDailyQuotaExhausted` ici, contrairement aux batchs
    // observations/prévisions : la couche cartographique n'a pas de run à
    // arrêter, seulement une carte à servir. Mais le 429 remonte quand même,
    // pour une raison symétrique : renvoyer une carte à moitié vide sans dire
    // pourquoi serait plus trompeur qu'un refus daté, que le frontend sait
    // rendre. Le repli sur la dernière observation connue reste le rôle du
    // service de couche, pas celui du fournisseur.
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
    pruneForecastCache(this.batchForecastCache);
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
          windGustsKmh: hourly.wind_gusts_10m?.[timeIdx] ?? null,
          windDirectionDeg: hourly.wind_direction_10m[timeIdx],
          pressureHpa: hourly.pressure_msl[timeIdx],
          weatherCode:
            hourly.weather_code[timeIdx] !== null ? String(hourly.weather_code[timeIdx]) : null,
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
      .map((i) => hourly.pressure_msl[i])
      .filter((v): v is number => v !== null);
    const codes = dayIndices
      .map((i) => hourly.weather_code[i])
      .filter((v): v is number => v !== null);

    const dailyRainIdx = resp.daily?.time?.indexOf(date) ?? -1;
    const dailyRain =
      dailyRainIdx >= 0 ? (resp.daily?.precipitation_sum?.[dailyRainIdx] ?? null) : null;

    const maxWindIdx = winds.length > 0 ? dayIndices[winds.indexOf(Math.max(...winds))] : -1;

    const gusts = dayIndices
      .map((i) => hourly.wind_gusts_10m?.[i])
      .filter((v): v is number => v !== null && v !== undefined);

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
        windGustsKmh: gusts.length > 0 ? Math.max(...gusts) : null,
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
