import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { usersRepository } from '../repositories/users.repository';
import { successResponse } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import { RegisterInput, LoginInput, RefreshInput } from '../validators/auth.validator';

export const authController = {
  register: async (req: Request, res: Response): Promise<void> => {
    const body = req.validatedBody as RegisterInput;
    const { user } = await authService.register(body, req);
    res.status(201).json(successResponse(user, 'Compte SUPER_ADMIN créé avec succès'));
  },

  login: async (req: Request, res: Response): Promise<void> => {
    const body = req.validatedBody as LoginInput;
    const result = await authService.login(body, req);
    res.status(200).json(successResponse(result, 'Connexion réussie'));
  },

  refresh: async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.validatedBody as RefreshInput;
    const result = await authService.refresh(refreshToken, req);
    res.status(200).json(successResponse(result, 'Token rafraîchi avec succès'));
  },

  logout: async (req: Request, res: Response): Promise<void> => {
    const body = req.validatedBody as Partial<RefreshInput> | undefined;
    const refreshToken: string | undefined = body?.refreshToken;
    await authService.logout(refreshToken);
    res.status(200).json(successResponse(null, 'Déconnexion réussie'));
  },

  me: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw AppError.unauthorized('Non authentifié');
    }
    const user = await usersRepository.findById(req.user.id);
    if (!user) {
      throw AppError.notFound('Utilisateur introuvable');
    }
    res.status(200).json(successResponse(usersRepository.sanitizeUser(user), 'Profil utilisateur'));
  },
};
