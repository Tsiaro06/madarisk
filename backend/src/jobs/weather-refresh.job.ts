import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository } from '../repositories/weather.repository';
import { weatherSyncRepository } from '../repositories/weather-sync.repository';
import { SYNC_SOURCE, weatherSyncService } from '../services/weather-sync.service';
import type { WeatherSyncScope } from '../types/weather.types';

let started = false;

/** Période du battement qui sert à détecter un retour de veille. */
const RESUME_CHECK_INTERVAL_MS = 60_000;

/**
 * Écart d'horloge au-delà duquel la machine est considérée comme ayant dormi.
 * 5 min pour un battement de 1 min : au-delà, ce n'est plus un retard
 * d'exécution mais un gel de l'horloge système.
 */
const RESUME_DRIFT_MINUTES = 5;

/**
 * Délai minimal entre deux tentatives de rattrapage.
 *
 * Le rattrapage ne suit pas toujours une longue interruption : `tsx watch`
 * relance le process à chaque sauvegarde, et un créneau manqué le reste tant
 * qu'aucune tentative n'a réussi. Sans ce garde, deux redémarrages pendant le
 * run national (4 à 15 min) lanceraient deux synchronisations concurrentes —
 * précisément ce qu'Open-Meteo refuse (« too many concurrent requests »).
 */
const CATCH_UP_MIN_INTERVAL_MINUTES = 30;

/**
 * Période du contrôle de fraîcheur en cours de fonctionnement.
 *
 * Sans lui, un run de 06:00 qui échoue (429 fournisseur) laissait la journée
 * sans données : le démarrage et le retour de veille sont déjà passés, et le
 * bandeau ne se répare qu'au prochain redémarrage. 15 min laisse le temps à un
 * run (4 à 15 min) de finir avant le contrôle suivant.
 */
const CATCH_UP_CHECK_INTERVAL_MS = 15 * 60_000;

/**
 * Nombre maximal de tentatives automatiques par créneau planifié.
 *
 * Un échec fournisseur laisse le créneau manqué : il faut le retenter, sinon la
 * journée reste sans données. Mais retenter jusqu'au soir épuiserait le budget
 * Open-Meteo (une tentative échoue après avoir réservé ses premiers lots, pour
 * un plafond de 10 000 appels). Au-delà, on attend le créneau suivant ou une
 * relance manuelle — le journal le dit à chaque contrôle.
 */
const MAX_AUTOMATIC_ATTEMPTS_PER_SLOT = 3;

/** Cause du rattrapage, journalisée pour distinguer les scénarios. */
type CatchUpTrigger = 'démarrage' | 'veille' | 'périodique';

/**
 * Périmètres à resynchroniser d'après l'âge des données, décision pure pour
 * être testable : le reste du fichier dépend de la base et de l'horloge.
 *
 * Le seuil est celui du bandeau du monitoring : dès que la fraîcheur affichée
 * bascule en STALE, on relance. Ce filet reste utile quand l'expression cron
 * n'est pas quotidienne (voir `missedScheduledScopes`, qui ne sait lire que ce
 * cas) et quand un run réussit sans écrire de données.
 */
export function staleWeatherScopes(input: {
  lastObservationAt: string | null;
  lastForecastAt: string | null;
  observationStaleMinutes: number;
  forecastStaleHours: number;
  now: number;
}): WeatherSyncScope[] {
  const scopes: WeatherSyncScope[] = [];

  const observationLagMinutes =
    input.lastObservationAt === null
      ? Infinity
      : (input.now - new Date(input.lastObservationAt).getTime()) / 60_000;
  if (observationLagMinutes > input.observationStaleMinutes) scopes.push('OBSERVATIONS');

  const forecastLagHours =
    input.lastForecastAt === null
      ? Infinity
      : (input.now - new Date(input.lastForecastAt).getTime()) / 3_600_000;
  if (forecastLagHours > input.forecastStaleHours) scopes.push('FORECASTS');

  return scopes;
}

/** Vrai si une tentative a démarré il y a moins de `minutes` : inutile de relancer. */
export function attemptedRecently(startedAt: string | null, now: Date, minutes: number): boolean {
  if (startedAt === null) return false;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;

  return now.getTime() - started < minutes * 60_000;
}

