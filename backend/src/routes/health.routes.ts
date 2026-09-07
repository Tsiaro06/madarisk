import { Router, Request, Response } from 'express';
import { successResponse } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import { env } from '../config/env';
import { db } from '../config/database';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const dbOk = await db.healthCheck();
    const status = dbOk ? 'ok' : 'degraded';

    res.status(200).json(
      successResponse(
        {
          status,
          environment: env.NODE_ENV,
          database: dbOk ? 'connected' : 'unavailable',
          timestamp: new Date().toISOString(),
        },
        'API MadaRisk Map opérationnelle.',
      ),
    );
  }),
);

export default router;
