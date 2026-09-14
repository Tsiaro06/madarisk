import { Request, Response } from 'express';
import { successResponse } from '../utils/api-response';
import { detectionRulesService } from '../services/detection-rules.service';
import type { ListDetectionRulesQuery } from '../validators/detection-rules.validator';

interface IdParams {
  id: string;
}

export const detectionRulesController = {
  listRules: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListDetectionRulesQuery | undefined;
    const rules = await detectionRulesService.listRules({
      isActive: query?.isActive,
      hazardType: query?.hazardType,
      metric: query?.metric,
    });
    res.status(200).json(successResponse(rules, 'Règles de détection'));
  },

  getRule: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as IdParams;
    const rule = await detectionRulesService.getRuleById(id);
    res.status(200).json(successResponse(rule, 'Règle de détection'));
  },
};