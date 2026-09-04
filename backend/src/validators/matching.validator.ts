import { z } from 'zod';

const targetTypeEnum = z.enum(['DISTRICT', 'COMMUNE']);
const matchingStatusEnum = z.enum(['EN_ATTENTE', 'VALIDE', 'REJETE', 'AMBIGU']);

export const runMatchingParamsSchema = z.object({
  importId: z.string().uuid('Identifiant d\'import invalide'),
});

export const listMatchingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  importId: z.string().uuid('Import invalide').optional(),
  status: matchingStatusEnum.optional(),
  targetType: targetTypeEnum.optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  maxConfidence: z.coerce.number().min(0).max(100).optional(),
});

export const matchingIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant de correspondance invalide'),
});

export const rejectMatchingSchema = z.object({
  notes: z.string().trim().min(1, 'La note de rejet est obligatoire').max(2000),
});

export const manualLinkSchema = z
  .object({
    sourceRecordId: z.string().uuid('Source invalide'),
    targetType: targetTypeEnum,
    districtId: z.string().uuid('District invalide').optional(),
    communeId: z.string().uuid('Commune invalide').optional(),
    createAlias: z.boolean().optional().default(false),
    alias: z.string().trim().min(1).max(255).optional(),
  })
  .refine(
    (data) => (data.targetType === 'DISTRICT' ? !!data.districtId : !!data.communeId),
    {
      message: 'Il faut fournir districtId pour DISTRICT ou communeId pour COMMUNE',
      path: ['targetType'],
    },
  )
  .refine((data) => !data.createAlias || !!data.alias, {
    message: 'Une valeur alias est requise lorsque createAlias est activé',
    path: ['alias'],
  });

export type RunMatchingInput = z.infer<typeof runMatchingParamsSchema>;
export type ListMatchingQuery = z.infer<typeof listMatchingQuerySchema>;
export type RejectMatchingInput = z.infer<typeof rejectMatchingSchema>;
export type ManualLinkInput = z.infer<typeof manualLinkSchema>;
