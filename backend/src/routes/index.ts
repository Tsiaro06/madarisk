import { Router } from 'express';
import healthRoutes from './health.routes';
import systemRoutes from './system.routes';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import territoriesRoutes from './territories.routes';
import importsRoutes from './imports.routes';
import matchingRoutes from './matching.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/system', systemRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/territories', territoriesRoutes);
router.use('/imports', importsRoutes);
router.use('/matching', matchingRoutes);

export default router;
