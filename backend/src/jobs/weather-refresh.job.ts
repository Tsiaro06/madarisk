import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository } from '../repositories/weather.repository';
import { weatherSyncService } from '../services/weather-sync.service';
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
 * Périmètres à resynchroniser, décision pure pour être testable : le reste du
 * fichier dépend de la base et de l'horloge.
 *
 * Le seuil est celui du bandeau du monitoring : dès que la fraîcheur affichée
 * bascule en STALE, on relance. Au-delà, le rattrapage se déclencherait à
 * chaque `tsx watch` en développement.
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

/**
 * Rattrapage après un démarrage de processus ou un retour de veille.
 *
 * Le backend s'arrête facilement (veille machine, `tsx watch`, coupure) : les
 * observations restaient alors figées à la dernière exécution réussie et le
 * bandeau annonçait cette ancienneté — « 31 h » — pendant tout le cycle de 6 h
 * qui suivait, alors qu'un simple relancement de la synchronisation suffisait.
 *
 * Les deux périmètres sont examinés : après une longue veille, les prévisions
 * (périodicité 24 h, seuil 26 h) sont tout aussi périmées que les observations
 * (périodicité 6 h, seuil 8 h), et les laisser au cron suivant les maintenait en
 * STALE pour des heures.
 */
async function catchUpIfStale(trigger: 'démarrage' | 'veille'): Promise<void> {
  try {
    const sourceId = await weatherRepository.getSourceId();
    const [lastObservationAt, forecastInfo] = await Promise.all([
      weatherRepository.latestObservationAtForSource(sourceId),
      weatherRepository.forecastDataInfo(sourceId),
    ]);

    const stale = staleWeatherScopes({
      lastObservationAt,
      lastForecastAt: forecastInfo.lastGeneratedAt,
      observationStaleMinutes: env.WEATHER_OBSERVATION_STALE_MINUTES,
      forecastStaleHours: env.WEATHER_FORECAST_STALE_HOURS,
      now: Date.now(),
    });

    if (stale.length === 0) return;

    logger.info(
      { trigger, stale, lastObservationAt, lastForecastAt: forecastInfo.lastGeneratedAt },
      'Job météo : données périmées, synchronisation de rattrapage',
    );
    await weatherSyncService.runScheduled(
      stale.length > 1 ? 'OBSERVATIONS_AND_FORECASTS' : stale[0],
    );
  } catch (err) {
    logger.warn({ err, trigger }, 'Job météo : rattrapage ignoré (échec)');
  }
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
 * coûte un `SELECT` sur deux tables, alors qu'un rattrapage manqué laisse le
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

  logger.info(
    { observation: env.WEATHER_OBSERVATION_CRON, forecast: env.WEATHER_FORECAST_CRON },
    'Jobs météo planifiés (ENABLE_SCHEDULED_JOBS=true)',
  );
}
