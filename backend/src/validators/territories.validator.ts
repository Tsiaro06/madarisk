import { z } from 'zod';

const riskLevelEnum = z.enum(['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME']);
const riskPhaseEnum = z.enum(['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT']);

export const listDistrictsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  adminCode: z.string().optional(),
  includeGeometry: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const listCommunesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  districtId: z.string().uuid('District invalide').optional(),
  districtCode: z.string().optional(),
  search: z.string().optional(),
  adminCode: z.string().optional(),
  riskLevel: riskLevelEnum.optional(),
  eventId: z.string().uuid('Événement invalide').optional(),
  includeGeometry: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const searchQuerySchema = z.object({
  q: z.string().min(2, 'La recherche nécessite au moins 2 caractères'),
  limit: z.coerce.number().int().min(1).max(20).default(20).optional(),
});

export const districtsMapQuerySchema = z.object({
  eventId: z.string().uuid('Événement invalide').optional(),
  riskLevel: riskLevelEnum.optional(),
  includeStats: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const communesMapQuerySchema = z.object({
  districtId: z.string().uuid('District invalide').optional(),
  districtCode: z.string().optional(),
  eventId: z.string().uuid('Événement invalide').optional(),
  riskLevel: riskLevelEnum.optional(),
  phase: riskPhaseEnum.optional(),
  includeRisk: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v !== 'false'),
  includeGeometry: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const districtIdParamsSchema = z.object({
  id: z.string().uuid('District invalide'),
});

export const communeIdParamsSchema = z.object({
  id: z.string().uuid('Commune invalide'),
});

export type ListDistrictsQuery = z.infer<typeof listDistrictsQuerySchema>;
export type ListCommunesQuery = z.infer<typeof listCommunesQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type DistrictsMapQuery = z.infer<typeof districtsMapQuerySchema>;
export type CommunesMapQuery = z.infer<typeof communesMapQuerySchema>;