/** Heure/minute d'une expression cron quotidienne, ou `null` si elle ne l'est pas. */
function dailyRunTime(expression: string): { hours: number; minutes: number } | null {
  const fields = expression.trim().split(/\s+/);
  // `node-cron` accepte un champ secondes en tête : `0 0 6 * * *`.
  const parts = fields.length === 6 ? fields.slice(1) : fields;
  if (parts.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null;
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return null;

  const minutes = Number(minute);
  const hours = Number(hour);
  if (hours > 23 || minutes > 59) return null;

  return { hours, minutes };
}

/**
 * Dernier créneau planifié d'une expression cron quotidienne, en heure locale.
 *
 * `node-cron` planifie en heure locale quand aucune `timezone` n'est passée :
 * le créneau doit être calculé de la même façon, sinon le rattrapage se
 * déclencherait à contretemps (machine en UTC+3 : 06:00 local = 03:00 UTC).
 *
 * `null` pour toute expression qui n'est pas « minute heure * * * » (horaire,
 * semaine, pas de 6 h…), auquel cas seul l'âge des données décide.
 */
export function lastScheduledSlot(expression: string, now: Date): Date | null {
  const time = dailyRunTime(expression);
  if (time === null) return null;

  const slot = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    time.hours,
    time.minutes,
    0,
    0,
  );
  // Avant l'heure du jour, le dernier créneau est celui de la veille.
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1);

  return slot;
}

/**
 * Périmètres dont le dernier créneau planifié est passé sans succès.
 *
 * Défaut corrigé ici : le cron quotidien de 06:00 ne se déclenche que si le
 * process tourne à 06:00, et le rattrapage au démarrage ne regardait que l'âge
 * des données. Avec un seuil de 25 h pour une période de 24 h, un créneau
 * manqué une seule fois n'était jamais rattrapé — démarrage à 08:20 sur une
 * dernière synchro de la veille à 08:45, soit 23 h 40 d'âge : sous le seuil,
 * journée entière sans mise à jour. Le créneau, lui, est franchi.
 *
 * Un run en échec laisse le créneau manqué : il est donc retenté au prochain
 * démarrage ou retour de veille (`attemptedRecently` empêche la rafale).
 */
export function missedScheduledScopes(input: {
  now: Date;
  observationCron: string;
  forecastCron: string;
  lastObservationSuccessAt: string | null;
  lastForecastSuccessAt: string | null;
}): WeatherSyncScope[] {
  const candidates: Array<[WeatherSyncScope, string, string | null]> = [
    ['OBSERVATIONS', input.observationCron, input.lastObservationSuccessAt],
    ['FORECASTS', input.forecastCron, input.lastForecastSuccessAt],
  ];

  const scopes: WeatherSyncScope[] = [];
  for (const [scope, expression, lastSuccessAt] of candidates) {
    const slot = lastScheduledSlot(expression, input.now);
    if (slot === null) continue;

    const lastSuccess = lastSuccessAt === null ? null : new Date(lastSuccessAt).getTime();
    if (lastSuccess === null || Number.isNaN(lastSuccess) || lastSuccess < slot.getTime()) {
      scopes.push(scope);
    }
  }

  return scopes;
}

/** État d'un périmètre au moment du contrôle. */
export interface CatchUpCandidate {
  scope: WeatherSyncScope;
  /** Dernière réussite antérieure au dernier créneau planifié. */
  missed: boolean;
  /** Données plus vieilles que le seuil du bandeau de fraîcheur. */
  stale: boolean;
  /** Début de la dernière tentative, tous statuts confondus. */
  lastAttemptAt: string | null;
  /** Tentatives depuis le créneau (`null` si le cron n'est pas quotidien). */
  attemptsSinceSlot: number | null;
}

/**
 * Périmètres à resynchroniser maintenant, décision pure.
 *
 * Trois filtres, dans cet ordre :
 *  1. il faut une raison — créneau manqué ou données périmées ;
 *  2. pas de tentative récente (`minIntervalMinutes`) : un run dure 4 à 15 min
 *     et `tsx watch` redémarre le process à chaque sauvegarde ;
 *  3. pas plus de `maxAttemptsPerSlot` tentatives par créneau, sinon un
 *     fournisseur en panne consomme le budget de la journée.
 *
 * Le plafond ne s'applique pas aux crons non quotidiens (`attemptsSinceSlot`
 * nul) : sans créneau identifiable, l'âge des données reste seul juge.
 */
