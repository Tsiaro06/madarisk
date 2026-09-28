import { Request, Response } from 'express';
import { demoScenarioService } from '../services/demo-scenario.service';
import { successResponse } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import type { DemoStepBody } from '../validators/demo.validator';

export const demoController = {
  async getScenario(_req: Request, res: Response): Promise<void> {
    const state = await demoScenarioService.getState();
    res
      .status(200)
      .json(successResponse(state, 'Scénario de démonstration (mode démo uniquement).'));
  },

  async setStep(req: Request, res: Response): Promise<void> {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as DemoStepBody | undefined;
    if (!body) throw AppError.badRequest('Étape de démonstration manquante.');

    const state = await demoScenarioService.goToStep(body.step);
    res.status(200).json(successResponse(state, `Étape de démonstration : ${body.step}.`));
  },

  async reset(req: Request, res: Response): Promise<void> {
    if (!req.user) throw AppError.unauthorized();
    const state = await demoScenarioService.reset();
    res.status(200).json(successResponse(state, 'Démonstration réinitialisée.'));
  },
};
