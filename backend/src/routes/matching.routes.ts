import { Router } from 'express';
import { matchingController } from '../controllers/matching.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  runMatchingParamsSchema,
  listMatchingQuerySchema,
  matchingIdParamsSchema,
  rejectMatchingSchema,
  manualLinkSchema,
} from '../validators/matching.validator';

const router = Router();

router.use(authenticate, authorize('ANALYSTE_SIG', 'SUPER_ADMIN'));

router.post(
  '/run/:importId',
  validate({ params: runMatchingParamsSchema }),
  asyncHandler(matchingController.run),
);

router.get(
  '/',
  validate({ query: listMatchingQuerySchema }),
  asyncHandler(matchingController.list),
);

router.get(
  '/statistics',
  asyncHandler(matchingController.statistics),
);

router.post(
  '/manual-link',
  validate({ body: manualLinkSchema }),
  asyncHandler(matchingController.manualLink),
);

router.post(
  '/:id/approve',
  validate({ params: matchingIdParamsSchema }),
  asyncHandler(matchingController.approve),
);

router.post(
  '/:id/reject',
  validate({ params: matchingIdParamsSchema, body: rejectMatchingSchema }),
  asyncHandler(matchingController.reject),
);

export default router;
