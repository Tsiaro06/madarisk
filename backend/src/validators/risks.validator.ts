import { z } from 'zod';

const riskPhaseEnum = z.enum(['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT']);
const riskLevelEnum = z.enum(['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME']);

const weightField = (label: string) =>
  z.coerce.number().min(0, `${label} minimum 0`).max(1, `${label} maximum 1`);

const thresholdField = (label: string) =>
  z.coerce.number().min(0, `${label} minimum 0`).max(100, `${label} maximum 100`);

export const createRiskConfigurationSchema = z
  .object({
    name: z.string().trim().min(1, 'name requis').max(150, 'name trop long'),
    rainWeight: weightField('rainWeight').optional().default(0.3),
    windWeight: weightField('windWeight').optional().default(0.25),
    proximityWeight: weightField('proximityWeight').optional().default(0.2),
    vulnerabilityWeight: weightField('vulnerabilityWeight').optional().default(0.15),
    exposureWeight: weightField('exposureWeight').optional().default(0.1),
    lowThreshold: thresholdField('lowThreshold').optional().default(20),
    moderateThreshold: thresholdField('moderateThreshold').optional().default(40),
    highThreshold: thresholdField('highThreshold').optional().default(60),
    extremeThreshold: thresholdField('extremeThreshold').optional().default(80),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) =>
      Math.round(
        (data.rainWeight +
          data.windWeight +
          data.proximityWeight +
          data.vulnerabilityWeight +
          data.exposureWeight) *
          10000,
      ) === 10000,
    { message: 'La somme des poids doit être égale à 1', path: ['rainWeight'] },
  )
  .refine(
    (data) =>
      data.lowThreshold < data.moderateThreshold &&
      data.moderateThreshold < data.highThreshold &&
      data.highThreshold < data.extremeThreshold &&
      data.extremeThreshold <= 100,
    {
      message: 'Les seuils doivent être strictement croissants et inférieurs ou égaux à 100',
      path: ['extremeThreshold'],
    },
  );

export const updateRiskConfigurationSchema = z
  .object({
    name: z.string().trim().min(1, 'name requis').max(150).optional(),
    rainWeight: weightField('rainWeight').optional(),
    windWeight: weightField('windWeight').optional(),
    proximityWeight: weightField('proximityWeight').optional(),
    vulnerabilityWeight: weightField('vulnerabilityWeight').optional(),
    exposureWeight: weightField('exposureWeight').optional(),
    lowThreshold: thresholdField('lowThreshold').optional(),
    moderateThreshold: thresholdField('moderateThreshold').optional(),
    highThreshold: thresholdField('highThreshold').optional(),
    extremeThreshold: thresholdField('extremeThreshold').optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const weights = [data.rainWeight, data.windWeight, data.proximityWeight, data.vulnerabilityWeight, data.exposureWeight];
      if (weights.every((w) => w === undefined)) return true;
      return (
        Math.round(
          ((data.rainWeight ?? 0) +
            (data.windWeight ?? 0) +
            (data.proximityWeight ?? 0) +
            (data.vulnerabilityWeight ?? 0) +
            (data.exposureWeight ?? 0)) *
            10000,
        ) === 10000
      );
    },
    { message: 'La somme des poids fournis doit être égale à 1', path: ['rainWeight'] },
  )
  .refine(
    (data) => {
      const thresholds = [data.lowThreshold, data.moderateThreshold, data.highThreshold, data.extremeThreshold];
      if (thresholds.every((t) => t === undefined)) return true;
      const defined = thresholds.filter((t): t is number => t !== undefined);
      for (let i = 1; i < defined.length; i += 1) {
        if (defined[i] <= defined[i - 1]) return false;
      }
      return (defined[defined.length - 1] ?? 100) <= 100;
    },
    {
      message: 'Les seuils doivent être strictement croissants et inférieurs ou égaux à 100',
      path: ['extremeThreshold'],
    },
  );

export const riskConfigurationIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant de configuration invalide'),
});

export const communeIdParamsSchema = z.object({
  communeId: z.string().uuid('Identifiant de commune invalide'),
});

export const recalculateRiskSchema = z
  .object({
    eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
    communeIds: z
      .array(z.string().uuid('Identifiant de commune invalide'))
      .min(1, 'Au moins un identifiant de commune')
      .max(2000, 'Trop de communes (maximum 2000)')
      .optional(),
    districtId: z.string().uuid('Identifiant de district invalide').optional(),
    phase: riskPhaseEnum,
  })
  .refine(
    (data) => Boolean(data.eventId) || Boolean(data.communeIds) || Boolean(data.districtId),
    {
      message: 'Précisez au moins un filtre (eventId, communeIds ou districtId)',
      path: ['eventId'],
    },
  );

export const recalculateEventRiskSchema = z.object({
  phase: riskPhaseEnum,
});

export const communeRiskQuerySchema = z.object({
  eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
  latest: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
});

export const priorityCommunesQuerySchema = z.object({
  eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
  districtId: z.string().uuid('Identifiant de district invalide').optional(),
  riskLevel: riskLevelEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const riskMapLayerQuerySchema = z.object({
  districtId: z.string().uuid('Identifiant de district invalide').optional(),
  eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
  riskLevel: riskLevelEnum.optional(),
  phase: riskPhaseEnum.optional(),
});

export type CreateRiskConfigurationInput = z.infer<typeof createRiskConfigurationSchema>;
export type UpdateRiskConfigurationInput = z.infer<typeof updateRiskConfigurationSchema>;
export type RecalculateRiskInput = z.infer<typeof recalculateRiskSchema>;
export type RecalculateEventRiskInput = z.infer<typeof recalculateEventRiskSchema>;
export type CommuneRiskQuery = z.infer<typeof communeRiskQuerySchema>;
export type PriorityCommunesQuery = z.infer<typeof priorityCommunesQuerySchema>;
export type RiskMapLayerQuery = z.infer<typeof riskMapLayerQuerySchema>;