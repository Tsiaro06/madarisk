import type { EventStatus, EventType, RiskLevel, RiskPhase, SeverityLevel } from '@/types';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const EVENT_TYPES: EventType[] = [
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'AUTRE',
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CYCLONE: 'Cyclone',
  INONDATION: 'Inondation',
  SECHERESSE: 'Sécheresse',
  FORTE_PLUIE: 'Forte pluie',
  VENT_VIOLENT: 'Vent violent',
  GLISSEMENT_TERRAIN: 'Glissement de terrain',
  FEU_VEGETATION: 'Feu de végétation',
  AUTRE: 'Autre',
};

export const EVENT_STATUSES: EventStatus[] = [
  'BROUILLON',
  'PREVISION',
  'ACTIF',
  'SUIVI',
  'CLOTURE',
];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  BROUILLON: 'Brouillon',
  PREVISION: 'Prévision',
  ACTIF: 'Actif',
  SUIVI: 'Suivi',
  CLOTURE: 'Clôturé',
};

export const SEVERITIES: SeverityLevel[] = ['FAIBLE', 'MODEREE', 'ELEVEE', 'EXTREME'];

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  FAIBLE: 'Faible',
  MODEREE: 'Modérée',
  ELEVEE: 'Élevée',
  EXTREME: 'Extrême',
};

export const EVENT_TYPE_TONE: Record<EventType, BadgeTone> = {
  CYCLONE: 'danger',
  INONDATION: 'info',
  SECHERESSE: 'warning',
  FORTE_PLUIE: 'info',
  VENT_VIOLENT: 'warning',
  GLISSEMENT_TERRAIN: 'danger',
  FEU_VEGETATION: 'danger',
  AUTRE: 'neutral',
};

export const EVENT_STATUS_TONE: Record<EventStatus, BadgeTone> = {
  BROUILLON: 'neutral',
  PREVISION: 'info',
  ACTIF: 'danger',
  SUIVI: 'warning',
  CLOTURE: 'success',
};

export const SEVERITY_TONE: Record<SeverityLevel, BadgeTone> = {
  FAIBLE: 'success',
  MODEREE: 'info',
  ELEVEE: 'warning',
  EXTREME: 'danger',
};

export const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];

export const PHASE_LABELS: Record<RiskPhase, string> = {
  AVANT: 'Avant',
  PENDANT: 'Pendant',
  APRES: 'Après',
  RETABLISSEMENT: 'Rétablissement',
};

export const RISK_LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];