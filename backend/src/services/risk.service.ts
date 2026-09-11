import { IncomingHttpHeaders } from 'http';
import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { usersRepository } from '../repositories/users.repository';
import { eventsRepository } from '../repositories/events.repository';
import { weatherRepository } from '../repositories/weather.repository';
import { risksRepository } from '../repositories/risks.repository';
import { RiskLevel, RiskPhase, SeverityLevel } from '../types/event.types';
import {
  PriorityCommune,
  RiskAssessment,
  RiskAssessmentResult,
  RiskConfiguration,
  RiskContext,
  RiskFactors,
  RiskMapGeoJson,
  RiskMapProperties,
  RiskPresentation,
  RiskRecalculationResult,
  RiskThresholds,
  RiskWeights,
} from '../types/risk.types';
import { UserRole } from '../types/auth.types';
import { PaginatedResult } from '../types/territory.types';
import { alertsService } from './alerts.service';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const DEFAULT_NEUTRAL_WEATHER_SCORE = 50;
const DEFAULT_NEUTRAL_PROXIMITY_SCORE = 50;
const DEFAULT_NEUTRAL_VULNERABILITY_SCORE = 50;
const DEFAULT_NEUTRAL_EXPOSURE_SCORE = 50;
const EXPOSURE_MAX_POPULATION = 200_000;

// Multiplicateur d'intensité appliqué au score total quand un événement est actif.
// La sévérité de l'événement amplifie le risque : un événement EXTREME pèse plus
// lourd qu'un événement FAIBLE pour un même niveau de proximité/exposition.
const SEVERITY_INTENSITY_FACTOR: Record<SeverityLevel, number> = {
  FAIBLE: 1,
  MODEREE: 1.25,
  ELEVEE: 1.5,
  EXTREME: 2,
};

// Multiplicateur de phase : le risque varie selon le moment du cycle de vie
// AVANT = anticipation (risque modéré), PENDANT = crise (risque maximal),
// APRES = après-coup (risque diminué), RETABLISSEMENT = reprise (risque faible).
const PHASE_INTENSITY_FACTOR: Record<string, number> = {
  AVANT: 0.7,
  PENDANT: 1.0,
  APRES: 0.5,
  RETABLISSEMENT: 0.3,
};

const DEFAULT_THRESHOLDS: RiskThresholds = {
  lowThreshold: 20,
  moderateThreshold: 40,
  highThreshold: 60,
  extremeThreshold: 80,
};

const DEFAULT_WEIGHTS: RiskWeights = {
  rainWeight: 0.3,
  windWeight: 0.25,
  proximityWeight: 0.2,
  vulnerabilityWeight: 0.15,
  exposureWeight: 0.1,
};

export function scoreRain(rainfall24hMm: number | null, precipitationMm: number | null): number {
  const value = rainfall24hMm ?? precipitationMm;
  if (value === null) return DEFAULT_NEUTRAL_WEATHER_SCORE;
  if (value < 20) return 10;
  if (value < 50) return 35;
  if (value < 100) return 65;
  return 100;
}

export function scoreWind(windSpeedKmh: number | null): number {
  if (windSpeedKmh === null) return DEFAULT_NEUTRAL_WEATHER_SCORE;
  if (windSpeedKmh < 30) return 10;
  if (windSpeedKmh < 60) return 35;
  if (windSpeedKmh < 100) return 65;
  return 100;
}

export function scoreProximity(input: {
  hasEvent: boolean;
  insideArea: boolean;
  distanceKm: number | null;
  areaRadiusKm: number | null;
}): number {
  if (!input.hasEvent) return DEFAULT_NEUTRAL_PROXIMITY_SCORE;
  if (input.insideArea) return 100;

  const radius = input.areaRadiusKm;
  const distance = input.distanceKm;

  if (distance === null) return 10;

  // Radius-aware scoring: scale thresholds relative to the event's influence zone
  if (radius && radius > 0) {
    if (distance < radius * 0.3) return 90;
    if (distance < radius * 0.6) return 75;
    if (distance < radius) return 55;
    if (distance < radius * 1.5) return 35;
    if (distance < radius * 2) return 20;
    return 10;
  }

  // Fallback: fixed thresholds when no radius is available
  if (distance < 30) return 90;
  if (distance < 60) return 75;
  if (distance < 100) return 55;
  if (distance < 150) return 35;
  if (distance < 200) return 20;
  return 10;
}

