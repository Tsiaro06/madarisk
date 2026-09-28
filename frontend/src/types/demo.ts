import type { EventStatus, SeverityLevel } from '@/types';

export type DemoStep = 'PREVISION' | 'ACTIF' | 'SUIVI' | 'CLOTURE';

export interface DemoStepInfo {
  key: DemoStep;
  order: number;
  label: string;
  description: string;
}

export interface DemoScenarioEvent {
  id: string;
  eventCode: string;
  name: string;
  status: EventStatus;
  severity: SeverityLevel;
  sourceName: string | null;
  sourceUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface DemoScenarioCounts {
  tracks: number;
  areas: number;
  exposedCommunes: number;
  risks: number;
  alerts: number;
}

export interface DemoScenarioState {
  demoMode: boolean;
  event: DemoScenarioEvent | null;
  step: DemoStep | null;
  steps: DemoStepInfo[];
  counts: DemoScenarioCounts;
}
