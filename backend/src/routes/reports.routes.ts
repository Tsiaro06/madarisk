import { Router } from 'express';
import { reportsController } from '../controllers/reports.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  csvExportSchema,
  dashboardReportQuerySchema,
  eventReportParamsSchema,
  geojsonExportSchema,
  pdfExportSchema,
  reportIdParamsSchema,
  reportListQuerySchema,
} from '../validators/reports.validator';

const router = Router();

router.use(authenticate);

router.get(
  '/dashboard',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ query: dashboardReportQuerySchema }),
  asyncHandler(reportsController.dashboardReport),
);

router.get(
  '/events/:eventId',
  validate({ params: eventReportParamsSchema }),
  asyncHandler(reportsController.eventReport),
);

router.post(
  '/export/csv',
  validate({ body: csvExportSchema }),
  asyncHandler(reportsController.exportCsv),
);

router.post(
  '/export/geojson',
  validate({ body: geojsonExportSchema }),
  asyncHandler(reportsController.exportGeoJson),
);

router.post(
  '/export/pdf',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ body: pdfExportSchema }),
  asyncHandler(reportsController.exportPdf),
);

router.get(
  '/',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ query: reportListQuerySchema }),
  asyncHandler(reportsController.list),
);

router.get(
  '/:id/download',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate({ params: reportIdParamsSchema }),
  asyncHandler(reportsController.download),
);

export default router;
