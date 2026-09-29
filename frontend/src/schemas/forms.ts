import { z } from 'zod';

/**
 * Connexion — doit refléter `backend/src/validators/auth.validator.ts` :
 * le serveur n'applique qu'un `min(1)` sur le mot de passe (les règles de
 * complexité ne concernent que la création de compte).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "L'adresse e-mail est requise")
    .email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});

/** Création du tout premier compte SUPER_ADMIN — mêmes règles que le backend. */
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(100),
  lastName: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().trim().min(1, "L'adresse e-mail est requise").email('Adresse e-mail invalide'),
  password: z
    .string()
    .min(8, 'Au moins 8 caractères')
    .max(128, 'Mot de passe trop long')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Au moins un caractère spécial'),
});

export const createEventSchema = z.object({
  eventCode: z
    .string()
    .trim()
    .min(1, 'Code requis')
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, 'Lettres, chiffres, ., -, _ uniquement'),
  name: z.string().trim().min(1, 'Nom requis').max(200),
  type: z.enum([
    'CYCLONE',
    'INONDATION',
    'SECHERESSE',
    'FORTE_PLUIE',
    'VENT_VIOLENT',
    'GLISSEMENT_TERRAIN',
    'FEU_VEGETATION',
    'AUTRE',
  ]),
  status: z.enum(['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']).optional(),
  severity: z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
});

export const createCrisisEventSchema = z.object({
  eventCode: z
    .string()
    .trim()
    .min(1, 'Code requis')
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, 'Lettres, chiffres, ., -, _ uniquement'),
  name: z.string().trim().min(1, 'Nom requis').max(200),
  type: z.enum([
    'CYCLONE',
    'INONDATION',
    'SECHERESSE',
    'FORTE_PLUIE',
    'VENT_VIOLENT',
    'GLISSEMENT_TERRAIN',
    'FEU_VEGETATION',
    'AUTRE',
  ]),
  status: z.enum(['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']),
  severity: z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']),
  description: z.string().trim().max(5000).optional().nullable(),
  startedAt: z.string().optional().nullable(),
  expectedEndAt: z.string().optional().nullable(),
});

export const createAlertSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis').max(250),
    message: z.string().trim().min(1, 'Message requis').max(4000),
    type: z.enum([
      'CYCLONE',
      'INONDATION',
      'FORTE_PLUIE',
      'VENT_VIOLENT',
      'SECHERESSE',
      'INFORMATION',
      'URGENCE',
    ]),
    severity: z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']),
    eventId: z.string().uuid().optional().or(z.literal('')),
    districtId: z.string().uuid().optional().or(z.literal('')),
    communeId: z.string().uuid().optional().or(z.literal('')),
    expiresAt: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const eventId = data.eventId || null;
    const districtId = data.districtId || null;
    const communeId = data.communeId || null;
    if (!eventId && !districtId && !communeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Précisez au moins eventId, districtId ou communeId',
        path: ['eventId'],
      });
    }
    if (districtId && communeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Impossible de cibler à la fois un district et une commune',
        path: ['communeId'],
      });
    }
  });

export const calculateAreaSchema = z.object({
  phase: z.enum(['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT']),
  riskLevel: z.enum(['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME']),
  radiusKm: z.coerce.number().min(1).max(500),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(8, 'Nouveau mot de passe trop court'),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Confirmation différente',
    path: ['confirmPassword'],
  });

const riskWeightField = (label: string) =>
  z.coerce.number().min(0, `${label} : minimum 0`).max(1, `${label} : maximum 1`);

const riskThresholdField = (label: string) =>
  z.coerce.number().min(0, `${label} : minimum 0`).max(100, `${label} : maximum 100`);

/**
 * Configuration de risque — doit refléter
 * `backend/src/validators/risks.validator.ts` (createRiskConfigurationSchema).
 */
export const riskConfigSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis').max(150, 'Nom trop long'),
    rainWeight: riskWeightField('rainWeight'),
    windWeight: riskWeightField('windWeight'),
    proximityWeight: riskWeightField('proximityWeight'),
    vulnerabilityWeight: riskWeightField('vulnerabilityWeight'),
    exposureWeight: riskWeightField('exposureWeight'),
    lowThreshold: riskThresholdField('lowThreshold'),
    moderateThreshold: riskThresholdField('moderateThreshold'),
    highThreshold: riskThresholdField('highThreshold'),
    extremeThreshold: riskThresholdField('extremeThreshold'),
    isActive: z.boolean(),
  })
  .refine(
    (d) =>
      Math.round(
        (d.rainWeight +
          d.windWeight +
          d.proximityWeight +
          d.vulnerabilityWeight +
          d.exposureWeight) *
          10000,
      ) === 10000,
    { message: 'La somme des poids doit être égale à 1', path: ['rainWeight'] },
  )
  .refine(
    (d) =>
      d.lowThreshold < d.moderateThreshold &&
      d.moderateThreshold < d.highThreshold &&
      d.highThreshold < d.extremeThreshold &&
      d.extremeThreshold <= 100,
    {
      message: 'Les seuils doivent être strictement croissants et inférieurs ou égaux à 100',
      path: ['extremeThreshold'],
    },
  );
