import { Request, Response } from 'express';
import { usersService } from '../services/users.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  CreateUserInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  ListUsersQuery,
} from '../validators/users.validator';

export const usersController = {
  create: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CreateUserInput;
    const user = await usersService.create(body, req.user, req);
    res.status(201).json(successResponse(user, 'Utilisateur créé avec succès'));
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const result = await usersService.list(req.validatedQuery as ListUsersQuery);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.users, 'Liste des utilisateurs', meta));
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;

    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
      throw AppError.forbidden('Accès refusé');
    }

    const user = await usersService.getById(id);
    res.status(200).json(successResponse(user, 'Utilisateur'));
  },

  update: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;
    const body = req.validatedBody as UpdateUserInput;
    const user = await usersService.update(id, body, req.user, req);
    res.status(200).json(successResponse(user, 'Utilisateur mis à jour'));
  },

  updateStatus: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;
    const { isActive } = req.validatedBody as UpdateUserStatusInput;
    const user = await usersService.updateStatus(id, isActive, req.user, req);
    res.status(200).json(successResponse(user, 'Statut de l\'utilisateur mis à jour'));
  },

  changePassword: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };
    await usersService.changePassword(req.user.id, oldPassword, newPassword, req);
    res.status(200).json(successResponse(null, 'Mot de passe modifié avec succès'));
  },
};
