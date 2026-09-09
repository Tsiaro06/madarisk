import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court'),
});

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(100),
  lastName: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court').max(128),
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

export const riskConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    rainWeight: z.coerce.number().min(0).max(1),
    windWeight: z.coerce.number().min(0).max(1),
    proximityWeight: z.coerce.number().min(0).max(1),
    vulnerabilityWeight: z.coerce.number().min(0).max(1),
    exposureWeight: z.coerce.number().min(0).max(1),
    lowThreshold: z.coerce.number().min(0).max(100),
    moderateThreshold: z.coerce.number().min(0).max(100),
    highThreshold: z.coerce.number().min(0).max(100),
    extremeThreshold: z.coerce.number().min(0).max(100),
    isActive: z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    const sum =
      d.rainWeight +
      d.windWeight +
      d.proximityWeight +
      d.vulnerabilityWeight +
      d.exposureWeight;
    if (Math.round(sum * 10000) !== 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La somme des poids doit être égale à 1',
        path: ['rainWeight'],
      });
    }
    if (
      !(
        d.lowThreshold < d.moderateThreshold &&
        d.moderateThreshold < d.highThreshold &&
        d.highThreshold < d.extremeThreshold
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seuils strictement croissants requis',
        path: ['extremeThreshold'],
      });
    }
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
