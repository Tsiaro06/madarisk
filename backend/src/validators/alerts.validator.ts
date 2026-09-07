import { z } from 'zod';

const alertTypeEnum = z.enum([
  'CYCLONE',
  'INONDATION',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'SECHERESSE',
  'INFORMATION',
  'URGENCE',
]);

const alertStatusEnum = z.enum(['BROUILLON', 'PUBLIEE', 'ARCHIVEE', 'EXPIREE']);

const severityLevelEnum = z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']);

const targetField = (label: string) => z.string().uuid(`${label} invalide`).optional().nullable();

const expiresAtField = z
  .union([z.coerce.date(), z.literal('')])
  .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
  .optional()
  .nullable();

function hasTarget(data: {
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
}): boolean {
  return Boolean(data.eventId) || Boolean(data.districtId) || Boolean(data.communeId);
}

function hasSingleTerritoryTarget(data: {
  districtId?: string | null;
  communeId?: string | null;
}): boolean {
  return !(data.districtId && data.communeId);
}

export const createAlertSchema = z
  .object({
    eventId: targetField('eventId'),
    districtId: targetField('districtId'),
    communeId: targetField('communeId'),
    type: alertTypeEnum,
    severity: severityLevelEnum,
    title: z.string().trim().min(1, 'title requis').max(250, 'title trop long'),
    message: z.string().trim().min(1, 'message requis').max(4000, 'message trop long'),
    expiresAt: expiresAtField,
  })
  .refine(hasTarget, {
    message: 'Précisez au moins eventId, districtId ou communeId',
    path: ['eventId'],
  })
  .refine(hasSingleTerritoryTarget, {
    message: 'Impossible de cibler à la fois un district et une commune',
    path: ['communeId'],
  });

export const updateAlertSchema = z
  .object({
    eventId: targetField('eventId'),
    districtId: targetField('districtId'),
    communeId: targetField('communeId'),
    type: alertTypeEnum.optional(),
    severity: severityLevelEnum.optional(),
    title: z.string().trim().min(1, 'title requis').max(250, 'title trop long').optional(),
    message: z.string().trim().min(1, 'message requis').max(4000, 'message trop long').optional(),
    expiresAt: expiresAtField,
  })
  .refine(hasSingleTerritoryTarget, {
    message: 'Impossible de cibler à la fois un district et une commune',
    path: ['communeId'],
  });

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: alertStatusEnum.optional(),
  type: alertTypeEnum.optional(),
  severity: severityLevelEnum.optional(),
  eventId: z.string().uuid('eventId invalide').optional(),
  districtId: z.string().uuid('districtId invalide').optional(),
  communeId: z.string().uuid('communeId invalide').optional(),
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const alertIdParamsSchema = z.object({
  id: z.string().uuid("Identifiant d'alerte invalide"),
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
