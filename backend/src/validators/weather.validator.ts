import { z } from 'zod';

export const refreshWeatherSchema = z
  .object({
    communeIds: z
      .array(z.string().uuid('Identifiant de commune invalide'))
      .min(1, 'Au moins un identifiant de commune')
      .max(500, 'Trop de communes (maximum 500)')
      .optional(),
    districtId: z.string().uuid('Identifiant de district invalide').optional(),
    eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
    confirmAll: z.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      Boolean(data.communeIds) || Boolean(data.districtId) || Boolean(data.eventId) || data.confirmAll === true,
    {
      message:
        'Précisez au moins un filtre (communeIds, districtId, eventId) ou activez confirmAll',
      path: ['confirmAll'],
    },
  );

export const communeIdParamsSchema = z.object({
  communeId: z.string().uuid('Identifiant de commune invalide'),
});

export const weatherHistoryQuerySchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom,
    { message: 'dateTo doit être postérieur ou égal à dateFrom', path: ['dateTo'] },
  );

export const weatherMapQuerySchema = z.object({
  districtId: z.string().uuid('Identifiant de district invalide').optional(),
  eventId: z.string().uuid('Identifiant d\'événement invalide').optional(),
  observedAt: z.coerce.date().optional(),
});

export type RefreshWeatherInput = z.infer<typeof refreshWeatherSchema>;
export type WeatherHistoryQuery = z.infer<typeof weatherHistoryQuerySchema>;
export type WeatherMapQuery = z.infer<typeof weatherMapQuerySchema>;