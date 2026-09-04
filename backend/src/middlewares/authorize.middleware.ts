import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { UserRole } from '../types/auth.types';

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized('Non authentifié'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden('Accès refusé : rôle insuffisant'));
      return;
    }

    next();
  };
}
