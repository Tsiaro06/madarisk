import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import { detectionRulesController } from '../controllers/detection-rules.controller';
import {
  listDetectionRulesQuerySchema,
  detectionRuleIdParamsSchema,
} from '../validators/detection-rules.validator';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

router.get(
  '/',
  validate({ query: listDetectionRulesQuerySchema }),
  asyncHandler(detectionRulesController.listRules),
);

router.get(
  '/:id',
  validate({ params: detectionRuleIdParamsSchema }),
  asyncHandler(detectionRulesController.getRule),
);

export default router;
