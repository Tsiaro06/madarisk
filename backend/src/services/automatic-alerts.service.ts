import { env } from '../config/env';
import { logger } from '../config/logger';
import { eventsRepository } from '../repositories/events.repository';
import { exposureRepository } from '../repositories/exposure.repository';
import { alertsRepository } from '../repositories/alerts.repository';
import type {
  Alert,
  AlertBasis,
  AlertGenerationTrigger,
  AlertStatus,
  AlertType,
} from '../types/alert.types';
import type { EventType, SeverityLevel, EventStatus } from '../types/event.types';

interface GenerateOptions {
  eventId: string;
  trigger: AlertGenerationTrigger;
  communeIds?: string[];
  basisOverride?: AlertBasis;
  autoPublish?: boolean;
}

export interface AlertGenerationResult {
  eventId: string;
  basis: AlertBasis;
  autoPublish: boolean;
  created: number;
  updated: number;
  unchanged: number;
  alerts: Alert[];
}

const HAZARD_LABELS: Record<string, string> = {
  CYCLONE: 'Cyclone',
  INONDATION: 'Inondation',
  FORTE_PLUIE: 'Fortes pluies',
  VENT_VIOLENT: 'Vent violent',
  SECHERESSE: 'Sécheresse',
  GLISSEMENT_TERRAIN: 'Glissement de terrain',
  FEU_VEGETATION: 'Feu de végétation',
  AUTRE: 'Aléa',
};

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  FAIBLE: 'faible',
  MODEREE: 'modérée',
  ELEVEE: 'élevée',
  EXTREME: 'extrême',
};

function basisForStatus(status: EventStatus): AlertBasis {
  return status === 'PREVISION' ? 'PREVISION' : 'OBSERVATION';
}

function hazardName(type: EventType): string {
  return HAZARD_LABELS[type] ?? type;
}

function mapEventTypeToAlertType(type: EventType): AlertType {
  const map: Partial<Record<EventType, AlertType>> = {
    CYCLONE: 'CYCLONE',
    INONDATION: 'INONDATION',
    FORTE_PLUIE: 'FORTE_PLUIE',
    VENT_VIOLENT: 'VENT_VIOLENT',
    SECHERESSE: 'SECHERESSE',
  };
  return map[type] ?? 'INFORMATION';
}

function zoneLabel(
  communeName: string | null,
  districtName: string | null,
  regionName: string | null,
  eventName: string | null,
): string {
  if (communeName) return communeName;
  if (districtName) return districtName;
  if (regionName) return regionName;
  if (eventName) return `l'événement « ${eventName} »`;
  return 'la zone concernée';
}

function formatPeriod(startedAt: string | null, expectedEndAt: string | null): string {
  if (!startedAt && !expectedEndAt) return '';
  const fmt = (s: string) => {
    try {
      return new Date(s).toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    } catch {
      return s;
    }
  };
  if (startedAt && expectedEndAt) return `${fmt(startedAt)} → ${fmt(expectedEndAt)}`;
  if (startedAt) return `depuis ${fmt(startedAt)}`;
  return `jusqu'à ${fmt(expectedEndAt!)}`;
}

function buildTitle(basis: AlertBasis, hzName: string, zone: string): string {
  if (basis === 'PREVISION') return `Prévision ${hzName} — ${zone}`;
  return `${hzName} en cours — ${zone}`;
}

function buildMessage(
  basis: AlertBasis,
  hzName: string,
  zone: string,
  severity: SeverityLevel,
  source: string,
  period: string,
  isDraft: boolean,
): string {
  const basisPhrase =
    basis === 'PREVISION'
      ? `Des conditions dangereuses de ${hzName.toLowerCase()} sont prévues à proximité de ${zone}. La situation peut encore évoluer.`
      : `Des conditions dangereuses de ${hzName.toLowerCase()} sont en cours à proximité de ${zone} (observation). La situation peut encore évoluer.`;

  const parts = [
    basisPhrase,
    `Niveau : ${SEVERITY_LABELS[severity]}.`,
    period ? `Période : ${period}.` : '',
    `Source : ${source}.`,
    'Restez informé, suivez les consignes des autorités et évitez toute prise de risque inutile.',
    isDraft ? 'Alerte à valider avant publication.' : '',
  ];

  return parts.filter(Boolean).join(' ');
}

async function resolveAffectedCommunes(eventId: string, communeIds?: string[]): Promise<string[]> {
  if (communeIds && communeIds.length > 0) return communeIds;

  const detection = await exposureRepository.listDetectionCommunes(eventId);
  if (detection.length > 0) return detection.map((d) => d.communeId);

  const exposed = await eventsRepository.listExposedCommuneIds(eventId);
  return exposed;
}

async function resolveTerritoryNames(
  communeId: string | null,
  districtId: string | null,
  regionId: string | null,
): Promise<{ communeName: string | null; districtName: string | null; regionName: string | null }> {
  const [communeName, districtName, regionName] = await Promise.all([
    communeId ? alertsRepository.getCommuneName(communeId) : Promise.resolve(null),
    districtId ? getDistrictName(districtId) : Promise.resolve(null),
    regionId ? getRegionName(regionId) : Promise.resolve(null),
  ]);
  return { communeName, districtName, regionName };
}

async function getDistrictName(districtId: string): Promise<string | null> {
  const { db } = await import('../config/database');
  const result = await db.query<{ name: string }>(`SELECT name FROM districts WHERE id = $1`, [
    districtId,
  ]);
  return result.rows[0]?.name ?? null;
}

