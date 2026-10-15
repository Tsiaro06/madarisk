import { env } from '../config/env';
import { logger } from '../config/logger';
import { cycloneRepository } from '../repositories/cyclone.repository';
import { eventsRepository } from '../repositories/events.repository';
import { getCycloneTrackProvider, getCycloneWatchProvider } from './cyclone/cyclone-provider';
import { buildIngestionPlans, parseWatchBbox } from './cyclone/cyclone.logic';
import { cycloneCommuneColoringService } from './cyclone-commune-coloring.service';
import { automaticAlertService } from './automatic-alerts.service';
import type { CycloneIngestionPlan, CycloneSyncSummary } from '../types/cyclone.types';
import { AppError } from '../utils/app-error';

const HISTORY_SOURCE = 'CYCLONE_SYNC';
const SOURCES = 'IBTRACS+GDACS';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Description humaine stockée sur l'événement : jamais de donnée inventée. */
function describePlan(plan: CycloneIngestionPlan): string {
  const wind =
    plan.maxWindKmh === null
      ? 'vent soutenu maximal non publié'
      : `vent soutenu maximal documenté ${Math.round(plan.maxWindKmh)} km/h`;
  const alert = plan.alertLevel ? `, alerte GDACS ${plan.alertLevel}` : '';
  const last = plan.lastObservedAt
    ? `dernier point observé ${plan.lastObservedAt}`
    : 'aucun point horodaté';
  return (
    `Cyclone ${plan.name} suivi automatiquement (${plan.sourceName}${alert}). ` +
    `${plan.points.length} point(s) de trajectoire, ${wind}, ${last}.`
  );
}

/**
 * Retrouve l'événement à mettre à jour : par identité source d'abord (stable
 * entre les cycles, y compris quand un renommage RSMC change le nom), puis par
 * code d'événement lisible, sinon null (création).
 */
async function resolveEventId(plan: CycloneIngestionPlan): Promise<string | null> {
  const direct = await cycloneRepository.findEventIdForSource(plan.source, plan.sourceSystemId);
  if (direct) return direct;

  for (const link of plan.linkedSources) {
    const linked = await cycloneRepository.findEventIdForSource(link.source, link.sourceSystemId);
    if (linked) return linked;
  }

  const byCode = await eventsRepository.findByCode(plan.eventCode);
  return byCode?.id ?? null;
}

async function persistPlan(
  plan: CycloneIngestionPlan,
): Promise<{ created: boolean; points: number; eventId: string }> {
  const description = describePlan(plan);
  let eventId = await resolveEventId(plan);
  const created = eventId === null;

  if (eventId === null) {
    eventId = await cycloneRepository.createCycloneEvent({
      eventCode: plan.eventCode,
      name: plan.name,
      status: plan.status,
      severity: plan.severity,
      description,
      sourceName: plan.sourceName,
      sourceUrl: plan.sourceUrl,
      startedAt: plan.startedAt,
    });
    await cycloneRepository.writeStatusHistory({
      eventId,
      fromStatus: null,
      toStatus: plan.status,
      reason: 'Détection automatique (veille cyclone)',
      source: HISTORY_SOURCE,
    });
  } else {
    const { previousStatus } = await cycloneRepository.updateCycloneEvent(eventId, {
      name: plan.name,
      status: plan.status,
      severity: plan.severity,
      description,
      sourceName: plan.sourceName,
      sourceUrl: plan.sourceUrl,
      startedAt: plan.startedAt,
    });
    if (previousStatus !== plan.status) {
      await cycloneRepository.writeStatusHistory({
        eventId,
        fromStatus: previousStatus,
        toStatus: plan.status,
        reason: 'Évolution automatique (veille cyclone)',
        source: HISTORY_SOURCE,
      });
    }
  }

  for (const link of plan.linkedSources) {
    await cycloneRepository.linkSystem({
      eventId,
      source: link.source,
      sourceSystemId: link.sourceSystemId,
      name: plan.name,
      basin: plan.basin,
      season: plan.season,
      sourceUrl: plan.sourceUrl,
      alertLevel: plan.alertLevel,
      maxWindKmh: plan.maxWindKmh,
      rawMetadata: plan.rawMetadata,
    });
  }

  const points = await cycloneRepository.upsertObservedTrackPoints(eventId, plan.points);
  return { created, points, eventId };
}

interface DerivedOutcome {
  colored: boolean;
  affectedCommunes: number;
  alertsCreated: number;
}

/**
 * Produits dérivés d'un cyclone ingéré, calculés APRÈS la persistance de sa
 * trajectoire : coloration communale (salle de crise) puis alertes automatiques
 * pour les communes encore dans le champ de vent. Isolé pour qu'un échec ici
 * n'invalide jamais l'ingestion déjà persistée.
 */
