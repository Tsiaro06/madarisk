import { Router } from 'express';
import healthRoutes from './health.routes';
import systemRoutes from './system.routes';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import territoriesRoutes from './territories.routes';
import importsRoutes from './imports.routes';
import matchingRoutes from './matching.routes';
import eventsRoutes from './events.routes';
import weatherRoutes from './weather.routes';
import risksRoutes from './risks.routes';
import riskConfigurationsRoutes from './risk-configurations.routes';
import alertsRoutes from './alerts.routes';
import dashboardRoutes from './dashboard.routes';
import reportsRoutes from './reports.routes';
import aiRoutes from './ai.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/system', systemRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/territories', territoriesRoutes);
router.use('/imports', importsRoutes);
router.use('/matching', matchingRoutes);
router.use('/events', eventsRoutes);
router.use('/weather', weatherRoutes);
router.use('/risks', risksRoutes);
router.use('/risk-configurations', riskConfigurationsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/ai', aiRoutes);

export default router;
