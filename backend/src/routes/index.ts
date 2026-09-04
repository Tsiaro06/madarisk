import { Router } from 'express';
import healthRoutes from './health.routes';
import systemRoutes from './system.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/system', systemRoutes);

export default router;
