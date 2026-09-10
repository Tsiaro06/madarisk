import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  refreshWeatherSchema,
  communeIdParamsSchema,
  weatherHistoryQuerySchema,
  weatherMapQuerySchema,
} from '../validators/weather.validator';

const router = Router();

router.use(authenticate);

router.get(
  '/map-layer',
  validate({ query: weatherMapQuerySchema }),
  asyncHandler(weatherController.mapLayer),
);

router.post(
  '/refresh/communes',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: refreshWeatherSchema }),
  asyncHandler(weatherController.refresh),
);

router.post(
  '/ingest/dgm-maproom',
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(weatherController.ingestDgmMaproom),
);

router.get(
  '/communes/:communeId/latest',
  validate({ params: communeIdParamsSchema }),
  asyncHandler(weatherController.latest),
);

router.get(
  '/communes/:communeId/forecast',
  validate({ params: communeIdParamsSchema }),
  asyncHandler(weatherController.forecast),
);

router.get(
  '/communes/:communeId/history',
  validate({ params: communeIdParamsSchema, query: weatherHistoryQuerySchema }),
  asyncHandler(weatherController.history),
);

export default router;
