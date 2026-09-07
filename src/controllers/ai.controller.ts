import { Request, Response } from 'express';
import { aiService } from '../services/ai.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  AiChatBody,
  ConversationIdParams,
  ConversationListQuery,
} from '../validators/ai.validator';

export const aiController = {
  chat: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as AiChatBody;
    const result = await aiService.chat(req.user, body);
    res.status(200).json(successResponse(result, "Réponse de l'assistant"));
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
