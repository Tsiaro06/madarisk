import { z } from 'zod';

export const eventBulletinPreviewSchema = z.object({
  eventCode: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  type: z
    .enum([
      'CYCLONE',
      'INONDATION',
      'SECHERESSE',
      'FORTE_PLUIE',
      'VENT_VIOLENT',
      'GLISSEMENT_TERRAIN',
      'FEU_VEGETATION',
      'VAGUE_DE_CHALEUR',
      'AUTRE',
    ])
    .optional(),
  createIfMissing: z.coerce.boolean().optional().default(true),
});

export const eventBulletinImportSchema = z.object({
  eventId: z.string().uuid().optional(),
  eventCode: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  type: z
    .enum([
      'CYCLONE',
      'INONDATION',
      'SECHERESSE',
      'FORTE_PLUIE',
      'VENT_VIOLENT',
      'GLISSEMENT_TERRAIN',
      'FEU_VEGETATION',
      'VAGUE_DE_CHALEUR',
      'AUTRE',
    ])
    .optional(),
  createIfMissing: z.coerce.boolean().optional().default(true),
  replaceTracks: z.coerce.boolean().optional().default(false),
});

export type EventBulletinPreviewInput = z.infer<typeof eventBulletinPreviewSchema>;
export type EventBulletinImportInput = z.infer<typeof eventBulletinImportSchema>;
