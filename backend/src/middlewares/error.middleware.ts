import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { errorResponse } from '../utils/api-response';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, 'Erreur non opérationnelle');
    }
    // Le frontend sait exploiter `Retry-After` pour proposer un retour à l'heure
    // utile plutôt qu'un blocage sec, et un quota journalier se reset à une
    // heure connue : sans cet en-tête, l'information est perdue à la frontière.
    if (err.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.statusCode).json(errorResponse(err.message, err.details));
    return;
  }

  logger.error({ err }, 'Erreur non gérée');

  const message =
    env.NODE_ENV === 'production'
      ? 'Erreur serveur interne'
      : err.message || 'Erreur serveur interne';

  res.status(500).json(errorResponse(message));
}
