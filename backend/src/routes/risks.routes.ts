import { Router } from 'express';
import { risksController } from '../controllers/risks.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  communeRiskQuerySchema,
  communeIdParamsSchema,
  priorityCommunesQuerySchema,
  recalculateRiskSchema,
  riskMapLayerQuerySchema,
} from '../validators/risks.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/recalculate',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: recalculateRiskSchema }),
  asyncHandler(risksController.recalculate),
);

router.get(
  '/communes/:communeId',
  validate({ params: communeIdParamsSchema, query: communeRiskQuerySchema }),
  asyncHandler(risksController.communeRisks),
);

router.get(
  '/priority-communes',
  validate({ query: priorityCommunesQuerySchema }),
  asyncHandler(risksController.priorityCommunes),
);

router.get(
  '/map-layer',
  validate({ query: riskMapLayerQuerySchema }),
  asyncHandler(risksController.mapLayer),
);

export default router;