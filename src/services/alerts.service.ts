import { IncomingHttpHeaders } from 'http';
import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { usersRepository } from '../repositories/users.repository';
import { eventsRepository } from '../repositories/events.repository';
import { territoriesRepository } from '../repositories/territories.repository';
import { risksRepository } from '../repositories/risks.repository';
import { alertsRepository } from '../repositories/alerts.repository';
import { Alert, AlertListRow } from '../types/alert.types';
import { RiskAssessment } from '../types/risk.types';
import { UserRole } from '../types/auth.types';
import { PaginatedResult } from '../types/territory.types';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const RISK_ALERT_DEFAULT_THRESHOLD = 80;

function canManage(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export const alertsService = {
  async create(
    input: {
      eventId?: string | null;
      districtId?: string | null;
      communeId?: string | null;
      type: string;
      severity: string;
      title: string;
      message: string;
      expiresAt?: string | null;
    },
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<Alert> {
    if (!canManage(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent créer une alerte');
    }

    if (!input.eventId && !input.districtId && !input.communeId) {
      throw AppError.badRequest('Précisez au moins eventId, districtId ou communeId');
    }

    await this.validateTargets(
      input.eventId ?? null,
      input.districtId ?? null,
      input.communeId ?? null,
    );

    const alert = await alertsRepository.create({
      eventId: input.eventId ?? null,
      districtId: input.districtId ?? null,
      communeId: input.communeId ?? null,
      type: input.type as Alert['type'],
      severity: input.severity as Alert['severity'],
      title: input.title,
      message: input.message,
      expiresAt: input.expiresAt ?? null,
      createdBy: actor.id,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'ALERT_CREATED',
      entityType: 'alert',
      entityId: alert.id,
      newValue: { title: alert.title, type: alert.type, status: alert.status },
      ipAddress: getIp(req),
    });

    return alert;
  },

  async list(
    query: {
      page: number;
      limit: number;
      status?: string;
      type?: string;
      severity?: string;
      eventId?: string;
      districtId?: string;
      communeId?: string;
      activeOnly: boolean;
    },
    actor: { id: string; role: UserRole },
  ): Promise<PaginatedResult<AlertListRow>> {
    const clientOnly = actor.role === 'CLIENT';
    return alertsRepository.list({
      page: query.page,
      limit: query.limit,
      status: query.status as AlertListRow['status'] | undefined,
      type: query.type as AlertListRow['type'] | undefined,
      severity: query.severity as AlertListRow['severity'] | undefined,
      eventId: query.eventId,
      districtId: query.districtId,
      communeId: query.communeId,
      activeOnly: query.activeOnly,
      clientOnly,
    });
  },

  async getById(id: string, actor: { id: string; role: UserRole }): Promise<AlertListRow> {
    const alert = await alertsRepository.findById(id);
    if (!alert) {
      throw AppError.notFound('Alerte introuvable');
    }

    if (actor.role === 'CLIENT') {
      const expired = alert.expiresAt !== null && new Date(alert.expiresAt).getTime() < Date.now();
      if (alert.status !== 'PUBLIEE' || expired) {
        throw AppError.notFound('Alerte introuvable');
      }
    }

    return alert;
  },

  async update(
    id: string,
    input: {
      eventId?: string | null;
      districtId?: string | null;
      communeId?: string | null;
      type?: string;
      severity?: string;
      title?: string;
      message?: string;
      expiresAt?: string | null;
    },
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<Alert> {
    if (!canManage(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent modifier une alerte');
    }

    const existing = await alertsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Alerte introuvable');
    }

    if (existing.status !== 'BROUILLON') {
      throw AppError.badRequest('Seule une alerte en BROUILLON peut être modifiée');
    }

    const eventId = input.eventId !== undefined ? input.eventId : existing.eventId;
    const districtId = input.districtId !== undefined ? input.districtId : existing.districtId;
    const communeId = input.communeId !== undefined ? input.communeId : existing.communeId;

    if (!eventId && !districtId && !communeId) {
      throw AppError.badRequest('Précisez au moins eventId, districtId ou communeId');
    }
    if (districtId && communeId) {
      throw AppError.badRequest('Impossible de cibler à la fois un district et une commune');
    }

    await this.validateTargets(eventId, districtId, communeId);

    const updated = await alertsRepository.update(id, {
      eventId,
      districtId,
      communeId,
      type: input.type as Alert['type'] | undefined,
      severity: input.severity as Alert['severity'] | undefined,
      title: input.title,
      message: input.message,
      expiresAt: input.expiresAt,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'ALERT_UPDATED',
      entityType: 'alert',
      entityId: id,
      oldValue: { title: existing.title, status: existing.status },
      newValue: updated ? { title: updated.title } : undefined,
      ipAddress: getIp(req),
    });

    return updated!;
  },

  async publish(
    id: string,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<Alert> {
    if (!canManage(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent publier une alerte');
    }

    const existing = await alertsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Alerte introuvable');
    }

    if (!existing.title || !existing.message || !existing.type || !existing.severity) {
      throw AppError.badRequest(
        "L'alerte doit contenir title, message, type et severity pour être publiée",
      );
    }

    if (existing.status === 'PUBLIEE') {
      return existing;
    }

    if (existing.status !== 'BROUILLON') {
      throw AppError.badRequest('Seule une alerte en BROUILLON peut être publiée');
    }

    const published = await alertsRepository.publish(id);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'ALERT_PUBLISHED',
      entityType: 'alert',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: 'PUBLIEE', publishedAt: published?.publishedAt ?? null },
      ipAddress: getIp(req),
    });

    return published!;
  },

  async archive(
    id: string,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<Alert> {
    if (!canManage(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent archiver une alerte');
    }

    const existing = await alertsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Alerte introuvable');
    }

    if (existing.status === 'ARCHIVEE') {
      return existing;
    }

    const archived = await alertsRepository.archive(id);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'ALERT_ARCHIVED',
      entityType: 'alert',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: 'ARCHIVEE' },
      ipAddress: getIp(req),
    });

    return archived!;
  },

  async createRiskAlertIfThresholdExceeded(assessments: RiskAssessment[]): Promise<Alert[]> {
    const configuration = await risksRepository.getActiveConfiguration();
    const threshold = configuration ? configuration.extremeThreshold : RISK_ALERT_DEFAULT_THRESHOLD;

    const created: Alert[] = [];
    const seen = new Set<string>();

    for (const assessment of assessments) {
      const thresholdExceeded =
        assessment.riskScore >= threshold || assessment.riskLevel === 'EXTREME';
      if (!thresholdExceeded) continue;

      const key = `${assessment.eventId ?? 'none'}::${assessment.communeId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = await alertsRepository.findActiveSimilar(
        assessment.eventId,
        assessment.communeId,
      );
      if (existing) continue;

      const [communeName, eventName] = await Promise.all([
        assessment.communeId
          ? alertsRepository.getCommuneName(assessment.communeId)
          : Promise.resolve(null),
        assessment.eventId
          ? alertsRepository.getEventName(assessment.eventId)
          : Promise.resolve(null),
      ]);

      const levelLabel = assessment.riskLevel === 'EXTREME' ? 'extrême' : 'élevé';
      const target = communeName ?? 'une commune';
      const eventPart = eventName ? ` dans le cadre de l'événement « ${eventName} »` : '';

      const alert = await alertsRepository.create({
        eventId: assessment.eventId,
        communeId: assessment.communeId,
        type: 'URGENCE',
        severity: assessment.riskLevel === 'EXTREME' ? 'EXTREME' : 'ELEVEE',
        title: `Risque ${levelLabel} détecté${communeName ? ` — ${communeName}` : ''}`,
        message:
          `Une évaluation automatique détecte un risque ${levelLabel} (score ` +
          `${assessment.riskScore}/100) pour ${target}${eventPart}. ` +
          `Alerte à valider avant publication.`,
        createdBy: null,
      });

      created.push(alert);
    }

    if (created.length > 0) {
      logger.info({ count: created.length }, 'Alertes brouillon générées depuis un risque extrême');
    }

    return created;
  },

  async validateTargets(
    eventId: string | null,
    districtId: string | null,
    communeId: string | null,
  ): Promise<void> {
    if (eventId) {
      const event = await eventsRepository.findById(eventId);
      if (!event) {
        throw AppError.notFound('Événement lié introuvable');
      }
    }
    if (districtId) {
      const district = await territoriesRepository.findDistrictById(districtId);
      if (!district) {
        throw AppError.notFound('District lié introuvable');
      }
    }
    if (communeId) {
      const exists = await territoriesRepository.communeExists(communeId);
      if (!exists) {
        throw AppError.notFound('Commune liée introuvable');
      }
    }
  },
};