export function scoreVulnerability(vulnerabilityScore: number | null): number {
  if (vulnerabilityScore === null) return DEFAULT_NEUTRAL_VULNERABILITY_SCORE;
  return Math.min(100, Math.max(0, Math.round(vulnerabilityScore)));
}

export function scoreExposure(population: number | null): number {
  if (population === null) return DEFAULT_NEUTRAL_EXPOSURE_SCORE;
  return Math.min(100, Math.max(0, Math.round((population / EXPOSURE_MAX_POPULATION) * 100)));
}

// Intensité de l'événement (severity) transformée en facteur 0-100.
// Sans événement actif, retourne le neutre pour ne pas déformer le score global.
export function scoreSeverity(severity: SeverityLevel | null, hasEvent: boolean): number {
  if (!hasEvent || severity === null) return DEFAULT_NEUTRAL_PROXIMITY_SCORE;
  switch (severity) {
    case 'FAIBLE':
      return 20;
    case 'MODEREE':
      return 45;
    case 'ELEVEE':
      return 70;
    case 'EXTREME':
      return 100;
    default:
      return DEFAULT_NEUTRAL_PROXIMITY_SCORE;
  }
}

function computeFactors(context: RiskContext, hasEvent: boolean): RiskFactors {
  return {
    rainScore: scoreRain(context.rainfall24hMm, context.precipitationMm),
    windScore: scoreWind(context.windSpeedKmh),
    proximityScore: scoreProximity({
      hasEvent,
      insideArea: context.insideArea,
      distanceKm: context.distanceKm,
      areaRadiusKm: context.areaRadiusKm,
    }),
    vulnerabilityScore: scoreVulnerability(context.vulnerabilityScore),
    exposureScore: scoreExposure(context.population),
  };
}

export function presentationFor(score: number, thresholds: RiskThresholds): RiskPresentation {
  if (score >= thresholds.extremeThreshold) {
    return { riskLevel: 'EXTREME', displayLevel: 'EXTRÊME', color: '#DC2626' };
  }
  if (score >= thresholds.highThreshold) {
    return { riskLevel: 'ELEVE', displayLevel: 'IMPORTANT', color: '#F97316' };
  }
  if (score >= thresholds.moderateThreshold) {
    return { riskLevel: 'MODERE', displayLevel: 'VIGILANCE', color: '#EAB308' };
  }
  if (score >= thresholds.lowThreshold) {
    return { riskLevel: 'MODERE', displayLevel: 'FAIBLE', color: '#22C55E' };
  }
  return { riskLevel: 'FAIBLE', displayLevel: 'SUIVI', color: '#3B82F6' };
}

export function buildExplanation(factors: RiskFactors, severity?: SeverityLevel | null): string[] {
  const lines: string[] = [];
  if (factors.rainScore >= 65) {
    lines.push('Les précipitations prévues dépassent le seuil critique.');
  } else if (factors.rainScore >= 35 && factors.rainScore !== 50) {
    lines.push('Des précipitations significatives sont attendues.');
  }
  if (factors.windScore >= 65) {
    lines.push('La vitesse du vent dépasse le seuil de danger.');
  } else if (factors.windScore >= 35 && factors.windScore !== 50) {
    lines.push('Des rafales de vent significatives sont prévues.');
  }
  if (factors.proximityScore >= 85) {
    lines.push("La commune se situe à proximité de la trajectoire ou dans la zone d'influence.");
  } else if (factors.proximityScore >= 60) {
    lines.push("La commune est modérément proche de la zone d'influence.");
  }
  if (factors.vulnerabilityScore >= 60) {
    lines.push('Le niveau de vulnérabilité enregistré augmente le risque.');
  }
  if (factors.exposureScore >= 60) {
    lines.push('La population exposée est importante.');
  }
  if (severity !== undefined && severity !== null && severity !== 'FAIBLE') {
    const intensity =
      severity === 'EXTREME'
        ? "L'intensité exceptionnelle de l'événement amplifie fortement le risque."
        : severity === 'ELEVEE'
          ? "La forte intensité de l'événement amplifie le risque."
          : "L'intensité modérée de l'événement accentue le risque.";
    lines.push(intensity);
  }
  if (lines.length === 0) {
    lines.push('Aucun facteur dommageable majeur identifié.');
  }
  return lines;
}

