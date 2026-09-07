import { Request, Response } from 'express';
import { territoriesService } from '../services/territories.service';
import { successResponse, paginate } from '../utils/api-response';
import {
  ListDistrictsQuery,
  ListCommunesQuery,
  SearchQuery,
  DistrictsMapQuery,
  CommunesMapQuery,
} from '../validators/territories.validator';

export const territoriesController = {
  listDistricts: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListDistrictsQuery;
    const result = await territoriesService.listDistricts(query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des districts', meta));
  },

  getDistrictById: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as { id: string };
    const district = await territoriesService.getDistrictById(id);
    res.status(200).json(successResponse(district, 'Détail du district'));
  },

  listCommunes: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListCommunesQuery;
    const result = await territoriesService.listCommunes(query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des communes', meta));
  },

  getCommuneById: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as { id: string };
    const commune = await territoriesService.getCommuneById(id);
    res.status(200).json(successResponse(commune, 'Détail de la commune'));
  },

  search: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as SearchQuery;
    const results = await territoriesService.searchTerritories(query);
    res.status(200).json(successResponse(results, 'Résultats de recherche'));
  },

  mapDistricts: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as DistrictsMapQuery;
    const geojson = await territoriesService.mapDistricts(query);
    res.status(200).json(successResponse(geojson, 'District FeatureCollection'));
  },

  mapCommunes: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as CommunesMapQuery;
    const geojson = await territoriesService.mapCommunes(query);
    res.status(200).json(successResponse(geojson, 'Communes FeatureCollection'));
  },
};
