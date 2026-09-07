import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  changePasswordSchema,
  listUsersQuerySchema,
  userIdParamsSchema,
} from '../validators/users.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('SUPER_ADMIN'),
  validate({ body: createUserSchema }),
  asyncHandler(usersController.create),
);

router.get(
  '/',
  authorize('SUPER_ADMIN'),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(usersController.list),
);

router.patch(
  '/me/password',
  validate({ body: changePasswordSchema }),
  asyncHandler(usersController.changePassword),
);

router.get('/:id', validate({ params: userIdParamsSchema }), asyncHandler(usersController.getById));

router.patch(
  '/:id',
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  asyncHandler(usersController.update),
);

router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN'),
  validate({ params: userIdParamsSchema, body: updateUserStatusSchema }),
  asyncHandler(usersController.updateStatus),
);

export default router;
