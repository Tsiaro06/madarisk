import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { realtimeService } from '../services/realtime.service';

const router = Router();

/**
 * Flux Server-Sent Events temps réel (alertes automatiques, détections).
 *
 * L'event source du navigateur ne peut pas porter d'en-tête Authorization :
 * le frontend lit ce flux via fetch() + reader, qui, lui, supporte le jeton.
 */
router.get('/', authenticate, (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('retry: 5000\n\n');
  realtimeService.subscribe(res);

  req.on('close', () => {
    realtimeService.unsubscribe(res);
  });
});

export default router;
