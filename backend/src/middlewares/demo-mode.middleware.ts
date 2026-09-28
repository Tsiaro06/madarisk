import { Request, Response, NextFunction } from 'express';
import { env, isDemoDatabaseName, resolveDatabaseName } from '../config/env';
import { AppError } from '../utils/app-error';

/**
 * Les routes /api/v1/demo/* n'existent fonctionnellement qu'en mode
 * démonstration isolé. Hors mode démo, elles répondent 404 (comme si la route
 * n'existait pas), conformément à la convention API.
 */
export function requireDemoMode(_req: Request, _res: Response, next: NextFunction): void {
  const dbName = resolveDatabaseName({ databaseUrl: env.DATABASE_URL, dbName: env.DB_NAME });

  if (!env.DEMO_MODE || !isDemoDatabaseName(dbName)) {
    next(AppError.notFound('Route non trouvée : mode démonstration inactif.'));
    return;
  }

  next();
}
