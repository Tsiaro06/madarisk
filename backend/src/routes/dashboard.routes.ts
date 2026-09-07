import { Router } from 'express';
import { z } from 'zod';
import { dashboardController } from '../controllers/dashboard.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validate } from '../middlewares/validate.middleware';
import { priorityCommunesQuerySchema } from '../validators/risks.validator';

const eventsTimelineQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const router = Router();

router.use(authenticate);

router.get('/summary', asyncHandler(dashboardController.summary));

router.get('/risk-distribution', asyncHandler(dashboardController.riskDistribution));

router.get(
  '/events-timeline',
  validate({ query: eventsTimelineQuerySchema }),
  asyncHandler(dashboardController.eventsTimeline),
);

router.get(
  '/priority-communes',
  validate({ query: priorityCommunesQuerySchema }),
  asyncHandler(dashboardController.priorityCommunes),
);

export default router;
