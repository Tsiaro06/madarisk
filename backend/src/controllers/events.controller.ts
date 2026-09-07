import { Request, Response } from 'express';
import { eventsService } from '../services/events.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  CalculateAreaInput,
  CalculateExposureInput,
  CreateEventInput,
  CreateTrackInput,
  ListEventsQuery,
  ListExposedCommunesQuery,
  ListTracksQuery,
  UpdateEventInput,
  UpdateEventStatusInput,
} from '../validators/events.validator';

interface EventIdParams {
  id: string;
}

export const eventsController = {
  create: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CreateEventInput;
    const event = await eventsService.create(body, req.user, req);
    res.status(201).json(successResponse(event, 'Événement créé avec succès'));
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListEventsQuery;
    const result = await eventsService.list(query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des événements', meta));
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const event = await eventsService.getById(id);
    res.status(200).json(successResponse(event, 'Détail de l\'événement'));
  },

  update: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    const body = req.validatedBody as UpdateEventInput;
    const event = await eventsService.update(id, body, req.user, req);
    res.status(200).json(successResponse(event, 'Événement modifié avec succès'));
  },

  updateStatus: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    const body = req.validatedBody as UpdateEventStatusInput;
    const event = await eventsService.changeStatus(id, body, req.user, req);
    res.status(200).json(successResponse(event, 'Statut de l\'événement mis à jour'));
  },

  remove: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    await eventsService.remove(id, req.user, req);
    res.status(200).json(successResponse(null, 'Événement supprimé'));
  },

  addTrack: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    const body = req.validatedBody as CreateTrackInput;
    const track = await eventsService.addTrack(id, body, req.user, req);
    res.status(201).json(successResponse(track, 'Point de trajectoire ajouté'));
  },

  listTracks: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const query = req.validatedQuery as ListTracksQuery;
    const tracks = await eventsService.listTracks(id, query);
    res.status(200).json(successResponse(tracks, 'Points de trajectoire'));
  },

  getTrackGeoJson: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const geojson = await eventsService.getTrackGeoJson(id);
    res.status(200).json(successResponse(geojson, 'Trajectoires GeoJSON'));
  },

  calculateArea: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    const body = req.validatedBody as CalculateAreaInput;
    const area = await eventsService.calculateArea(id, body, req.user, req);
    res.status(201).json(successResponse(area, 'Zone d\'influence calculée'));
  },

  getAreas: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const geojson = await eventsService.getAreas(id);
    res.status(200).json(successResponse(geojson, 'Zones d\'influence GeoJSON'));
  },

  calculateExposure: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as EventIdParams;
    const query = req.validatedQuery as CalculateExposureInput;
    const result = await eventsService.calculateExposure(id, query, req.user, req);
    res.status(200).json(successResponse(result, 'Exposition calculée'));
  },

  listExposedCommunes: async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validatedParams as EventIdParams;
    const query = req.validatedQuery as ListExposedCommunesQuery;
    const result = await eventsService.listExposedCommunes(id, query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Communes exposées', meta));
  },
};
