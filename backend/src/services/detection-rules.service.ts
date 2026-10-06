import type { IncomingHttpHeaders } from 'node:http';
import {
  detectionRulesRepository,
  DetectionRulesFilters,
} from '../repositories/detection-rules.repository';
import { usersRepository } from '../repositories/users.repository';
import { HazardDetectionRule, SeverityRule } from '../types/automation.types';
import { AppError } from '../utils/app-error';
import type {
  CreateDetectionRuleInput,
  UpdateDetectionRuleInput,
} from '../validators/detection-rules.validator';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export const detectionRulesService = {
  /**
   * Service typé de lecture des règles actives (le moteur de détection
   * s'appuiera uniquement sur cette méthode pour évaluer les aléas).
   */
  async getActiveRules(): Promise<HazardDetectionRule[]> {
    return detectionRulesRepository.listRules({ isActive: true });
  },

  async listRules(filters?: DetectionRulesFilters): Promise<HazardDetectionRule[]> {
    return detectionRulesRepository.listRules(filters);
  },

  async getRuleById(id: string): Promise<HazardDetectionRule> {
    const rule = await detectionRulesRepository.findRuleById(id);
    if (!rule) {
      throw AppError.notFound('Règle de détection introuvable');
    }
    return rule;
  },

  async createRule(
    input: CreateDetectionRuleInput,
    actor: { id: string; role: string },
    req: RequestContext,
  ): Promise<HazardDetectionRule> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut créer une règle de détection');
    }

    const rule = await detectionRulesRepository.createRule(
      {
        hazardType: input.hazardType,
        metric: input.metric,
        operator: input.operator,
        threshold: input.threshold,
        thresholdMax: input.thresholdMax,
        durationMinutes: input.durationMinutes,
        aggregationWindowMinutes: input.aggregationWindowMinutes,
        forecastHorizonHours: input.forecastHorizonHours,
        severityRules: input.severityRules as SeverityRule[],
        isActive: input.isActive,
        regionId: input.regionId,
        districtId: input.districtId,
        communeId: input.communeId,
      },
      actor.id,
    );

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'DETECTION_RULE_CREATED',
      entityType: 'hazard_detection_rule',
      entityId: rule.id,
      newValue: { metric: rule.metric, hazardType: rule.hazardType, threshold: rule.threshold },
      ipAddress: getIp(req),
    });

    return rule;
  },

  async updateRule(
    id: string,
    input: UpdateDetectionRuleInput,
    actor: { id: string; role: string },
    req: RequestContext,
  ): Promise<HazardDetectionRule> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut modifier une règle de détection');
    }

    const existing = await detectionRulesRepository.findRuleById(id);
    if (!existing) {
      throw AppError.notFound('Règle de détection introuvable');
    }

    const updated = await detectionRulesRepository.updateRule(id, {
      ...input,
      severityRules: input.severityRules as SeverityRule[] | undefined,
    });
    if (!updated) {
      throw AppError.notFound('Règle de détection introuvable');
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'DETECTION_RULE_UPDATED',
      entityType: 'hazard_detection_rule',
      entityId: id,
      oldValue: { threshold: existing.threshold, isActive: existing.isActive },
      newValue: { threshold: updated.threshold, isActive: updated.isActive },
      ipAddress: getIp(req),
    });

    return updated;
  },

  async deleteRule(
    id: string,
    actor: { id: string; role: string },
    req: RequestContext,
  ): Promise<void> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut supprimer une règle de détection');
    }

    const existing = await detectionRulesRepository.findRuleById(id);
    if (!existing) {
      throw AppError.notFound('Règle de détection introuvable');
    }

    await detectionRulesRepository.deleteRule(id);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'DETECTION_RULE_DELETED',
      entityType: 'hazard_detection_rule',
      entityId: id,
      oldValue: { metric: existing.metric, hazardType: existing.hazardType },
      ipAddress: getIp(req),
    });
  },
};
