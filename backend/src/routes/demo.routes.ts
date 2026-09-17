import { Router } from 'express';
import { demoController } from '../controllers/demo.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import { requireDemoMode } from '../middlewares/demo-mode.middleware';
import { demoStepBodySchema } from '../validators/demo.validator';

const router = Router();

// Routes réservées au mode démonstration isolé (404 hors mode démo).
router.use(requireDemoMode);
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

router.get(
  '/scenario',
  asyncHandler((req, res) => demoController.getScenario(req, res)),
);

router.post(
  '/step',
  validate({ body: demoStepBodySchema }),
  asyncHandler((req, res) => demoController.setStep(req, res)),
);

router.post(
  '/reset',
  asyncHandler((req, res) => demoController.reset(req, res)),
);

export default router;