export function computeRiskAssessment(
  context: RiskContext,
  config: { weights: RiskWeights; thresholds: RiskThresholds },
  assessedAt: string,
  hasEvent = true,
  phase?: RiskPhase,
): RiskAssessmentResult {
  const factors = computeFactors(context, hasEvent);

  const totalScore =
    config.weights.rainWeight * factors.rainScore +
    config.weights.windWeight * factors.windScore +
    config.weights.proximityWeight * factors.proximityScore +
    config.weights.vulnerabilityWeight * factors.vulnerabilityScore +
    config.weights.exposureWeight * factors.exposureScore;

  const severity = hasEvent ? context.severity : null;
  const severityIntensity =
    severity === null || severity === undefined ? 1 : SEVERITY_INTENSITY_FACTOR[severity];
  const phaseIntensity = phase ? (PHASE_INTENSITY_FACTOR[phase] ?? 1) : 1;

  const riskScore = Math.min(100, Math.round(totalScore * severityIntensity * phaseIntensity));
  const presentation = presentationFor(riskScore, config.thresholds);

  return {
    riskScore,
    ...presentation,
    factors,
    explanation: buildExplanation(factors, severity),
    assessedAt,
  };
}

function asConfiguration(row: RiskConfiguration | null): {
  weights: RiskWeights;
  thresholds: RiskThresholds;
} {
  if (!row) {
    return { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS };
  }
  return {
    weights: {
      rainWeight: row.rainWeight,
      windWeight: row.windWeight,
      proximityWeight: row.proximityWeight,
      vulnerabilityWeight: row.vulnerabilityWeight,
      exposureWeight: row.exposureWeight,
    },
    thresholds: {
      lowThreshold: row.lowThreshold,
      moderateThreshold: row.moderateThreshold,
      highThreshold: row.highThreshold,
      extremeThreshold: row.extremeThreshold,
    },
  };
}

function enrichAssessment(assessment: RiskAssessment, thresholds: RiskThresholds): RiskAssessment {
  const presentation = presentationFor(assessment.riskScore, thresholds);
  return { ...assessment, ...presentation };
}

