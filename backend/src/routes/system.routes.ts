import { Router } from 'express';
import { systemController } from '../controllers/system.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get('/database-status', asyncHandler((req, res) => systemController.getDatabaseStatus(req, res)));

export default router;
