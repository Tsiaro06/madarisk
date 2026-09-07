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

export interface Alert {
  id: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  type: AlertType;
  severity: SeverityLevel;
  status: AlertStatus;
  title: string;
  message: string;
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
}
