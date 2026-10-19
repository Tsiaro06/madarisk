import { Request, Response } from 'express';
import { aiService } from '../services/ai.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import {
  AiChatBody,
  ConversationIdParams,
  ConversationListQuery,
} from '../validators/ai.validator';

export const aiController = {
  chat: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as AiChatBody;

    if (!body.stream) {
      const result = await aiService.chat(req.user, body);
      res.status(200).json(successResponse(result, "Réponse de l'assistant"));
      return;
    }

    // Le premier événement du flux est produit AVANT l'envoi des en-têtes : une
    // erreur de préparation (service non configuré, conversation introuvable)
    // reste alors une vraie réponse d'erreur HTTP, au lieu d'un 200 suivi d'un
    // événement d'erreur que le client devrait deviner.
    const stream = aiService.chatStream(req.user, body);
    let next = await stream.next();

    // À partir d'ici le statut 200 est figé : une erreur de génération ne peut
    // plus être signalée que par un événement `error` dans le flux.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(':\n\n'); // heartbeat initial pour garder la connexion vivante

    const keepAlive = setInterval(() => {
      if (res.destroyed || res.writableEnded) return;
      try {
        res.write(':\n\n');
      } catch {
        // connexion déjà fermée
      }
    }, 25000);

    let clientGone = false;
    const onClientGone = () => {
      clientGone = true;
      clearInterval(keepAlive);
    };
    req.on('close', onClientGone);
    res.on('close', onClientGone);

    const writeEvent = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // `flush` n'existe qu'avec le middleware de compression : sans lui les
      // morceaux resteraient dans le tampon et le flux perdrait tout intérêt.
      const flushable = res as Response & { flush?: () => void };
      flushable.flush?.();
    };

    try {
      while (!next.done) {
        if (clientGone || res.writableEnded) {
          // Client parti : on abandonne le flux sans persister de réponse
          // partielle, qui serait un message tronqué en base.
          await stream.return?.(undefined);
          return;
        }
        writeEvent(next.value.type, next.value.data);
        next = await stream.next();
      }
      if (!res.writableEnded) res.end();
    } catch (error) {
      logger.warn({ err: error }, 'Assistant IA : échec du flux de réponse');
      if (!res.writableEnded) {
        const appError =
          error instanceof AppError ? error : new AppError('Échec du service IA', 502);
        writeEvent('error', { message: appError.message, status: appError.statusCode });
        res.end();
      }
    } finally {
      clearInterval(keepAlive);
      res.off('close', onClientGone);
      req.off('close', onClientGone);
    }
  },

  listConversations: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.validatedQuery as ConversationListQuery;
    const result = await aiService.listConversations(req.user, query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des conversations', meta));
  },

  getConversation: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const params = req.validatedParams as ConversationIdParams;
    const result = await aiService.getConversation(params.id, req.user);
    res.status(200).json(successResponse(result, "Conversation de l'assistant"));
  },

  deleteConversation: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const params = req.validatedParams as ConversationIdParams;
    await aiService.deleteConversation(params.id, req.user, req);
    res.status(204).send();
  },
};
