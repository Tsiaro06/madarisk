import { Router } from 'express';
import { importsController } from '../controllers/imports.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadSingleFile } from '../middlewares/upload.middleware';
import {
  createImportSchema,
  listImportsQuerySchema,
  importIdParamsSchema,
  listImportErrorsQuerySchema,
} from '../validators/imports.validator';

const router = Router();

router.use(authenticate, authorize('ANALYSTE_SIG', 'SUPER_ADMIN'));

router.post(
  '/',
  uploadSingleFile,
  validate({ body: createImportSchema }),
  asyncHandler(importsController.create),
);

router.get(
  '/',
  validate({ query: listImportsQuerySchema }),
  asyncHandler(importsController.list),
);

router.get(
  '/:id',
  validate({ params: importIdParamsSchema }),
  asyncHandler(importsController.getById),
);

router.get(
  '/:id/errors',
  validate({ params: importIdParamsSchema, query: listImportErrorsQuerySchema }),
  asyncHandler(importsController.getErrors),
);

export default router;
