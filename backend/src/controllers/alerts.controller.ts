import { Request, Response } from 'express';
import { alertsService } from '../services/alerts.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  CreateAlertInput,
  ListAlertsQuery,
  UpdateAlertInput,
} from '../validators/alerts.validator';

interface AlertIdParams {
  id: string;
}

export const alertsController = {
  create: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CreateAlertInput;
    const alert = await alertsService.create(body, req.user, req);
    res.status(201).json(successResponse(alert, 'Alerte créée'));
  },

  list: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.validatedQuery as ListAlertsQuery;
    const result = await alertsService.list(query, req.user);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des alertes', meta));
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as AlertIdParams;
    const alert = await alertsService.getById(id, req.user);
    res.status(200).json(successResponse(alert, "Détail de l'alerte"));
  },

  update: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as AlertIdParams;
    const body = req.validatedBody as UpdateAlertInput;
    const alert = await alertsService.update(id, body, req.user, req);
    res.status(200).json(successResponse(alert, 'Alerte mise à jour'));
  },

  publish: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as AlertIdParams;
    const alert = await alertsService.publish(id, req.user, req);
    res.status(200).json(successResponse(alert, 'Alerte publiée'));
  },

  archive: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as AlertIdParams;
    const alert = await alertsService.archive(id, req.user, req);
    res.status(200).json(successResponse(alert, 'Alerte archivée'));
  },
};
