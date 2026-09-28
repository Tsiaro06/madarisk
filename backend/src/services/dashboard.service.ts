import { UserRole } from '../types/auth.types';
import { PriorityCommune } from '../types/risk.types';
import {
  DashboardSummaryData,
  EventsTimelineEntry,
  dashboardRepository,
} from '../repositories/dashboard.repository';
import { risksService } from './risk.service';

interface LatestAlertSummary {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  publishedAt: string | null;
}

export interface DashboardSummary extends DashboardSummaryData {
  pendingMatchings?: number;
  latestAlerts: LatestAlertSummary[];
  priorityCommunes: PriorityCommune[];
}

export interface RiskDistribution {
  FAIBLE: number;
  MODERE: number;
  ELEVE: number;
  EXTREME: number;
  SANS_RISQUE: number;
}

export interface EventsTimelineQueryInput {
  eventId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface DashboardPriorityQueryInput {
  eventId?: string;
  districtId?: string;
  limit: number;
}

const DEFAULT_TIMELINE_DAYS = 30;

export const dashboardService = {
  async summary(
    actor: { id: string; role: UserRole },
    eventId?: string,
  ): Promise<DashboardSummary> {
    const data = await dashboardRepository.summaryData(eventId);

    const includeMatchings = actor.role === 'ANALYSTE_SIG' || actor.role === 'SUPER_ADMIN';

    const [latestAlerts, priorityCommunes, pendingMatchings] = await Promise.all([
      dashboardRepository.latestAlerts(5, eventId),
      risksService.priorityCommunes({ eventId, limit: 5 }),
      includeMatchings ? dashboardRepository.countPendingMatchings() : Promise.resolve(0),
    ]);

    return {
      ...data,
      pendingMatchings: includeMatchings ? pendingMatchings : undefined,
      latestAlerts,
      priorityCommunes,
    };
  },

  async riskDistribution(eventId?: string): Promise<RiskDistribution> {
    const [entries, totalCommunes] = await Promise.all([
      dashboardRepository.riskDistribution(eventId),
      eventId ? Promise.resolve(0) : dashboardRepository.countCommunes(),
    ]);

    const distribution: RiskDistribution = {
      FAIBLE: 0,
      MODERE: 0,
      ELEVE: 0,
      EXTREME: 0,
      SANS_RISQUE: eventId ? 0 : totalCommunes,
    };

    let assessed = 0;
    for (const entry of entries) {
      const level = entry.riskLevel as keyof RiskDistribution;
      if (level in distribution) {
        distribution[level] = entry.count;
        assessed += entry.count;
      }
    }
    distribution.SANS_RISQUE = eventId ? 0 : Math.max(0, totalCommunes - assessed);
    return distribution;
  },

  async eventsTimeline(query: EventsTimelineQueryInput): Promise<EventsTimelineEntry[]> {
    const defaultFrom = Date.now() - DEFAULT_TIMELINE_DAYS * 24 * 60 * 60 * 1000;
    const dateFrom = query.dateFrom ?? new Date(defaultFrom);
    const dateTo = query.dateTo ?? new Date();
    return dashboardRepository.eventsTimeline(dateFrom, dateTo, query.eventId);
  },

  async priorityCommunes(query: DashboardPriorityQueryInput): Promise<PriorityCommune[]> {
    return risksService.priorityCommunes({
      eventId: query.eventId,
      districtId: query.districtId,
      limit: query.limit,
    });
  },
};
