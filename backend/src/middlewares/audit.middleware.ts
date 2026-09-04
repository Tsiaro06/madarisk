import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';

interface AuditEntry {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function writeAuditLog(entry: AuditEntry, req: Request): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId ?? req.user?.id ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
        entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
        req.ip ?? req.socket?.remoteAddress ?? null,
      ],
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Échec écriture journal d\'audit');
  }
}

export function audit(options: { action: string; entityType?: string; entityIdParam?: string }) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    next();
    try {
      const entityId = options.entityIdParam ? String(req.params[options.entityIdParam]) : undefined;
      await writeAuditLog(
        {
          action: options.action,
          entityType: options.entityType,
          entityId,
          newValue: req.body,
        },
        req,
      );
    } catch {
      // L'audit ne doit jamais faire échouer la requête principale
    }
  };
}
