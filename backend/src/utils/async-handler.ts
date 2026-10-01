import { Request, Response, NextFunction } from 'express';

/**
 * Contrôleur synchrone ou asynchrone.
 *
 * Accepter les deux évite d'imposer un `await` purement cosmétique à un handler
 * qui ne fait que lire un état en mémoire : la règle `require-await` d'ESLint
 * le refuserait, et un `await Promise.resolve(...)` pour la contourner serait
 * du bruit. `Promise.resolve` unifie les deux cas à l'exécution.
 */
type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
