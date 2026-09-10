import { Request, Response } from 'express';
import { weatherService } from '../services/weather.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  RefreshWeatherInput,
  WeatherHistoryQuery,
  WeatherMapQuery,
} from '../validators/weather.validator';

interface CommuneIdParams {
  communeId: string;
}

export const weatherController = {
  refresh: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as RefreshWeatherInput;
    const result = await weatherService.refresh(body, req.user, req);
    res.status(200).json(successResponse(result, 'Rafraîchissement météo terminé'));
  },

  latest: async (req: Request, res: Response): Promise<void> => {
    const { communeId } = req.validatedParams as CommuneIdParams;
    const observation = await weatherService.latest(communeId);
    res.status(200).json(successResponse(observation, 'Dernière observation météo'));
  },

  forecast: async (req: Request, res: Response): Promise<void> => {
    const { communeId } = req.validatedParams as CommuneIdParams;
    const forecast = await weatherService.forecast(communeId);
    res.status(200).json(successResponse(forecast, 'Prévisions météo'));
  },

  history: async (req: Request, res: Response): Promise<void> => {
    const { communeId } = req.validatedParams as CommuneIdParams;
    const query = req.validatedQuery as WeatherHistoryQuery;
    const result = await weatherService.history(communeId, query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Historique météo', meta));
  },

  mapLayer: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as WeatherMapQuery;
    const [geojson, latestObservationAt] = await Promise.all([
      weatherService.mapLayer(query),
      weatherService.latestObservationAt(),
    ]);
    res.status(200).json(successResponse(geojson, 'Couche météo', { latestObservationAt }));
  },

  ingestDgmMaproom: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const result = await weatherService.ingestDgmMaproom(req.user, req);
    res.status(200).json(successResponse(result, 'Ingestion DGM (maproom) terminée'));
  },
};
