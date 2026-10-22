import type {
  AlertStatus,
  AlertType,
  EventStatus,
  EventType,
  RiskLevel,
  RiskPhase,
  SeverityLevel,
} from '@/types';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const EVENT_TYPES: EventType[] = [
  'CYCLONE',
  'INONDATION',
  'SECHERESSE',
  'FORTE_PLUIE',
  'VENT_VIOLENT',
  'GLISSEMENT_TERRAIN',
  'FEU_VEGETATION',
  'VAGUE_DE_CHALEUR',
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
  VAGUE_DE_CHALEUR: 'Vague de chaleur',
  AUTRE: 'Autre',
};

/** Libellés affichables des types d'alerte (la valeur brute n'est pas lisible). */
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  CYCLONE: 'Cyclone',
  INONDATION: 'Inondation',
  FORTE_PLUIE: 'Forte pluie',
  VENT_VIOLENT: 'Vent violent',
  SECHERESSE: 'Sécheresse',
  VAGUE_DE_CHALEUR: 'Vague de chaleur',
  GLISSEMENT_TERRAIN: 'Glissement de terrain',
  FEU_VEGETATION: 'Feu de végétation',
  INFORMATION: 'Information',
  URGENCE: 'Urgence',
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

/** Libellés affichables des statuts d'alerte (la valeur brute n'est pas lisible). */
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  BROUILLON: 'Brouillon',
  PUBLIEE: 'Publiée',
  ARCHIVEE: 'Archivée',
  EXPIREE: 'Expirée',
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
  VAGUE_DE_CHALEUR: 'warning',
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