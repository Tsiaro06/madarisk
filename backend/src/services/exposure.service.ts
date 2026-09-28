import { env } from '../config/env';
import { logger } from '../config/logger';
import { eventsRepository } from '../repositories/events.repository';
import { exposureRepository } from '../repositories/exposure.repository';
import { AppError } from '../utils/app-error';
import { risksService } from './risk.service';
import { EventStatus, RiskLevel, RiskPhase, SeverityLevel } from '../types/event.types';
import {
  AreaSourceType,
  ExposureRecalculationResult,
  ExposureTrigger,
} from '../types/exposure.types';
import { GeoJsonGeometry } from '../types/territory.types';

const PHASE_FOR_STATUS: Record<EventStatus, RiskPhase> = {
  BROUILLON: 'AVANT',
  PREVISION: 'AVANT',
  ACTIF: 'PENDANT',
  SUIVI: 'APRES',
  CLOTURE: 'APRES',
};

const RISK_LEVEL_FOR_SEVERITY: Record<SeverityLevel, RiskLevel> = {
  FAIBLE: 'FAIBLE',
  MODEREE: 'MODERE',
  ELEVEE: 'ELEVE',
  EXTREME: 'EXTREME',
};

export const exposureService = {
  /**
   * Calcule (idempotent) les zones d'influence, les communes exposées et les
   * scores de risque d'un événement à partir de données réelles :
   *  - communes au-dessus du seuil (détection) -> zone ESTIMATION (tampon),
   *  - trajectoire officielle (> 2 points) -> zone TRAJECTOIRE,
   *  - moteur de risque existant pour l'évaluation.
   */
  async computeForEvent(
    eventId: string,
    opts: { trigger?: ExposureTrigger; bufferRadiusKm?: number; trajectoryRadiusKm?: number } = {},
  ): Promise<ExposureRecalculationResult> {
    const trigger = opts.trigger ?? 'MANUAL';
    const event = await eventsRepository.findById(eventId);
    if (!event) {
      throw AppError.notFound('Événement introuvable');
    }

    const runId = await exposureRepository.createExposureRun(eventId, trigger);
    const phase = PHASE_FOR_STATUS[event.status];
    const riskLevel = RISK_LEVEL_FOR_SEVERITY[event.severity];
    const bufferRadiusKm = opts.bufferRadiusKm ?? env.EXPOSURE_BUFFER_RADIUS_KM;
    const trajectoryRadiusKm = opts.trajectoryRadiusKm ?? env.EXPOSURE_TRAJECTORY_RADIUS_KM;

    const affected = await exposureRepository.listDetectionCommunes(eventId);
    const trackPoints = await exposureRepository.trackPointCount(eventId);

    let areasCreated = 0;
    let areasSkipped = 0;

    // Zone ESTIMATION : tampon autour des communes au-dessus du seuil.
    if (affected.length > 0) {
      const geometry = await exposureRepository.estimationZoneGeometry(
        affected.map((c) => c.communeId),
        bufferRadiusKm,
      );
      if (geometry) {
        const result = await this.createArea(eventId, {
          phase,
          riskLevel,
          radiusKm: bufferRadiusKm,
          sourceType: 'ESTIMATION',
          isEstimate: true,
          description:
            'Zone estimée par le système : tampon autour des communes dont le seuil est dépassé',
          geometry,
        });
        areasCreated += result.created ? 1 : 0;
        areasSkipped += result.created ? 0 : 1;
      }
    }

    // Zone TRAJECTOIRE : tampon calculé autour de la trajectoire officielle.
    if (trackPoints >= 2) {
      const geometry = await exposureRepository.trajectoryZoneGeometry(eventId, trajectoryRadiusKm);
      if (geometry) {
        const result = await this.createArea(eventId, {
          phase,
          riskLevel,
          radiusKm: trajectoryRadiusKm,
          sourceType: 'TRAJECTOIRE',
          isEstimate: true,
          description:
            'Zone calculée autour de la trajectoire officielle (rayon par défaut, aucun rayon officiel fourni)',
          geometry,
        });
        areasCreated += result.created ? 1 : 0;
        areasSkipped += result.created ? 0 : 1;
      }
    }

    if (areasCreated === 0 && areasSkipped === 0 && affected.length === 0) {
      // Aucune donnée exploitable (ni seuils, ni zone) : rien à exposer.
      await exposureRepository.finishExposureRun(runId, { areasCreated: 0, communesUpserted: 0 });
      return {
        eventId,
        trigger,
        areasCreated: 0,
        areasSkipped: 0,
        communesUpserted: 0,
        communesExposed: 0,
        riskAssessed: 0,
        runId,
      };
    }

    const exposure = await exposureRepository.computeExposure(eventId);

    let riskAssessed = 0;
    if (exposure.communesExposed > 0) {
      riskAssessed = await risksService.assessExposedCommunes(eventId, phase);
    }

    await exposureRepository.finishExposureRun(runId, {
      areasCreated,
      communesUpserted: exposure.communesUpserted,
    });

    logger.info(
      {
        eventId,
        trigger,
        phase,
        areasCreated,
        areasSkipped,
        communesExposed: exposure.communesExposed,
        riskAssessed,
      },
      'Exposition et risques recalculés automatiquement',
    );

    return {
      eventId,
      trigger,
      areasCreated,
      areasSkipped,
      communesUpserted: exposure.communesUpserted,
      communesExposed: exposure.communesExposed,
      riskAssessed,
      runId,
    };
  },

  /** Recalcule l'exposition et les risques pour tous les événements actifs. */
  async recomputeActiveEvents(trigger: 'SYNC'): Promise<number> {
    const eventIds = await exposureRepository.activeEventIds();
    let recomputed = 0;
    for (const eventId of eventIds) {
      try {
        await this.computeForEvent(eventId, { trigger });
        recomputed += 1;
      } catch (err) {
        logger.warn({ err, eventId }, 'Recalcul automatique de l exposition ignoré');
      }
    }
    return recomputed;
  },

  /** Insère une zone d'influence automatique (recycle la précédente si identique). */
  async createArea(
    eventId: string,
    data: {
      phase: RiskPhase;
      riskLevel: RiskLevel;
      radiusKm: number;
      sourceType: AreaSourceType;
      isEstimate: boolean;
      description: string;
      geometry: GeoJsonGeometry;
    },
  ): Promise<{ id: string | null; created: boolean }> {
    return exposureRepository.createOrRefreshArea({ ...data, eventId });
  },
};
