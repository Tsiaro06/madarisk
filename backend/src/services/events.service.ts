import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { usersRepository } from '../repositories/users.repository';
import { eventsRepository } from '../repositories/events.repository';
import {
  AreaGeoJson,
  EventDetail,
  EventListItem,
  EventStatus,
  EventTrack,
  ExposureCalculationResult,
  ExposedCommuneRow,
  TrackGeoJson,
} from '../types/event.types';
import { PaginatedResult } from '../types/territory.types';
import { UserRole } from '../types/auth.types';
import {
  CalculateAreaInput,
  CalculateExposureInput,
  CreateEventInput,
  CreateTrackInput,
  ListEventsQuery,
  ListExposedCommunesQuery,
  ListTracksQuery,
  UpdateEventInput,
  UpdateEventStatusInput,
} from '../validators/events.validator';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

const STATUS_ORDER: Record<EventStatus, number> = {
  BROUILLON: 0,
  PREVISION: 1,
  ACTIF: 2,
  SUIVI: 3,
  CLOTURE: 4,
};

export const eventsService = {
  async create(
    input: CreateEventInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<EventListItem> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent créer un événement');
    }

    const existing = await eventsRepository.findByCode(input.eventCode);
    if (existing) {
      throw AppError.conflict('Un événement avec ce eventCode existe déjà');
    }

    const event = await eventsRepository.create({
      eventCode: input.eventCode,
      name: input.name,
      type: input.type,
      status: input.status ?? 'BROUILLON',
      severity: input.severity ?? 'FAIBLE',
      description: input.description ?? null,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      startedAt: input.startedAt ?? null,
      expectedEndAt: input.expectedEndAt ?? null,
      createdBy: actor.id,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_CREATED',
      entityType: 'hazard_event',
      entityId: event.id,
      newValue: { eventCode: event.eventCode, name: event.name, type: event.type },
      ipAddress: getIp(req),
    });

    return event;
  },

  async list(query: ListEventsQuery): Promise<PaginatedResult<EventListItem>> {
    return eventsRepository.list({
      page: query.page,
      limit: query.limit,
      type: query.type,
      status: query.status,
      severity: query.severity,
      startedAfter: query.startedAfter,
      startedBefore: query.startedBefore,
      search: query.search,
    });
  },

  async getById(id: string): Promise<EventDetail> {
    const event = await eventsRepository.findById(id);
    if (!event) {
      throw AppError.notFound('Événement introuvable');
    }

    const [stats, riskDistribution, alerts] = await Promise.all([
      eventsRepository.getStats(id),
      eventsRepository.getRiskDistribution(id),
      eventsRepository.getAlerts(id),
    ]);

    return {
      ...event,
      stats,
      riskDistribution,
      alerts,
    };
  },

  async update(
    id: string,
    input: UpdateEventInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<EventListItem> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent modifier un événement');
    }

    const existing = await eventsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Événement introuvable');
    }

    const updated = await eventsRepository.update(id, {
      name: input.name,
      type: input.type,
      severity: input.severity,
      description: input.description,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      startedAt: input.startedAt,
      expectedEndAt: input.expectedEndAt,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_UPDATED',
      entityType: 'hazard_event',
      entityId: id,
      oldValue: existing,
      newValue: updated ?? undefined,
      ipAddress: getIp(req),
    });

    return updated!;
  },

  async changeStatus(
    id: string,
    input: UpdateEventStatusInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<EventListItem> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent changer le statut');
    }

    const existing = await eventsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Événement introuvable');
    }

    const current = existing.status;
    const next = input.status;

    if (current === next) {
      return existing;
    }

    // Retour à BROUILLON : réservé au SUPER_ADMIN, sans données opérationnelles critiques.
    if (next === 'BROUILLON' && current !== 'BROUILLON') {
      if (actor.role !== 'SUPER_ADMIN') {
        throw AppError.forbidden('Retour à BROUILLON réservé aux SUPER_ADMIN');
      }
      const data = await eventsRepository.countOperationalData(id);
      const critical =
        data.tracks > 0 || data.areas > 0 || data.alerts > 0 || data.risks > 0 || data.reports > 0;
      if (critical) {
        throw AppError.badRequest(
          'Impossible de revenir à BROUILLON : des données opérationnelles critiques existent',
        );
      }
    } else {
      // Transition séquentielle autorisée : BROUILLON → PREVISION → ACTIF → SUIVI → CLOTURE
      if (STATUS_ORDER[next] !== STATUS_ORDER[current] + 1) {
        throw AppError.badRequest(
          `Transition de statut invalide : ${current} → ${next}. Transitions autorisées : BROUILLON → PREVISION → ACTIF → SUIVI → CLOTURE.`,
        );
      }
    }

    const updated = await eventsRepository.updateStatus(id, next);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_STATUS_CHANGED',
      entityType: 'hazard_event',
      entityId: id,
      oldValue: { status: current },
      newValue: { status: next },
      ipAddress: getIp(req),
    });

    return updated!;
  },

  async remove(
    id: string,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<void> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut supprimer un événement');
    }

    const existing = await eventsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Événement introuvable');
    }

    // Pas de soft delete prévu : on refuse si des données liées existent.
    const data = await eventsRepository.countOperationalData(id);
    if (
      data.tracks > 0 ||
      data.areas > 0 ||
      data.alerts > 0 ||
      data.risks > 0 ||
      data.reports > 0
    ) {
      throw AppError.badRequest(
        'Suppression refusée : des trajectoires, zones, alertes, risques ou rapports existent pour cet événement',
      );
    }

    await eventsRepository.delete(id);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_DELETED',
      entityType: 'hazard_event',
      entityId: id,
      newValue: existing,
      ipAddress: getIp(req),
    });
  },

  async addTrack(
    id: string,
    input: CreateTrackInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<EventTrack> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden(
        'Seuls ADMIN et SUPER_ADMIN peuvent ajouter un point de trajectoire',
      );
    }

    const event = await eventsRepository.findById(id);
    if (!event) {
      throw AppError.notFound('Événement introuvable');
    }

    const track = await eventsRepository.addTrack({
      eventId: id,
      observedAt: input.observedAt,
      forecastFor: input.forecastFor ?? null,
      trackType: input.trackType,
      latitude: input.latitude,
      longitude: input.longitude,
      windSpeedKmh: input.windSpeedKmh ?? null,
      gustSpeedKmh: input.gustSpeedKmh ?? null,
      pressureHpa: input.pressureHpa ?? null,
      precipitationMm: input.precipitationMm ?? null,
      movementDirection: input.movementDirection ?? null,
      movementSpeedKmh: input.movementSpeedKmh ?? null,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_TRACK_ADDED',
      entityType: 'event_track',
      entityId: track.id,
      newValue: { eventId: id, trackType: track.trackType },
      ipAddress: getIp(req),
    });

    return track;
  },

  async listTracks(id: string, query: ListTracksQuery): Promise<EventTrack[]> {
    await this.ensureExists(id);
    return eventsRepository.listTracks(id, query.trackType);
  },

  async getTrackGeoJson(id: string): Promise<TrackGeoJson> {
    await this.ensureExists(id);
    return eventsRepository.trackGeoJson(id);
  },

  async calculateArea(
    id: string,
    input: CalculateAreaInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<{ areaId: string; geometry: unknown; radiusKm: number | null }> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent calculer une zone');
    }

    await this.ensureExists(id);

    const count = await eventsRepository.countTracks(id);
    if (count < 2) {
      throw AppError.badRequest(
        'Au moins deux points de trajectoire sont requis pour calculer une zone',
      );
    }

    const area = await eventsRepository.calculateArea({
      eventId: id,
      phase: input.phase,
      riskLevel: input.riskLevel,
      radiusKm: input.radiusKm,
      source: `phase=${input.phase};risk=${input.riskLevel}`,
    });

    if (!area) {
      throw AppError.badRequest('Impossible de calculer la zone (pas assez de points)');
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_AREA_CALCULATED',
      entityType: 'event_area',
      entityId: area.id,
      newValue: {
        eventId: id,
        phase: input.phase,
        riskLevel: input.riskLevel,
        radiusKm: input.radiusKm,
      },
      ipAddress: getIp(req),
    });

    // Recalcul automatique des communes exposées dès la création d'une zone :
    // toutes les zones existantes sont intersectées avec les communes.
    // Enveloppé dans un try/catch : un échec d'exposition ne doit pas bloquer
    // la création de la zone elle-même.
    try {
      await eventsRepository.calculateExposure(id, null);
    } catch (err) {
      logger.warn({ err, eventId: id }, "Recalcul automatique de l'exposition échoué");
    }

    return { areaId: area.id, geometry: area.geometry, radiusKm: area.radiusKm };
  },

  async getAreas(id: string): Promise<AreaGeoJson> {
    await this.ensureExists(id);
    return eventsRepository.listAreas(id);
  },

  async calculateExposure(
    id: string,
    query: CalculateExposureInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<ExposureCalculationResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden("Seuls ADMIN et SUPER_ADMIN peuvent calculer l'exposition");
    }

    await this.ensureExists(id);

    const hasAreas = await eventsRepository.hasAreas(id);
    if (!hasAreas) {
      throw AppError.badRequest("Aucune zone d'influence disponible pour le calcul d'exposition");
    }

    if (query.allAreas) {
      return eventsRepository.calculateExposure(id, null);
    }
    if (!query.areaId) {
      throw AppError.badRequest('Sélectionnez une zone (areaId) ou activez allAreas');
    }

    const result = await eventsRepository.calculateExposure(id, query.areaId);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'EVENT_EXPOSURE_CALCULATED',
      entityType: 'hazard_event',
      entityId: id,
      newValue: { areaId: query.areaId ?? 'all', totalCommunes: result.totalCommunesCalculated },
      ipAddress: getIp(req),
    });

    return result;
  },

  async listExposedCommunes(
    id: string,
    query: ListExposedCommunesQuery,
  ): Promise<PaginatedResult<ExposedCommuneRow>> {
    await this.ensureExists(id);
    return eventsRepository.listExposedCommunes({
      eventId: id,
      page: query.page,
      limit: query.limit,
      districtId: query.districtId,
      riskLevel: query.riskLevel,
      minDistanceKm: query.minDistanceKm,
      maxDistanceKm: query.maxDistanceKm,
    });
  },

  async ensureExists(id: string): Promise<EventListItem> {
    const event = await eventsRepository.findById(id);
    if (!event) {
      throw AppError.notFound('Événement introuvable');
    }
    return event;
  },
};
