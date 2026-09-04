import { z } from 'zod';

const territoryTypeEnum = z.enum(['DISTRICT', 'COMMUNE']);
const importStatusEnum = z.enum(['BROUILLON', 'EN_COURS', 'TERMINE', 'ECHEC']);
const importFileTypeEnum = z.enum(['GEOJSON', 'JSON', 'CSV']);

export const createImportSchema = z.object({
  territoryType: territoryTypeEnum.optional(),
  sourceName: z.string().trim().min(1).max(255).optional(),
});

export const listImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: importStatusEnum.optional(),
  fileType: importFileTypeEnum.optional(),
  territoryType: territoryTypeEnum.optional(),
});

export const importIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant d\'import invalide'),
});

export const listImportErrorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateImportInput = z.infer<typeof createImportSchema>;
export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;
export type ListImportErrorsQuery = z.infer<typeof listImportErrorsQuerySchema>;
