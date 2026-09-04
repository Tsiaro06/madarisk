import { Request, Response } from 'express';
import { AppError } from '../utils/app-error';
import { errorResponse } from '../utils/api-response';

export function notFoundHandler(req: Request, res: Response): void {
  const err = AppError.notFound(`Route non trouvée : ${req.method} ${req.originalUrl}`);
  res.status(404).json(errorResponse(err.message));
}
