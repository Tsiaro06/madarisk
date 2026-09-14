import { Request, Response } from 'express';
import { hazardDetectionService } from '../services/hazard-detection.service';
import { AppError } from '../utils/app-error';
import { successResponse } from '../utils/api-response';
import type { DetectRunInput, DetectionRunsQuery } from '../validators/hazard-detection.validator';

interface EventIdParams {
  id: string;
}

export const hazardDetectionController = {
  run: async (req: Request, res: Response): Promise<void> => {
    const body = req.validatedBody as DetectRunInput | undefined;
    const result = await hazardDetectionService.run({
      trigger: 'MANUAL',
      scope: body?.scope ?? 'ALL',
    });

    if (result.joinedExisting) {
      throw new AppError('Détection d aléas : une exécution est déjà en cours', 409, true);
    }

    res.json(successResponse(result, 'Détection d aléas terminée'));
  },

  runs: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as DetectionRunsQuery;
    const runs = await hazardDetectionService.runs(query.limit);
    res.json(successResponse(runs, 'Exécutions de détection récupérées'));
  },
};

export const eventHistoryController = {
  history: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const timeline = await hazardDetectionService.eventTimeline(id);
    res.json(successResponse({ eventId: id, timeline }, 'Chronologie de l événement récupérée'));
  },
};
