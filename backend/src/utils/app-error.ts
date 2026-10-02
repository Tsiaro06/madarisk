export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: { field?: string; message: string }[];
  /**
   * Secondes à attendre avant de réessayer, pour les seules erreurs 429.
   *
   * « Réessayez plus tard » sans durée n'est exploitable ni par le client ni
   * par un humain : le frontend sait déjà exploiter cet en-tête, et l'heure de
   * reset d'un quota journalier est une information qu'on possède.
   */
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number,
    isOperational = true,
    details?: { field?: string; message: string }[],
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
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

  static tooManyRequests(message = 'Trop de requêtes', retryAfterSeconds?: number): AppError {
    return new AppError(message, 429, true, undefined, retryAfterSeconds);
  }

  static internal(message = 'Erreur serveur interne'): AppError {
    return new AppError(message, 500, false);
  }
}
