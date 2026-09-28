import { z } from 'zod';

const uuidSchema = z.string().uuid('Identifiant invalide');

const dateRange = {
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
};

function validateDateRange<T extends { dateFrom?: Date; dateTo?: Date }>(value: T): boolean {
  return !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo;
}

export const csvExportSchema = z
  .object({
    resourceType: z.enum([
      'communes',
      'districts',
      'events',
      'alerts',
      'risks',
      'exposed-communes',
    ]),
    eventId: uuidSchema.optional(),
    districtId: uuidSchema.optional(),
    communeId: uuidSchema.optional(),
    ...dateRange,
  })
  .refine(validateDateRange, {
    message: 'dateFrom doit être antérieur ou égal à dateTo',
    path: ['dateTo'],
  });

export const geojsonExportSchema = z
  .object({
    resourceType: z.enum(['communes', 'districts', 'event-areas', 'risks']),
    eventId: uuidSchema.optional(),
    districtId: uuidSchema.optional(),
    communeId: uuidSchema.optional(),
    ...dateRange,
  })
  .superRefine((value, ctx) => {
    if (value.resourceType === 'event-areas' && !value.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'eventId est requis pour la ressource event-areas',
        path: ['eventId'],
      });
    }
  })
  .refine(validateDateRange, {
    message: 'dateFrom doit être antérieur ou égal à dateTo',
    path: ['dateTo'],
  });

export const pdfExportSchema = z
  .object({
    title: z.string().trim().min(1).max(250).optional(),
    eventId: uuidSchema.optional(),
    districtId: uuidSchema.optional(),
    communeId: uuidSchema.optional(),
    ...dateRange,
  })
  .refine(validateDateRange, {
    message: 'dateFrom doit être antérieur ou égal à dateTo',
    path: ['dateTo'],
  });

export const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  format: z.enum(['PDF', 'CSV', 'XLSX', 'GEOJSON', 'PNG']).optional(),
  reportType: z.string().trim().min(1).max(100).optional(),
  eventId: uuidSchema.optional(),
});

export const reportIdParamsSchema = z.object({
  id: uuidSchema,
});

export const eventReportParamsSchema = z.object({
  eventId: uuidSchema,
});

export const dashboardReportQuerySchema = z
  .object({
    ...dateRange,
  })
  .refine(validateDateRange, {
    message: 'dateFrom doit être antérieur ou égal à dateTo',
    path: ['dateTo'],
  });

export type CsvExportInput = z.infer<typeof csvExportSchema>;
export type GeoJsonExportInput = z.infer<typeof geojsonExportSchema>;
export type PdfExportInput = z.infer<typeof pdfExportSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
