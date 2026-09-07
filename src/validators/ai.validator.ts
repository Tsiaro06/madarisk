import { z } from 'zod';

const uuidSchema = z.string().uuid('Identifiant invalide');

export const aiChatBodySchema = z.object({
  conversationId: uuidSchema.optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Le message est requis')
    .max(5000, 'Message trop long (5000 caractères maximum)'),
});

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const conversationIdParamsSchema = z.object({
  id: uuidSchema,
});

export type AiChatBody = z.infer<typeof aiChatBodySchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationIdParams = z.infer<typeof conversationIdParamsSchema>;
