import type { SeverityLevel } from './event.types';

export type DetectionOperator = 'GT' | 'GE' | 'LT' | 'LE' | 'EQ' | 'BETWEEN';

export const DETECTION_OPERATORS: DetectionOperator[] = [
  'GT', 'GE', 'LT', 'LE', 'EQ', 'BETWEEN',
];

export type AutomationRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';

export const AUTOMATION_RUN_STATUSES: AutomationRunStatus[] = [
  'RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL',
];

export interface SeverityRule {
  level: SeverityLevel;
  /** Seuil minimal (0–100) pour atteindre ce niveau de sévérité */
  min: number;
}

export interface HazardDetectionRule {
  id: string;
  hazardType: string; // correspond aux valeurs de l'enum event_type
  metric: string;
  operator: DetectionOperator;
  threshold: number;
  thresholdMax: number | null;
  durationMinutes: number;
  aggregationWindowMinutes: number;
  forecastHorizonHours: number;
  severityRules: SeverityRule[];
  isActive: boolean;
  regionId: string | null;
  districtId: string | null;
  communeId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HazardDetectionRuleRow {
  id: string;
  hazard_type: string;
  metric: string;
  operator: string;
  threshold: string; // pg numeric arrive en string
  threshold_max: string | null;
  duration_minutes: number;
  aggregation_window_minutes: number;
  forecast_horizon_hours: number;
  severity_rules: unknown;
  is_active: boolean;
  region_id: string | null;
  district_id: string | null;
  commune_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