async function getRegionName(regionId: string): Promise<string | null> {
  const { db } = await import('../config/database');
  const result = await db.query<{ name: string }>(`SELECT name FROM regions WHERE id = $1`, [
    regionId,
  ]);
  return result.rows[0]?.name ?? null;
}

function shouldUpdate(
  existing: Alert,
  newTitle: string,
  newMessage: string,
  targetStatus: AlertStatus,
): boolean {
  if (existing.title !== newTitle) return true;
  if (existing.message !== newMessage) return true;
  if (existing.status !== targetStatus) return true;
  return false;
}

export const automaticAlertService = {
  async generateForEvent(opts: GenerateOptions): Promise<AlertGenerationResult> {
    const event = await eventsRepository.findById(opts.eventId);
    if (!event) {
      return {
        eventId: opts.eventId,
        basis: 'PREVISION',
        autoPublish: false,
        created: 0,
        updated: 0,
        unchanged: 0,
        alerts: [],
      };
    }

    if (event.status === 'CLOTURE' || event.status === 'BROUILLON') {
      return {
        eventId: opts.eventId,
        basis: basisForStatus(event.status),
        autoPublish: false,
        created: 0,
        updated: 0,
        unchanged: 0,
        alerts: [],
      };
    }

    const basis = opts.basisOverride ?? basisForStatus(event.status);
    const autoPublish = opts.autoPublish ?? env.ALERTS_AUTO_PUBLISH;
    const targetStatus: AlertStatus = autoPublish ? 'PUBLIEE' : 'BROUILLON';
    const publishedAt = autoPublish ? new Date().toISOString() : null;
    const isDraft = !autoPublish;
    const source = event.sourceName ?? 'Détection automatique';
    const period = formatPeriod(event.startedAt, event.expectedEndAt);
    const hzName = hazardName(event.type);
    const alertType = mapEventTypeToAlertType(event.type);

    const communes = await resolveAffectedCommunes(opts.eventId, opts.communeIds);
    const alerts: Alert[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    const targets: Array<{ communeId?: string; districtId?: string; regionId?: string }> =
      communes.length > 0 ? communes.map((c) => ({ communeId: c })) : [{}];

    for (const target of targets) {
      const { communeName, districtName, regionName } = await resolveTerritoryNames(
        target.communeId ?? null,
        target.districtId ?? null,
        target.regionId ?? null,
      );

      const zone = zoneLabel(communeName, districtName, regionName, event.name);
      const title = buildTitle(basis, hzName, zone);
      const message = buildMessage(basis, hzName, zone, event.severity, source, period, isDraft);

      const existing = await alertsRepository.findAutomaticForTarget(opts.eventId, {
        communeId: target.communeId,
        districtId: target.districtId,
        regionId: target.regionId,
      });

      if (existing) {
        const effectiveTargetStatus: AlertStatus =
          existing.status === 'PUBLIEE' ? 'PUBLIEE' : targetStatus;

        if (!shouldUpdate(existing, title, message, effectiveTargetStatus)) {
          unchanged += 1;
          continue;
        }

        const updatedAlert = await alertsRepository.applyAutomaticUpdate(existing.id, {
          title,
          message,
          type: alertType,
          severity: event.severity,
          status: effectiveTargetStatus,
          basis,
          source,
          validFrom: event.startedAt,
          expiresAt: event.expectedEndAt,
          publishedAt:
            effectiveTargetStatus === 'PUBLIEE' && existing.status !== 'PUBLIEE'
              ? publishedAt
              : null,
        });

        if (updatedAlert) {
          await alertsRepository.addUpdateEntry({
            alertId: updatedAlert.id,
            kind: 'UPDATED',
            fromStatus: existing.status,
            toStatus: effectiveTargetStatus,
            trigger: opts.trigger,
            autoPublish,
            oldTitle: existing.title,
            newTitle: title,
            oldMessage: existing.message,
            newMessage: message,
            oldSeverity: existing.severity,
            newSeverity: event.severity,
            oldBasis: existing.basis,
            newBasis: basis,
          });
          alerts.push(updatedAlert);
          updated += 1;
        }
      } else {
        const newAlert = await alertsRepository.create({
          eventId: opts.eventId,
          districtId: target.districtId ?? null,
          communeId: target.communeId ?? null,
          regionId: target.regionId ?? null,
          type: alertType,
          severity: event.severity,
          status: targetStatus,
          title,
          message,
          source,
          basis,
          validFrom: event.startedAt,
          isAutomatic: true,
          updateCount: 0,
          expiresAt: event.expectedEndAt,
          publishedAt,
        });

        await alertsRepository.addUpdateEntry({
          alertId: newAlert.id,
          kind: 'CREATED',
          fromStatus: null,
          toStatus: targetStatus,
          trigger: opts.trigger,
          autoPublish,
          newTitle: title,
          newMessage: message,
          newSeverity: event.severity,
          newBasis: basis,
        });

        alerts.push(newAlert);
        created += 1;
      }
    }

    if (created > 0 || updated > 0) {
      logger.info(
        { eventId: opts.eventId, created, updated, basis, trigger: opts.trigger },
        'Alertes automatiques générées',
      );
    }

    return { eventId: opts.eventId, basis, autoPublish, created, updated, unchanged, alerts };
  },

  async generateForActiveEvents(): Promise<AlertGenerationResult[]> {
    const eventIds = await exposureRepository.activeEventIds();
    const results: AlertGenerationResult[] = [];

    for (const eventId of eventIds) {
      try {
        const result = await this.generateForEvent({
          eventId,
          trigger: 'SYNC',
        });
        results.push(result);
      } catch (err) {
        logger.warn({ err, eventId }, 'Génération d alerte automatique échouée pour un événement');
      }
    }

    return results;
  },
};
