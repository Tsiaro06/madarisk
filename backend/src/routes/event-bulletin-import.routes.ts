import { Router } from 'express';
import { eventBulletinImportController } from '../controllers/event-bulletin-import.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadEventBulletinFile } from '../middlewares/upload.middleware';
import {
  eventBulletinImportSchema,
  eventBulletinPreviewSchema,
} from '../validators/event-bulletin-import.validator';

const router = Router();

router.use(authenticate, authorize('ANALYSTE_SIG', 'ADMIN', 'SUPER_ADMIN'));

router.post(
  '/preview',
  uploadEventBulletinFile,
  validate({ body: eventBulletinPreviewSchema }),
  asyncHandler(eventBulletinImportController.preview),
);

router.post(
  '/import',
  uploadEventBulletinFile,
  validate({ body: eventBulletinImportSchema }),
  asyncHandler(eventBulletinImportController.import),
);

export default router;
