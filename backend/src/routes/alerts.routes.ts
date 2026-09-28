import { Router } from 'express';
import { alertsController } from '../controllers/alerts.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  alertIdParamsSchema,
  createAlertSchema,
  generateAutomaticAlertsSchema,
  listAlertsQuerySchema,
  updateAlertSchema,
} from '../validators/alerts.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: createAlertSchema }),
  asyncHandler(alertsController.create),
);

router.get('/', validate({ query: listAlertsQuerySchema }), asyncHandler(alertsController.list));

router.get(
  '/automatic',
  validate({ query: listAlertsQuerySchema }),
  asyncHandler(alertsController.listAutomatic),
);

router.post(
  '/automatic/generate',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: generateAutomaticAlertsSchema }),
  asyncHandler(alertsController.generateAutomatic),
);

router.get(
  '/:id',
  validate({ params: alertIdParamsSchema }),
  asyncHandler(alertsController.getById),
);

router.get(
  '/:id/history',
  validate({ params: alertIdParamsSchema }),
  asyncHandler(alertsController.getHistory),
);

router.patch(
  '/:id',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: alertIdParamsSchema, body: updateAlertSchema }),
  asyncHandler(alertsController.update),
);

router.post(
  '/:id/publish',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: alertIdParamsSchema }),
  asyncHandler(alertsController.publish),
);

router.post(
  '/:id/archive',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: alertIdParamsSchema }),
  asyncHandler(alertsController.archive),
);

export default router;
