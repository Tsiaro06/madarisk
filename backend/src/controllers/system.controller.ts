import { Request, Response } from 'express';
import { systemService } from '../services/system.service';
import { successResponse } from '../utils/api-response';
import { env } from '../config/env';

export const systemController = {
  async getDatabaseStatus(_req: Request, res: Response): Promise<void> {
    if (env.NODE_ENV === 'production') {
      res.status(403).json({ success: false, message: 'Accès interdit en production' });
      return;
    }

    const report = await systemService.getDatabaseStatus();
    res.status(200).json(
      successResponse(report, 'Diagnostic base de données'),
    );
  },
};
