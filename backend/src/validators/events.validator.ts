import { z } from 'zod';

const eventTypeEnum = z.enum([
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'AUTRE',
]);

const eventStatusEnum = z.enum(['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']);

const severityLevelEnum = z.enum(['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME']);

const trackTypeEnum = z.enum(['OBSERVEE', 'PREVUE']);

const riskPhaseEnum = z.enum(['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT']);

const riskLevelEnum = z.enum(['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME']);

export const createEventSchema = z
  .object({
    eventCode: z
      .string()
      .trim()
      .min(1, 'eventCode requis')
      .max(100, 'eventCode trop long')
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'eventCode ne peut contenir que des lettres, chiffres, points, tirets ou underscores',
      ),
    name: z.string().trim().min(1, 'name requis').max(200, 'name trop long'),
    type: eventTypeEnum,
    status: eventStatusEnum.optional(),
    severity: severityLevelEnum.optional(),
    description: z.string().trim().optional().nullable(),
    sourceName: z.string().trim().max(150).optional().nullable(),
    sourceUrl: z
      .union([z.string().url('sourceUrl doit être une URL valide'), z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .optional()
      .nullable(),
    startedAt: z
      .union([z.coerce.date(), z.literal('')])
      .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
      .optional()
      .nullable(),
    expectedEndAt: z
      .union([z.coerce.date(), z.literal('')])
      .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
      .optional()
      .nullable(),
  })
  .refine(
    (data) => !data.startedAt || !data.expectedEndAt || data.expectedEndAt >= data.startedAt,
    { message: 'expectedEndAt doit être postérieur ou égal à startedAt', path: ['expectedEndAt'] },
  );

export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1, 'name requis').max(200).optional(),
    type: eventTypeEnum.optional(),
    severity: severityLevelEnum.optional(),
    description: z.string().trim().optional().nullable(),
    sourceName: z.string().trim().max(150).optional().nullable(),
    sourceUrl: z
      .union([z.string().url('sourceUrl doit être une URL valide'), z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .optional()
      .nullable(),
    startedAt: z
      .union([z.coerce.date(), z.literal('')])
      .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
      .optional()
      .nullable(),
    expectedEndAt: z
      .union([z.coerce.date(), z.literal('')])
      .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
      .optional()
      .nullable(),
  })
  .refine(
    (data) => !data.startedAt || !data.expectedEndAt || data.expectedEndAt >= data.startedAt,
    { message: 'expectedEndAt doit être postérieur ou égal à startedAt', path: ['expectedEndAt'] },
  );

export const updateEventStatusSchema = z.object({
  status: eventStatusEnum,
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: eventTypeEnum.optional(),
  status: eventStatusEnum.optional(),
  severity: severityLevelEnum.optional(),
  startedAfter: z.coerce.date().optional(),
  startedBefore: z.coerce.date().optional(),
  search: z.string().trim().optional(),
});

export const eventIdParamsSchema = z.object({
  id: z.string().uuid("Identifiant d'événement invalide"),
});

export const createTrackSchema = z.object({
  observedAt: z.coerce.date().transform((d) => d.toISOString()),
  forecastFor: z
    .union([z.coerce.date(), z.literal('')])
    .transform((v) => (v === '' ? null : v instanceof Date ? v.toISOString() : v))
    .optional()
    .nullable(),
  trackType: trackTypeEnum.default('OBSERVEE'),
  latitude: z.coerce
    .number()
    .min(-90, 'latitude entre -90 et 90')
    .max(90, 'latitude entre -90 et 90'),
  longitude: z.coerce
    .number()
    .min(-180, 'longitude entre -180 et 180')
    .max(180, 'longitude entre -180 et 180'),
  windSpeedKmh: z.coerce.number().min(0).optional().nullable(),
  gustSpeedKmh: z.coerce.number().min(0).optional().nullable(),
  pressureHpa: z.coerce.number().min(0).optional().nullable(),
  precipitationMm: z.coerce.number().min(0).optional().nullable(),
  movementDirection: z.string().trim().max(50).optional().nullable(),
  movementSpeedKmh: z.coerce.number().min(0).optional().nullable(),
});

export const listTracksQuerySchema = z.object({
  trackType: trackTypeEnum.optional(),
});

export const calculateAreaSchema = z.object({
  phase: riskPhaseEnum,
  riskLevel: riskLevelEnum,
  radiusKm: z.coerce.number().min(1, 'radiusKm minimum 1 km').max(500, 'radiusKm maximum 500 km'),
});

const geoPositionSchema = z
  .tuple([
    z.number().min(-180, 'longitude entre -180 et 180').max(180, 'longitude entre -180 et 180'),
    z.number().min(-90, 'latitude entre -90 et 90').max(90, 'latitude entre -90 et 90'),
  ])
  .describe('Position GeoJSON [longitude, latitude]');

const polygonRingSchema = z
  .array(geoPositionSchema)
  .min(4, 'Un polygone doit avoir au moins 4 sommets (fermé)');

const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(polygonRingSchema).min(1, 'Un polygone doit avoir au moins un contour'),
});

const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(polygonRingSchema).min(1)).min(1),
});

export const createPolygonAreaSchema = z.object({
  phase: riskPhaseEnum,
  riskLevel: riskLevelEnum,
  geometry: z.union([polygonGeometrySchema, multiPolygonGeometrySchema]),
});

export const calculateExposureSchema = z.object({
  areaId: z.string().uuid('Identifiant de zone invalide').optional(),
  allAreas: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const listExposedCommunesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  districtId: z.string().uuid('District invalide').optional(),
  riskLevel: riskLevelEnum.optional(),
  minDistanceKm: z.coerce.number().min(0).optional(),
  maxDistanceKm: z.coerce.number().min(0).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateEventStatusInput = z.infer<typeof updateEventStatusSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type ListTracksQuery = z.infer<typeof listTracksQuerySchema>;
export type CalculateAreaInput = z.infer<typeof calculateAreaSchema>;
export type CreatePolygonAreaInput = z.infer<typeof createPolygonAreaSchema>;
export type CalculateExposureInput = z.infer<typeof calculateExposureSchema>;
export type ListExposedCommunesQuery = z.infer<typeof listExposedCommunesQuerySchema>;
