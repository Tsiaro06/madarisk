import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authRateLimiter, refreshRateLimiter } from '../middlewares/rate-limit.middleware';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

router.post(
  '/refresh',
  refreshRateLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh),
);

router.post(
  '/logout',
  validate({ body: refreshSchema }),
  asyncHandler(authController.logout),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(authController.me),
);

export default router;
