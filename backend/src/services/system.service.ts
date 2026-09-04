import { systemRepository, DatabaseStatusReport } from '../repositories/system.repository';
import { logger } from '../config/logger';
import { AppError } from '../utils/app-error';

export const systemService = {
  async getDatabaseStatus(): Promise<DatabaseStatusReport> {
    try {
      const report = await systemRepository.getDatabaseStatus();
      logger.info({ report }, 'Diagnostic base de données effectué');
      return report;
    } catch (err) {
      logger.error({ err }, 'Échec du diagnostic base de données');
      throw AppError.internal('Impossible de contacter la base de données');
    }
  },
};
