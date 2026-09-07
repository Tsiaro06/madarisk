import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { AppError } from '../utils/app-error';

interface ValidationTargets {
  body?: z.ZodType<unknown>;
  query?: z.ZodType<unknown>;
  params?: z.ZodType<unknown>;
}

export function validate(schemas: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.validatedBody = schemas.body.parse(req.body);
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query);
      if (schemas.params) req.validatedParams = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        next(new AppError('Données invalides', 422, true, details));
        return;
      }
      next(err);
    }
  };
}
