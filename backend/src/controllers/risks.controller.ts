import { Request, Response } from 'express';
import { risksService } from '../services/risk.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  CommuneRiskQuery,
  CreateRiskConfigurationInput,
  PriorityCommunesQuery,
  RecalculateEventRiskInput,
  RecalculateRiskInput,
  RiskMapLayerQuery,
  UpdateRiskConfigurationInput,
} from '../validators/risks.validator';

interface IdParams {
  id: string;
}

interface CommuneIdParams {
  communeId: string;
}

export const risksController = {
  listConfigurations: async (_req: Request, res: Response): Promise<void> => {
    const configurations = await risksService.listConfigurations();
    res.status(200).json(successResponse(configurations, 'Configurations de risque'));
  },

  getConfiguration: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as IdParams;
    const configuration = await risksService.getConfiguration(id);
    res.status(200).json(successResponse(configuration, 'Configuration de risque'));
  },

  createConfiguration: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CreateRiskConfigurationInput;
    const configuration = await risksService.createConfiguration(body, req.user, req);
    res.status(201).json(successResponse(configuration, 'Configuration de risque créée'));
  },

  updateConfiguration: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as IdParams;
    const body = req.validatedBody as UpdateRiskConfigurationInput;
    const configuration = await risksService.updateConfiguration(id, body, req.user, req);
    res.status(200).json(successResponse(configuration, 'Configuration de risque mise à jour'));
  },

  recalculate: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as RecalculateRiskInput;
    const result = await risksService.recalculate(body, req.user, req);
    res.status(200).json(successResponse(result, 'Risques recalculés'));
  },

  recalculateEvent: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as IdParams;
    const body = req.validatedBody as RecalculateEventRiskInput;
    const result = await risksService.recalculateEvent(id, body.phase, req.user, req);
    res.status(200).json(successResponse(result, 'Risques de l\'événement recalculés'));
  },

  communeRisks: async (req: Request, res: Response): Promise<void> => {
    const { communeId } = req.validatedParams as CommuneIdParams;
    const query = req.validatedQuery as CommuneRiskQuery;
    const result = await risksService.communeRisks(communeId, query);

    if (query.latest) {
      res.status(200).json(successResponse(result, 'Évaluation de risque de la commune'));
      return;
    }

    const pageResult = result as {
      items: unknown[];
      page: number;
      limit: number;
      total: number;
    };
    const meta = paginate(pageResult.page, pageResult.limit, pageResult.total);
    res.status(200).json(successResponse(pageResult.items, 'Historique des risques', meta));
  },

  priorityCommunes: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as PriorityCommunesQuery;
    const communes = await risksService.priorityCommunes(query);
    res.status(200).json(successResponse(communes, 'Communes prioritaires'));
  },

  mapLayer: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as RiskMapLayerQuery;
    const geojson = await risksService.mapLayer(query);
    res.status(200).json(successResponse(geojson, 'Couche de risques'));
  },
};