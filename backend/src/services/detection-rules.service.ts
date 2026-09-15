import {
  detectionRulesRepository,
  DetectionRulesFilters,
} from '../repositories/detection-rules.repository';
import { HazardDetectionRule } from '../types/automation.types';
import { AppError } from '../utils/app-error';

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
};
