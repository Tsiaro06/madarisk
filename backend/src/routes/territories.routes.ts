import { Router } from 'express';
import { territoriesController } from '../controllers/territories.controller';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  listDistrictsQuerySchema,
  listCommunesQuerySchema,
  searchQuerySchema,
  districtsMapQuerySchema,
  communesMapQuerySchema,
  districtIdParamsSchema,
  communeIdParamsSchema,
} from '../validators/territories.validator';

const router = Router();

router.use(authenticate);

router.get(
  '/districts',
  validate({ query: listDistrictsQuerySchema }),
  asyncHandler(territoriesController.listDistricts),
);

router.get(
  '/districts/:id',
  validate({ params: districtIdParamsSchema }),
  asyncHandler(territoriesController.getDistrictById),
);

router.get(
  '/communes',
  validate({ query: listCommunesQuerySchema }),
  asyncHandler(territoriesController.listCommunes),
);

router.get(
  '/communes/:id',
  validate({ params: communeIdParamsSchema }),
  asyncHandler(territoriesController.getCommuneById),
);

router.get(
  '/search',
  validate({ query: searchQuerySchema }),
  asyncHandler(territoriesController.search),
);

router.get(
  '/map/districts',
  validate({ query: districtsMapQuerySchema }),
  asyncHandler(territoriesController.mapDistricts),
);

router.get(
  '/map/communes',
  validate({ query: communesMapQuerySchema }),
  asyncHandler(territoriesController.mapCommunes),
);

export default router;