async function applyDerivedProducts(eventId: string): Promise<DerivedOutcome> {
  const coloring = await cycloneCommuneColoringService.applyToEvent(eventId);
  if (!coloring.colored || coloring.affectedCommuneIds.length === 0) {
    return { colored: coloring.colored, affectedCommunes: 0, alertsCreated: 0 };
  }

  // Une alerte par commune dans le champ de vent (JAUNE/ROUGE) : le reste de la
  // chaîne (déduplication, brouillon/publication) est porté par le service dédié.
  const result = await automaticAlertService.generateForEvent({
    eventId,
    trigger: 'SYNC',
    communeIds: coloring.affectedCommuneIds,
  });

  return {
    colored: true,
    affectedCommunes: coloring.affectedCommuneIds.length,
    alertsCreated: result.created,
  };
}

export const cycloneSyncService = {
  /**
   * Un cycle : veille GDACS + trajectoire/rayons IBTrACS -> événements et points
   * de trajectoire. Idempotent (rejouable sans doublon) et tolérant : si une
   * source tombe, l'autre est quand même ingérée.
   */
  async run(trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<CycloneSyncSummary> {
    const startedAt = Date.now();
    const watch = parseWatchBbox(env.CYCLONE_WATCH_BBOX);
    const runId = await cycloneRepository.startRun(trigger, SOURCES);

    const errors: string[] = [];

    try {
      const [trackedResult, watchedResult] = await Promise.allSettled([
        getCycloneTrackProvider().listActiveSystems(watch),
        getCycloneWatchProvider().listWatchedSystems(watch),
      ]);

      if (trackedResult.status === 'rejected') {
        errors.push(`IBTrACS : ${messageOf(trackedResult.reason)}`);
        logger.warn({ err: trackedResult.reason }, 'Cyclone : trajectoire IBTrACS indisponible');
      }
      if (watchedResult.status === 'rejected') {
        errors.push(`GDACS : ${messageOf(watchedResult.reason)}`);
        logger.warn({ err: watchedResult.reason }, 'Cyclone : veille GDACS indisponible');
      }

      // Les deux sources muettes : c'est une panne, pas un bassin calme.
      if (trackedResult.status === 'rejected' && watchedResult.status === 'rejected') {
        throw new AppError(
          'Aucune source cyclone disponible (IBTrACS et GDACS injoignables)',
          502,
          true,
        );
      }

      const tracked = trackedResult.status === 'fulfilled' ? trackedResult.value : [];
      const watched = watchedResult.status === 'fulfilled' ? watchedResult.value : [];
      const systemsDetected = tracked.length + watched.length;

      const plans = buildIngestionPlans({
        tracked,
        watched,
        now: Date.now(),
        activeWindowHours: env.CYCLONE_ACTIVE_WINDOW_HOURS,
      });

      let systemsTracked = 0;
      let eventsCreated = 0;
      let eventsUpdated = 0;
      let trackPoints = 0;
      let coloredEvents = 0;
      let coloredCommunes = 0;
      let alertsCreated = 0;

      for (const plan of plans) {
        let outcome: { created: boolean; points: number; eventId: string };
        try {
          outcome = await persistPlan(plan);
        } catch (err) {
          errors.push(`${plan.name} : ${messageOf(err)}`);
          logger.error(
            { err, system: plan.sourceSystemId },
            'Cyclone : échec de persistance d’un système (les autres sont conservés)',
          );
          continue;
        }

        systemsTracked += 1;
        if (outcome.created) eventsCreated += 1;
        else eventsUpdated += 1;
        trackPoints += outcome.points;

        // Produits dérivés : un échec de coloration/alerte n'annule pas
        // l'ingestion, mais fait finir le cycle en PARTIAL (remonté dans errors).
        try {
          const derived = await applyDerivedProducts(outcome.eventId);
          if (derived.colored) coloredEvents += 1;
          coloredCommunes += derived.affectedCommunes;
          alertsCreated += derived.alertsCreated;
        } catch (err) {
          errors.push(`coloration ${plan.name} : ${messageOf(err)}`);
          logger.error(
            { err, system: plan.sourceSystemId },
            'Cyclone : échec de la coloration communale (ingestion conservée)',
          );
        }
      }

      await cycloneRepository.finishRun(runId, {
        systemsDetected,
        systemsTracked,
        eventsCreated,
        eventsUpdated,
        trackPoints,
        errorsCount: errors.length,
        errorMessage: errors.length > 0 ? errors.join(' | ') : null,
        details: {
          watch,
          tracked: tracked.length,
          watched: watched.length,
          coloredEvents,
          coloredCommunes,
          alertsCreated,
        },
      });

      const summary: CycloneSyncSummary = {
        runId,
        systemsDetected,
        systemsTracked,
        eventsCreated,
        eventsUpdated,
        trackPoints,
        coloredEvents,
        coloredCommunes,
        alertsCreated,
        durationMs: Date.now() - startedAt,
      };

      logger.info(
        { ...summary, errorsCount: errors.length },
        'Cyclone : cycle de synchronisation terminé',
      );
      return summary;
    } catch (err) {
      await cycloneRepository.failRun(runId, err);
      throw err;
    }
  },
};
