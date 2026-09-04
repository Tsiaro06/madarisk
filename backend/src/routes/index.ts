import { Router } from 'express';
import healthRoutes from './health.routes';
import systemRoutes from './system.routes';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/system', systemRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);

export default router;
