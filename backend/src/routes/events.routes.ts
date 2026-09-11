import { Router } from 'express';
import { eventsController } from '../controllers/events.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createEventSchema,
  updateEventSchema,
  updateEventStatusSchema,
  listEventsQuerySchema,
  eventIdParamsSchema,
  eventIdAreaIdParamsSchema,
  createTrackSchema,
  listTracksQuerySchema,
  calculateAreaSchema,
  createPolygonAreaSchema,
  calculateExposureSchema,
  listExposedCommunesQuerySchema,
} from '../validators/events.validator';
import { recalculateEventRiskSchema } from '../validators/risks.validator';
import { risksController } from '../controllers/risks.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: createEventSchema }),
  asyncHandler(eventsController.create),
);

router.get('/', validate({ query: listEventsQuerySchema }), asyncHandler(eventsController.list));

router.get(
  '/:id',
  validate({ params: eventIdParamsSchema }),
  asyncHandler(eventsController.getById),
);

router.patch(
  '/:id',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: updateEventSchema }),
  asyncHandler(eventsController.update),
);

router.patch(
  '/:id/status',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: updateEventStatusSchema }),
  asyncHandler(eventsController.updateStatus),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema }),
  asyncHandler(eventsController.remove),
);

router.post(
  '/:id/tracks',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: createTrackSchema }),
  asyncHandler(eventsController.addTrack),
);

router.get(
  '/:id/tracks',
  validate({ params: eventIdParamsSchema, query: listTracksQuerySchema }),
  asyncHandler(eventsController.listTracks),
);

router.get(
  '/:id/track-geojson',
  validate({ params: eventIdParamsSchema }),
  asyncHandler(eventsController.getTrackGeoJson),
);

router.post(
  '/:id/areas/calculate',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: calculateAreaSchema }),
  asyncHandler(eventsController.calculateArea),
);

router.get(
  '/:id/areas',
  validate({ params: eventIdParamsSchema }),
  asyncHandler(eventsController.getAreas),
);

router.post(
  '/:id/areas/polygon',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: createPolygonAreaSchema }),
  asyncHandler(eventsController.createAreaFromPolygon),
);

router.delete(
  '/:id/areas/:areaId',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdAreaIdParamsSchema }),
  asyncHandler(eventsController.deleteArea),
);

router.post(
  '/:id/exposure/calculate',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, query: calculateExposureSchema }),
  asyncHandler(eventsController.calculateExposure),
);

router.post(
  '/:id/risks/recalculate',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: eventIdParamsSchema, body: recalculateEventRiskSchema }),
  asyncHandler(risksController.recalculateEvent),
);

router.get(
  '/:id/exposed-communes',
  validate({ params: eventIdParamsSchema, query: listExposedCommunesQuerySchema }),
  asyncHandler(eventsController.listExposedCommunes),
);

export default router;
