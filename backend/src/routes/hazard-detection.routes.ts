import { Router } from 'express';
import { hazardDetectionController } from '../controllers/hazard-detection.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  detectionRunSchema,
  detectionRunsQuerySchema,
} from '../validators/hazard-detection.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/run',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: detectionRunSchema }),
  asyncHandler(hazardDetectionController.run),
);

router.get(
  '/runs',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ query: detectionRunsQuerySchema }),
  asyncHandler(hazardDetectionController.runs),
);

export default router;
