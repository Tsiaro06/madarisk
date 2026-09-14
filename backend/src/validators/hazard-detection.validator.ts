import { z } from 'zod';

export const detectionRunSchema = z
  .object({
    scope: z.enum(['OBSERVATIONS', 'FORECASTS', 'ALL']).optional().default('ALL'),
  })
  .strict();

export const detectionRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DetectRunInput = z.infer<typeof detectionRunSchema>;
export type DetectionRunsQuery = z.infer<typeof detectionRunsQuerySchema>;