export function scopesToCatchUp(input: {
  candidates: CatchUpCandidate[];
  now: Date;
  minIntervalMinutes: number;
  maxAttemptsPerSlot: number;
}): WeatherSyncScope[] {
  return input.candidates
    .filter((candidate) => candidate.missed || candidate.stale)
    .filter(
      (candidate) =>
        !attemptedRecently(candidate.lastAttemptAt, input.now, input.minIntervalMinutes),
    )
    .filter(
      (candidate) =>
        candidate.attemptsSinceSlot === null ||
        candidate.attemptsSinceSlot < input.maxAttemptsPerSlot,
    )
    .map((candidate) => candidate.scope);
}

/**
 * Rattrapage au démarrage, au retour de veille et périodiquement.
 *
 * Deux raisons indépendantes, réunies : un créneau planifié manqué (le process
 * ne tournait pas à l'heure du cron) et des données périmées au sens du
 * bandeau. Les prévisions suivent la même règle — leur cron de 12:20 tombe
 * aussi hors des heures d'allumage habituelles.
 */
async function catchUpIfStale(trigger: CatchUpTrigger): Promise<void> {
  try {
    const now = new Date();
    const sourceId = await weatherRepository.getSourceId();
    const observationSlot = lastScheduledSlot(env.WEATHER_OBSERVATION_CRON, now);
    const forecastSlot = lastScheduledSlot(env.WEATHER_FORECAST_CRON, now);

    const [
      lastObservationAt,
      forecastInfo,
      obsSuccess,
      fSuccess,
      obsRun,
      fRun,
      obsAttempts,
      fAttempts,
    ] = await Promise.all([
      weatherRepository.latestObservationAtForSource(sourceId),
      weatherRepository.forecastDataInfo(sourceId),
      weatherSyncRepository.latestSuccessfulRun('OBSERVATIONS', SYNC_SOURCE),
      weatherSyncRepository.latestSuccessfulRun('FORECASTS', SYNC_SOURCE),
      weatherSyncRepository.latestRun('OBSERVATIONS', SYNC_SOURCE),
      weatherSyncRepository.latestRun('FORECASTS', SYNC_SOURCE),
      observationSlot === null
        ? null
        : weatherSyncRepository.runsSince('OBSERVATIONS', SYNC_SOURCE, observationSlot),
      forecastSlot === null
        ? null
        : weatherSyncRepository.runsSince('FORECASTS', SYNC_SOURCE, forecastSlot),
    ]);

    const missed = missedScheduledScopes({
      now,
      observationCron: env.WEATHER_OBSERVATION_CRON,
      forecastCron: env.WEATHER_FORECAST_CRON,
      // `finishedAt` prime : un run parti à 05:59 et fini à 06:04 couvre le
      // créneau de 06:00, le relancer serait un doublon.
      lastObservationSuccessAt: obsSuccess?.finishedAt ?? obsSuccess?.startedAt ?? null,
      lastForecastSuccessAt: fSuccess?.finishedAt ?? fSuccess?.startedAt ?? null,
    });
    const stale = staleWeatherScopes({
      lastObservationAt,
      lastForecastAt: forecastInfo.lastGeneratedAt,
      observationStaleMinutes: env.WEATHER_OBSERVATION_STALE_MINUTES,
      forecastStaleHours: env.WEATHER_FORECAST_STALE_HOURS,
      now: now.getTime(),
    });

    const candidates: CatchUpCandidate[] = [
      {
        scope: 'OBSERVATIONS',
        missed: missed.includes('OBSERVATIONS'),
        stale: stale.includes('OBSERVATIONS'),
        lastAttemptAt: obsRun?.startedAt ?? null,
        attemptsSinceSlot: obsAttempts,
      },
      {
        scope: 'FORECASTS',
        missed: missed.includes('FORECASTS'),
        stale: stale.includes('FORECASTS'),
        lastAttemptAt: fRun?.startedAt ?? null,
        attemptsSinceSlot: fAttempts,
      },
    ];
    const scopes = scopesToCatchUp({
      candidates,
      now,
      minIntervalMinutes: CATCH_UP_MIN_INTERVAL_MINUTES,
      maxAttemptsPerSlot: MAX_AUTOMATIC_ATTEMPTS_PER_SLOT,
    });

    if (scopes.length === 0) return;

    logger.info(
      {
        trigger,
        missed,
        stale,
        scopes,
        attemptsSinceSlot: { observations: obsAttempts, forecasts: fAttempts },
        lastObservationAt,
        lastForecastAt: forecastInfo.lastGeneratedAt,
      },
      'Job météo : créneau manqué ou données périmées, synchronisation de rattrapage',
    );
    await weatherSyncService.runScheduled(
      scopes.length > 1 ? 'OBSERVATIONS_AND_FORECASTS' : scopes[0],
    );
  } catch (err) {
    logger.warn({ err, trigger }, 'Job météo : rattrapage ignoré (échec)');
  }
}

