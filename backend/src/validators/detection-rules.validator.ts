import { z } from 'zod';

const hazardTypeEnum = z.enum([
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'VAGUE_DE_CHALEUR',
  'AUTRE',
]);

const detectionOperatorEnum = z.enum(['GT', 'GE', 'LT', 'LE', 'EQ', 'BETWEEN']);

const severityLevelEnum = z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']);

// ── Params / Query ────────────────────────────────────────────────────────

export const detectionRuleIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant de règle invalide'),
});

export const listDetectionRulesQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  hazardType: hazardTypeEnum.optional(),
  metric: z.string().trim().min(1).max(60).optional(),
});

// ── Create body ───────────────────────────────────────────────────────────

export const createDetectionRuleSchema = z
  .object({
    hazardType: hazardTypeEnum,
    metric: z.string().trim().min(1, 'metric requis').max(60, 'metric trop long'),
    operator: detectionOperatorEnum,
    threshold: z.number(),
    thresholdMax: z.number().nullable().optional(),
    durationMinutes: z.number().int().min(0).default(0),
    aggregationWindowMinutes: z.number().int().min(0).default(0),
    forecastHorizonHours: z.number().int().min(0).default(0),
    severityRules: z
      .array(
        z.object({
          level: severityLevelEnum,
          min: z.number().min(0, 'min supérieur ou égal à 0').max(100, 'min inférieur ou égal à 100'),
        }),
      )
      .default([]),
    isActive: z.boolean().default(true),
    regionId: z.string().uuid('UUID region invalide').nullable().optional(),
    districtId: z.string().uuid('UUID district invalide').nullable().optional(),
    communeId: z.string().uuid('UUID commune invalide').nullable().optional(),
  })
  .refine(
    (data) =>
      data.operator !== 'BETWEEN' ||
      (data.thresholdMax !== null && data.thresholdMax !== undefined),
    {
      message: "thresholdMax requis quand l'opérateur est BETWEEN",
      path: ['thresholdMax'],
    },
  )
  .refine(
    (data) =>
      data.operator !== 'BETWEEN' ||
      (data.thresholdMax !== null &&
        data.thresholdMax !== undefined &&
        data.thresholdMax >= data.threshold),
    {
      message: 'thresholdMax doit être supérieur ou égal à threshold',
      path: ['thresholdMax'],
    },
  )
  .refine(
    (data) => {
      const scopeCount =
        ((data.regionId ?? null) !== null ? 1 : 0) +
        ((data.districtId ?? null) !== null ? 1 : 0) +
        ((data.communeId ?? null) !== null ? 1 : 0);
      return scopeCount <= 1;
    },
    {
      message: 'Au plus une seule portée (regionId, districtId, communeId) peut être définie',
      path: ['regionId'],
    },
  );

// ── Update body ───────────────────────────────────────────────────────────

export const updateDetectionRuleSchema = z
  .object({
    hazardType: hazardTypeEnum.optional(),
    metric: z.string().trim().min(1).max(60).optional(),
    operator: detectionOperatorEnum.optional(),
    threshold: z.number().optional(),
    thresholdMax: z.number().nullable().optional(),
    durationMinutes: z.number().int().min(0).optional(),
    aggregationWindowMinutes: z.number().int().min(0).optional(),
    forecastHorizonHours: z.number().int().min(0).optional(),
    severityRules: z
      .array(
        z.object({
          level: severityLevelEnum,
          min: z.number().min(0).max(100),
        }),
      )
      .optional(),
    isActive: z.boolean().optional(),
    regionId: z.string().uuid().nullable().optional(),
    districtId: z.string().uuid().nullable().optional(),
    communeId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.operator === 'BETWEEN') {
        return data.thresholdMax !== undefined && data.thresholdMax !== null;
      }
      return true;
    },
    {
      message: "thresholdMax requis quand l'opérateur est BETWEEN",
      path: ['thresholdMax'],
    },
  )
  .refine(
    (data) => {
      const scopeCount =
        ((data.regionId ?? null) !== null ? 1 : 0) +
        ((data.districtId ?? null) !== null ? 1 : 0) +
        ((data.communeId ?? null) !== null ? 1 : 0);
      return scopeCount <= 1;
    },
    {
      message: 'Au plus une seule portée peut être définie',
      path: ['regionId'],
    },
  );

// ── Exported types ────────────────────────────────────────────────────────

export type CreateDetectionRuleInput = z.infer<typeof createDetectionRuleSchema>;
export type UpdateDetectionRuleInput = z.infer<typeof updateDetectionRuleSchema>;
export type ListDetectionRulesQuery = z.infer<typeof listDetectionRulesQuerySchema>;
