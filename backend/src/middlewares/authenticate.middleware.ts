import { Request, Response, NextFunction } from 'express';
import { tokens } from '../utils/tokens';
import { AppError } from '../utils/app-error';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(AppError.unauthorized('Token d\'accès manquant ou invalide'));
    return;
  }

  const token = header.slice(7).trim();

  try {
    const payload = tokens.verifyAccessToken(token);
    if (payload.type !== 'access') {
      next(AppError.unauthorized('Token invalide'));
      return;
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(AppError.unauthorized('Token d\'accès invalide ou expiré'));
  }
}
