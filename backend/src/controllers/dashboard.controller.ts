import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { successResponse } from '../utils/api-response';
import { AppError } from '../utils/app-error';

export const dashboardController = {
  summary: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const summary = await dashboardService.summary(req.user);
    res.status(200).json(successResponse(summary, 'Résumé du tableau de bord'));
  },

  riskDistribution: async (_req: Request, res: Response): Promise<void> => {
    const distribution = await dashboardService.riskDistribution();
    res
      .status(200)
      .json(successResponse(distribution, 'Répartition des communes par niveau de risque'));
  },

  eventsTimeline: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as { dateFrom?: Date; dateTo?: Date };
    const timeline = await dashboardService.eventsTimeline(query);
    res.status(200).json(successResponse(timeline, 'Chronologie des événements'));
  },

  priorityCommunes: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as {
      eventId?: string;
      districtId?: string;
      limit: number;
    };
    const communes = await dashboardService.priorityCommunes(query);
    res.status(200).json(successResponse(communes, 'Communes prioritaires du tableau de bord'));
  },
};
