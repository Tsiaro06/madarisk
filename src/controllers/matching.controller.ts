import { Request, Response } from 'express';
import { matchingService } from '../services/matching.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  ListMatchingQuery,
  ManualLinkInput,
  RejectMatchingInput,
} from '../validators/matching.validator';

export const matchingController = {
  run: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { importId } = req.params as { importId: string };
    const result = await matchingService.run(importId, req.user, req);
    res.status(200).json(successResponse(result, 'Correspondances calculées'));
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListMatchingQuery;
    const result = await matchingService.list(query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des correspondances', meta));
  },

  approve: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;
    const updated = await matchingService.approve(id, req.user, req);
    res.status(200).json(successResponse(updated, 'Correspondance validée'));
  },

  reject: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;
    const { notes } = req.validatedBody as RejectMatchingInput;
    const updated = await matchingService.reject(id, notes, req.user, req);
    res.status(200).json(successResponse(updated, 'Correspondance rejetée'));
  },

  manualLink: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as ManualLinkInput;
    const id = await matchingService.manualLink(body, req.user, req);
    res.status(201).json(successResponse({ id }, 'Liaison manuelle créée'));
  },

  statistics: async (_req: Request, res: Response): Promise<void> => {
    const stats = await matchingService.statistics();
    res.status(200).json(successResponse(stats, 'Statistiques des correspondances'));
  },
};
