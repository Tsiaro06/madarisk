import type { AutomationRunStatus, DetectionOperator } from './automation.types';
import type { EventStatus, SeverityLevel } from './event.types';

export type DetectionDataKind = 'OBSERVE' | 'PREVU';

export type DetectionTrigger = 'SCHEDULED' | 'MANUAL';

export type DetectionScope = 'OBSERVATIONS' | 'FORECASTS' | 'ALL';

export type DetectionGeoScope = 'commune' | 'district' | 'region' | 'national';

export interface DetectionSignal {
  ruleId: string;
  hazardType: string;
  metric: string;
  value: number;
  operator: DetectionOperator;
  threshold: number;
  score: number;
  severity: SeverityLevel;
  dataKind: DetectionDataKind;
  communeId: string;
  communeName: string;
  scopeLabel: string;
  geoKey: string;
  porteeType: DetectionGeoScope;
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface DetectionRunOptions {
  trigger?: DetectionTrigger;
  scope?: DetectionScope;
  normalCyclesBeforeMonitoring?: number;
  monitoringHours?: number;
  dedupeHours?: number;
  now?: Date;
  skipWhenNoRules?: boolean;
}

export interface DetectionRunOutcome {
  runId: string | null;
  started: boolean;
  joinedExisting: boolean;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'SKIPPED' | 'RUNNING';
  trigger: DetectionTrigger;
  rulesEvaluated: number;
  rulesTriggered: number;
  detections: number;
  eventsCreated: number;
  eventsUpdated: number;
}

export interface DetectionRunInfo {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: AutomationRunStatus;
  trigger: DetectionTrigger;
  rulesEvaluated: number;
  detections: number;
  rulesTriggered: number;
  eventsCreated: number;
  eventsUpdated: number;
  errorMessage: string | null;
}

export interface EventTimelineEntry {
  recordedAt: string;
  kind: 'STATUS_CHANGE' | 'SNAPSHOT';
  fromStatus: EventStatus | null;
  toStatus: EventStatus | null;
  reason: string | null;
  source: string;
  actorType: string;
  severity: SeverityLevel | null;
  exposedCommuneCount: number | null;
  metricValues: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}
