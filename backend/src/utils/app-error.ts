export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: { field?: string; message: string }[];

  constructor(message: string, statusCode: number, isOperational = true, details?: { field?: string; message: string }[]) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Requête invalide'): AppError {
    return new AppError(message, 400);
  }

  static unauthorized(message = 'Non authentifié'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Accès interdit'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message = 'Ressource introuvable'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message = 'Conflit de données'): AppError {
    return new AppError(message, 409);
  }

  static unprocessable(message = 'Données non conformes'): AppError {
    return new AppError(message, 422);
  }

  static tooManyRequests(message = 'Trop de requêtes'): AppError {
    return new AppError(message, 429);
  }

  static internal(message = 'Erreur serveur interne'): AppError {
    return new AppError(message, 500, false);
  }
}