export const risksService = {
  async listConfigurations(): Promise<RiskConfiguration[]> {
    return risksRepository.listConfigurations();
  },

  async getConfiguration(id: string): Promise<RiskConfiguration> {
    const configuration = await risksRepository.findConfiguration(id);
    if (!configuration) {
      throw AppError.notFound('Configuration de risque introuvable');
    }
    return configuration;
  },

  async createConfiguration(
    input: {
      name: string;
      rainWeight: number;
      windWeight: number;
      proximityWeight: number;
      vulnerabilityWeight: number;
      exposureWeight: number;
      lowThreshold: number;
      moderateThreshold: number;
      highThreshold: number;
      extremeThreshold: number;
      isActive: boolean;
    },
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<RiskConfiguration> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut créer une configuration de risque');
    }

    const existing = await risksRepository.listConfigurations();
    if (existing.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
      throw AppError.conflict('Une configuration avec ce nom existe déjà');
    }

    const configuration = await risksRepository.createConfiguration(input);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'RISK_CONFIGURATION_CREATED',
      entityType: 'risk_configuration',
      entityId: configuration.id,
      newValue: { name: configuration.name },
      ipAddress: getIp(req),
    });

    return configuration;
  },

  async updateConfiguration(
    id: string,
    input: Partial<{
      name: string;
      rainWeight: number;
      windWeight: number;
      proximityWeight: number;
      vulnerabilityWeight: number;
      exposureWeight: number;
      lowThreshold: number;
      moderateThreshold: number;
      highThreshold: number;
      extremeThreshold: number;
      isActive: boolean;
    }>,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<RiskConfiguration> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut modifier une configuration de risque');
    }

    const existing = await risksRepository.findConfiguration(id);
    if (!existing) {
      throw AppError.notFound('Configuration de risque introuvable');
    }

    const updated = await risksRepository.updateConfiguration(id, input);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'RISK_CONFIGURATION_UPDATED',
      entityType: 'risk_configuration',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: updated ? { name: updated.name } : undefined,
      ipAddress: getIp(req),
    });

    return updated!;
  },

  async recalculate(
    input: {
      eventId?: string;
      communeIds?: string[];
      districtId?: string;
      phase: RiskPhase;
    },
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<RiskRecalculationResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent recalculer les risques');
    }

    if (input.eventId) {
      const event = await eventsRepository.findById(input.eventId);
      if (!event) {
        throw AppError.notFound('Événement introuvable');
      }
    }

    const communeIds = await risksRepository.resolveTargetCommunes({
      communeIds: input.communeIds,
      districtId: input.districtId,
      eventId: input.eventId,
    });

    return this.runRecalculation(communeIds, input.eventId ?? null, input.phase, actor, req);
  },

  async recalculateEvent(
    eventId: string,
    phase: RiskPhase,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<RiskRecalculationResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent recalculer les risques');
    }

    const event = await eventsRepository.findById(eventId);
    if (!event) {
      throw AppError.notFound('Événement introuvable');
    }

    const communeIds = await risksRepository.resolveTargetCommunes({
      eventId,
    });
    if (communeIds.length === 0) {
      throw AppError.badRequest('Aucune commune exposée pour cet événement');
    }

    return this.runRecalculation(communeIds, eventId, phase, actor, req);
  },

  async runRecalculation(
    communeIds: string[],
    eventId: string | null,
    phase: RiskPhase,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<RiskRecalculationResult> {
    if (communeIds.length === 0) {
      throw AppError.badRequest('Aucune commune cible pour le recalcul des risques');
    }

    const configuration = await risksRepository.getActiveConfiguration();
    const { weights, thresholds } = asConfiguration(configuration);

    const contexts = await risksRepository.getRiskContexts({
      communeIds,
      eventId,
    });

    const assessedAt = new Date().toISOString();

    const rows = contexts.map((context) => {
      const result = computeRiskAssessment(
        context,
        { weights, thresholds },
        assessedAt,
        eventId !== null,
        phase,
      );
      return {
        communeId: context.communeId,
        eventId,
        configurationId: configuration ? configuration.id : null,
        phase,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        factors: result.factors,
        explanation: result.explanation,
        assessedAt,
      };
    });

    const saved = await risksRepository.saveAssessments(rows);
    const assessments = saved.map((a) => enrichAssessment(a, thresholds));

    logger.info({ eventId, phase, total: assessments.length }, 'Recalcul des risques terminé');

    await alertsService.createRiskAlertIfThresholdExceeded(saved);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'RISK_RECALCULATED',
      entityType: 'risk_assessment',
      newValue: {
        eventId: eventId ?? null,
        phase,
        totalCommunes: assessments.length,
      },
      ipAddress: getIp(req),
    });

    return { phase, totalCommunes: assessments.length, assessments };
  },

  async communeRisks(
    communeId: string,
    query: { eventId?: string; latest: boolean },
  ): Promise<RiskAssessment | PaginatedResult<RiskAssessment> | null> {
    const exists = await weatherRepository.verifyCommuneExists(communeId);
    if (!exists) {
      throw AppError.notFound('Commune introuvable');
    }

    const configuration = await risksRepository.getActiveConfiguration();
    const { thresholds } = asConfiguration(configuration);

    if (query.latest) {
      const assessment = await risksRepository.latestForCommune(communeId, query.eventId);
      return assessment ? enrichAssessment(assessment, thresholds) : null;
    }

    const result = await risksRepository.historyForCommune(communeId, query.eventId, 1, 20);
    return {
      items: result.items.map((a) => enrichAssessment(a, thresholds)),
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  },

  async priorityCommunes(query: {
    eventId?: string;
    districtId?: string;
    riskLevel?: RiskLevel;
    limit: number;
  }): Promise<PriorityCommune[]> {
    const configuration = await risksRepository.getActiveConfiguration();
    const { thresholds } = asConfiguration(configuration);

    const rows = await risksRepository.priorityCommunes(query);
    return rows.map((r) => {
      const presentation = presentationFor(r.riskScore, thresholds);
      return { ...r, ...presentation };
    });
  },

  async mapLayer(query: {
    districtId?: string;
    eventId?: string;
    riskLevel?: RiskLevel;
    phase?: RiskPhase;
  }): Promise<RiskMapGeoJson> {
    const configuration = await risksRepository.getActiveConfiguration();
    const { thresholds } = asConfiguration(configuration);

    const geojson = await risksRepository.riskMapLayer(query);
    return {
      type: 'FeatureCollection',
      features: geojson.features.map((feature) => {
        const score = feature.properties.riskScore;
        const presentation = presentationFor(score, thresholds);
        const properties: RiskMapProperties = {
          ...feature.properties,
          displayLevel: presentation.displayLevel,
          color: presentation.color,
        };
        return { ...feature, properties };
      }),
    };
  },
};
