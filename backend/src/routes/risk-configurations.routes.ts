import { Router } from 'express';
import { risksController } from '../controllers/risks.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createRiskConfigurationSchema,
  riskConfigurationIdParamsSchema,
  updateRiskConfigurationSchema,
} from '../validators/risks.validator';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(risksController.listConfigurations));

router.get(
  '/:id',
  validate({ params: riskConfigurationIdParamsSchema }),
  asyncHandler(risksController.getConfiguration),
);

router.post(
  '/',
  authorize('SUPER_ADMIN'),
  validate({ body: createRiskConfigurationSchema }),
  asyncHandler(risksController.createConfiguration),
);

router.patch(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: riskConfigurationIdParamsSchema, body: updateRiskConfigurationSchema }),
  asyncHandler(risksController.updateConfiguration),
);

export default router;
