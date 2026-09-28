import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { aiController } from '../controllers/ai.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  aiChatBodySchema,
  conversationIdParamsSchema,
  conversationListQuerySchema,
} from '../validators/ai.validator';

const router = Router();

const CHAT_WINDOW_MS = 15 * 60 * 1000;
const aiChatLimiterConfig = {
  max: 30,
};

export function setAiChatRateLimit(config: { max: number }): void {
  aiChatLimiterConfig.max = config.max;
}

export function resetAiChatRateLimit(): void {
  aiChatLimiterConfig.max = 30;
}

const chatLimiter = rateLimit({
  windowMs: CHAT_WINDOW_MS,
  max: (_req: Request, _res: Response) => aiChatLimiterConfig.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de requêtes vers l'assistant, veuillez réessayer plus tard.",
  },
  keyGenerator: (req) => {
    return req.user?.id ?? req.ip ?? 'unknown';
  },
});

router.use(authenticate);

router.post(
  '/chat',
  chatLimiter,
  validate({ body: aiChatBodySchema }),
  asyncHandler(aiController.chat),
);

router.get(
  '/conversations',
  validate({ query: conversationListQuerySchema }),
  asyncHandler(aiController.listConversations),
);

router.get(
  '/conversations/:id',
  validate({ params: conversationIdParamsSchema }),
  asyncHandler(aiController.getConversation),
);

router.delete(
  '/conversations/:id',
  validate({ params: conversationIdParamsSchema }),
  asyncHandler(aiController.deleteConversation),
);

export default router;
