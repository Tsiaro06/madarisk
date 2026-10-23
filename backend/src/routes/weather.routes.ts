import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  refreshWeatherSchema,
  communeIdParamsSchema,
  refreshIdParamsSchema,
  weatherBulletinsQuerySchema,
  weatherHistoryQuerySchema,
  weatherHourlyLayerQuerySchema,
  weatherHourlyQuerySchema,
  weatherMapQuerySchema,
  weatherSyncTriggerSchema,
} from '../validators/weather.validator';

const router = Router();

router.use(authenticate);

router.get('/monitoring', asyncHandler(weatherController.monitoring));

// Bulletins météo historiques (données passées, sourcées et datées).
router.get(
  '/bulletins',
  validate({ query: weatherBulletinsQuerySchema }),
  asyncHandler(weatherController.bulletins),
);

router.post(
  '/sync/run',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: weatherSyncTriggerSchema }),
  asyncHandler(weatherController.syncRun),
);

router.get(
  '/map-layer',
  validate({ query: weatherMapQuerySchema }),
  asyncHandler(weatherController.mapLayer),
);

// Couche carte figée sur une heure (passée ou future) : même clé que
// map-layer mais lue dans weather_hourly, sans coût Open-Meteo.
router.get(
  '/hourly-layer',
  validate({ query: weatherHourlyLayerQuerySchema }),
  asyncHandler(weatherController.hourlyLayer),
);

router.post(
  '/refresh/communes',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: refreshWeatherSchema }),
  asyncHandler(weatherController.refresh),
);

// Suivi d'un run national lancé en tâche de fond (voir weatherController.refresh).
router.get(
  '/refresh/:refreshId',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: refreshIdParamsSchema }),
  asyncHandler(weatherController.refreshStatus),
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

// Courbe horaire d'une commune : passé (réanalyse) et prévision mélangés,
// distingués par `isForecast`.
router.get(
  '/communes/:communeId/hourly',
  validate({ params: communeIdParamsSchema, query: weatherHourlyQuerySchema }),
  asyncHandler(weatherController.hourlySeries),
);

// Cumul de pluie décadaire officiel (DGM) : route distincte de `latest` car la
// valeur est un cumul de 10 jours, jamais une pluie courante.
router.get(
  '/communes/:communeId/dekadal',
  validate({ params: communeIdParamsSchema }),
  asyncHandler(weatherController.dekadal),
);

export default router;
