import { Router } from 'express';
import { alertsController } from '../controllers/alerts.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  alertIdParamsSchema,
  createAlertSchema,
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
  '/:id',
  validate({ params: alertIdParamsSchema }),
  asyncHandler(alertsController.getById),
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
