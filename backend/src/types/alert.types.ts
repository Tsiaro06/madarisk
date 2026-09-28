import { SeverityLevel } from './event.types';

export type AlertStatus = 'BROUILLON' | 'PUBLIEE' | 'ARCHIVEE' | 'EXPIREE';

export const ALERT_STATUSES: AlertStatus[] = ['BROUILLON', 'PUBLIEE', 'ARCHIVEE', 'EXPIREE'];

export type AlertType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'SECHERESSE'
  | 'INFORMATION'
  | 'URGENCE';

export const ALERT_TYPES: AlertType[] = [
  'CYCLONE',
  'INONDATION',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'SECHERESSE',
  'INFORMATION',
  'URGENCE',
];

export type AlertBasis = 'PREVISION' | 'OBSERVATION';

export type AlertGenerationTrigger = 'DETECTION' | 'SYNC' | 'MANUAL';

export interface Alert {
  id: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  regionId: string | null;
  type: AlertType;
  severity: SeverityLevel;
  status: AlertStatus;
  title: string;
  message: string;
  source: string | null;
  basis: AlertBasis | null;
  validFrom: string | null;
  isAutomatic: boolean;
  updateCount: number;
  createdBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertListRow extends Alert {
  eventName: string | null;
  districtName: string | null;
  communeName: string | null;
  regionName: string | null;
}

export interface AlertUpdateEntry {
  id: string;
  alertId: string;
  kind: 'CREATED' | 'UPDATED';
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus | null;
  trigger: AlertGenerationTrigger;
  autoPublish: boolean;
  oldTitle: string | null;
  newTitle: string | null;
  oldMessage: string | null;
  newMessage: string | null;
  oldSeverity: SeverityLevel | null;
  newSeverity: SeverityLevel | null;
  oldBasis: AlertBasis | null;
  newBasis: AlertBasis | null;
  recordedAt: string;
}
