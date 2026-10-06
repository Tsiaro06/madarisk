import { Request, Response } from 'express';
import { successResponse } from '../utils/api-response';
import { detectionRulesService } from '../services/detection-rules.service';
import { AppError } from '../utils/app-error';
import type {
  CreateDetectionRuleInput,
  ListDetectionRulesQuery,
  UpdateDetectionRuleInput,
} from '../validators/detection-rules.validator';

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

  createRule: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CreateDetectionRuleInput;
    const rule = await detectionRulesService.createRule(body, req.user, req);
    res.status(201).json(successResponse(rule, 'Règle de détection créée'));
  },

  updateRule: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as IdParams;
    const body = req.validatedBody as UpdateDetectionRuleInput;
    const rule = await detectionRulesService.updateRule(id, body, req.user, req);
    res.status(200).json(successResponse(rule, 'Règle de détection mise à jour'));
  },

  deleteRule: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as IdParams;
    await detectionRulesService.deleteRule(id, req.user, req);
    res.status(204).send();
  },
};
