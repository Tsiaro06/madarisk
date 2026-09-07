import { AuthRequestUser } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthRequestUser;
      validatedBody?: unknown;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export {};
