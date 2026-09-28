import { z } from 'zod';

export const demoTargetStepSchema = z.enum(['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']);

export const demoStepBodySchema = z.object({
  step: demoTargetStepSchema,
});

export type DemoStepBody = z.infer<typeof demoStepBodySchema>;