/**
 * Contrôle de fraîcheur en cours de fonctionnement.
 *
 * Le cron ne suffit pas : s'il échoue (429 fournisseur) ou si la machine dort à
 * son heure, plus rien ne regarde avant le prochain redémarrage. Un contrôle
 * toutes les 15 min rend le rattrapage auto-réparateur, sans dépendre d'un
 * redémarrage ni d'un cycle de veille. Les gardes de `scopesToCatchUp` (délai
 * minimal, plafond par créneau) empêchent la rafale et la consommation du
 * budget.
 */
function startFreshnessWatchdog(): void {
  const timer = setInterval(() => {
    void catchUpIfStale('périodique');
  }, CATCH_UP_CHECK_INTERVAL_MS);

  // Le contrôle ne doit pas garder le process en vie à lui seul.
  timer.unref();
}

/**
 * Détection du retour de veille.
 *
 * Le process survit à une veille S3, mais pas ses timers : pendant les heures de
 * sommeil, aucun cron ne se déclenche et les observations vieillissent en silence
 * — 11 h constatées un matin, soit 712 min, avec un bandeau rouge au réveil.
 *
 * `setInterval` est lui aussi suspendu, mais il repart à la reprise : l'écart
 * entre deux battements mesure donc directement le temps dormi. Au-delà de
 * `RESUME_DRIFT_MINUTES`, on retombe sur le rattrapage.
 *
 * Le seuil volontairement bas : un rattrapage inutile (données déjà fraîches)
 * coûte un `SELECT` sur trois tables, alors qu'un rattrapage manqué laisse le
 * bandeau rouge.
 */
function startResumeWatchdog(): void {
  let lastTickAt = Date.now();

  const timer = setInterval(() => {
    const now = Date.now();
    const driftMinutes = (now - lastTickAt) / 60_000;
    lastTickAt = now;

    if (driftMinutes < RESUME_DRIFT_MINUTES) return;

    logger.warn({ driftMinutes: Math.round(driftMinutes) }, 'Job météo : retour de veille détecté');
    void catchUpIfStale('veille');
  }, RESUME_CHECK_INTERVAL_MS);

  // Le pipeline ne doit pas garder le process en vie à lui seul.
  timer.unref();
}

export function startWeatherSyncJobs(): void {
  if (!env.ENABLE_SCHEDULED_JOBS) return;
  if (started) return;
  started = true;

  cron.schedule(env.WEATHER_OBSERVATION_CRON, () => {
    void weatherSyncService.runScheduled('OBSERVATIONS');
  });
  cron.schedule(env.WEATHER_FORECAST_CRON, () => {
    void weatherSyncService.runScheduled('FORECASTS');
  });

  void catchUpIfStale('démarrage');
  startResumeWatchdog();
  startFreshnessWatchdog();

  logger.info(
    {
      observation: env.WEATHER_OBSERVATION_CRON,
      forecast: env.WEATHER_FORECAST_CRON,
      freshnessCheckMinutes: CATCH_UP_CHECK_INTERVAL_MS / 60_000,
      maxAttemptsPerSlot: MAX_AUTOMATIC_ATTEMPTS_PER_SLOT,
    },
    'Jobs météo planifiés (ENABLE_SCHEDULED_JOBS=true)',
  );
}
