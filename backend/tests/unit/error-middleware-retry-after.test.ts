import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../../src/middlewares/error.middleware';
import { AppError } from '../../src/utils/app-error';

/**
 * En-tête `Retry-After` sur les 429.
 *
 * Le quota Open-Meteo se rebat à une heure CONNUE. Le dire sans la transmettre
 * jusqu'au client, c'est transformer une information utile (« réessaie à 03:00 »)
 * en échec sec, alors que le frontend sait déjà exploiter cet en-tête.
 */

function fakeResponse(): { res: Response; headers: Record<string, string>; status: number } {
  const headers: Record<string, string> = {};
  const state = { res: null as unknown as Response, headers, status: 0 };
  state.res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status: (code: number) => {
      state.status = code;
      return state.res;
    },
    json: () => state.res,
  } as unknown as Response;
  return state;
}

describe('middleware d’erreur : Retry-After', () => {
  it('renvoie la durée d’attente sur un 429', () => {
    const state = fakeResponse();

    errorHandler(
      AppError.tooManyRequests('Quota épuisé', 3600),
      {} as Request,
      state.res,
      vi.fn() as unknown as NextFunction,
    );

    expect(state.status).toBe(429);
    expect(state.headers['Retry-After']).toBe('3600');
  });

  it('n’envoie pas l’en-tête sur les autres erreurs', () => {
    const state = fakeResponse();

    errorHandler(
      AppError.notFound('Introuvable'),
      {} as Request,
      state.res,
      vi.fn() as unknown as NextFunction,
    );

    expect(state.headers['Retry-After']).toBeUndefined();
  });
});
