export type RiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'EXTREME';
export type RiskPhase = 'AVANT' | 'PENDANT' | 'APRES' | 'RETABLISSEMENT';
export type EventStatus = 'BROUILLON' | 'PREVISION' | 'ACTIF' | 'SUIVI' | 'CLOTURE';
export type EventType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'SECHERESSE'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'GLISSEMENT_TERRAIN'
  | 'FEU_VEGETATION'
  | 'VAGUE_DE_CHALEUR'
  | 'AUTRE';
export type SeverityLevel = 'FAIBLE' | 'MODEREE' | 'ELEVEE' | 'EXTREME';
export type AlertStatus = 'BROUILLON' | 'PUBLIEE' | 'ARCHIVEE' | 'EXPIREE';
export type AlertBasis = 'PREVISION' | 'OBSERVATION';
export type AlertType =
  | 'CYCLONE'
  | 'INONDATION'
  | 'FORTE_PLUIE'
  | 'VENT_VIOLENT'
  | 'SECHERESSE'
  | 'VAGUE_DE_CHALEUR'
  | 'GLISSEMENT_TERRAIN'
  | 'FEU_VEGETATION'
  | 'INFORMATION'
  | 'URGENCE';

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SanitizedUser {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: import('./roles').UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: SanitizedUser;
}

export interface DashboardSummary {
  activeEvents: number;
  forecastEvents: number;
  activeAlerts: number;
  totalDistricts: number;
  totalCommunes: number;
  extremeRiskCommunes: number;
  highRiskCommunes: number;
  exposedPopulation: number | null;
  lastUpdatedAt: string | null;
  latestAlerts: Array<{
    id: string;
    title: string;
    type: string;
    severity: string;
    status: string;
    eventId: string | null;
    districtId: string | null;
    communeId: string | null;
    publishedAt: string | null;
  }>;
  priorityCommunes: PriorityCommune[];
}

export interface PriorityCommune {
  communeId: string;
  communeCode: string;
  communeName: string;
  districtId: string;
  districtName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  population: number | null;
  assessedAt: string;
}

export interface ExposedCommuneRow {
  communeId: string;
  communeCode: string;
  communeName: string;
  districtId: string;
  districtCode: string;
  districtName: string;
  distanceToTrackKm: number | null;
  isInsideInfluenceArea: boolean;
  exposedPopulation: number | null;
  population: number | null;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  overlapPercent: number | null;
  sourceType: 'SEUIL' | 'ZONE' | 'TRAJECTOIRE' | 'MANUEL' | null;
  dataType: 'REEL' | 'ESTIME' | null;
  updatedAt: string | null;
}

export interface ExposedCommuneInfo {
  communeId: string;
  communeCode: string | null;
  communeName: string | null;
  districtName: string | null;
  population: number | null;
  exposedPopulation: number | null;
  overlapPercent: number | null;
  distanceToTrackKm: number | null;
  isInsideInfluenceArea: boolean | null;
  sourceType: 'SEUIL' | 'ZONE' | 'TRAJECTOIRE' | 'MANUEL' | null;
  dataType: 'REEL' | 'ESTIME' | null;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  updatedAt: string | null;
}

export interface RiskDistribution {
  FAIBLE: number;
  MODERE: number;
  ELEVE: number;
  EXTREME: number;
  SANS_RISQUE: number;
}

export interface EventsTimelineEntry {
  date: string;
  total: number;
  byType: Record<string, number>;
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

export interface EventTimeline {
  eventId: string;
  timeline: EventTimelineEntry[];
}

export interface EventBilan {
  event: {
    id: string;
    eventCode: string;
    name: string;
    type: EventType;
    status: EventStatus;
    severity: SeverityLevel;
    description: string | null;
    startedAt: string | null;
    expectedEndAt: string | null;
    endedAt: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    createdAt: string;
  } | null;
  areas: { type: 'FeatureCollection'; features: Array<Record<string, unknown>> };
  exposedCommunes: Array<{
    communeId: string;
    communeName: string;
    districtId: string | null;
    districtName: string | null;
    distanceToTrackKm: string | null;
    isInsideInfluenceArea: boolean;
    exposedPopulation: string | null;
    riskScore: string | null;
    riskLevel: RiskLevel | null;
  }>;
  exposedPopulation: number | null;
  riskDistribution: Record<string, number>;
  riskCount: number;
  weather: {
    available: boolean;
    latestObservedAt: string | null;
    latest: {
      temperatureC: string | null;
      windSpeedKmh: string | null;
      precipitationMm: string | null;
      humidityPercent: string | null;
      observedAt: string | null;
      communeName: string;
    } | null;
  };
  alerts: Array<{
    id: string;
    title: string;
    type: string;
    severity: string;
    status: string;
    message: string | null;
    districtId: string | null;
    communeId: string | null;
    publishedAt: string | null;
    expiresAt: string | null;
  }>;
}

export interface DistrictListItem {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  population: number | null;
  vulnerabilityScore: number | null;
  totalCommunes: number;
}

export interface CommuneListItem {
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  postalCode: string | null;
  population: number | null;
  vulnerabilityScore: number | null;
  districtId: string;
  districtCode: string;
  districtName: string;
}

export interface EventListItem {
  id: string;
  eventCode: string;
  name: string;
  type: EventType;
  status: EventStatus;
  severity: SeverityLevel;
  description: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  startedAt: string | null;
  expectedEndAt: string | null;
  endedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventTrack {
  id: string;
  eventId: string;
  observedAt: string;
  forecastFor: string | null;
  trackType: 'OBSERVEE' | 'PREVUE';
  latitude: number;
  longitude: number;
  windSpeedKmh: number | null;
  gustSpeedKmh: number | null;
  pressureHpa: number | null;
  precipitationMm: number | null;
  movementDirection: string | null;
  movementSpeedKmh: number | null;
  createdAt: string;
}

/**
 * État documenté d'un événement historique (Batsirai etc.) : communes
 * affectées après le passage réellement observé, jamais d'avance.
 */
export type ImpactState =
  | 'NOT_REACHED'
  | 'CENTER_CROSSED'
  | 'WIND_IMPACT'
  | 'RAIN_IMPACT'
  | 'FLOOD_IMPACT'
  | 'IMPACT_ESTIMATED'
  | 'UNKNOWN';

/** Risque OBSERVÉ (événement passé) — distinct du risque prévisionnel. */
export type ObservedRiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'TRES_ELEVE' | 'INCONNU';

export interface TrackStatePoint extends EventTrack {
  radius34ktKm: number | null;
  radius50ktKm: number | null;
  radius64ktKm: number | null;
  radiusMaxKm: number | null;
  radiusSource: string | null;
  radiusMeasureType: string | null;
  radiusQuality: string | null;
  dataQuality: string | null;
  confidence: number | null;
}

export interface TrackState {
  eventId: string;
  at: string;
  hasRadiusData: boolean;
  radiusSource: string | null;
  radiusMeasureType: string | null;
  radiusMaxKm: number | null;
  currentPoint: TrackStatePoint | null;
  previousPoints: TrackStatePoint[];
  upToAtCount: number;
  totalPoints: number;
  method: string;
}

export interface EventCommuneImpactRow {
  communeId: string;
  communeName: string;
  communeCode: string | null;
  districtId: string | null;
  districtName: string | null;
  firstAffectedAt: string | null;
  lastAffectedAt: string | null;
  impactState: ImpactState;
  observedRiskLevel: ObservedRiskLevel;
  forecastRiskLevel: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number | null;
  method: string | null;
  notes: string | null;
}

export interface CommuneImpactsResult {
  eventId: string;
  at: string;
  count: number;
  hasRadiusData: boolean;
  radiusKm: number | null;
  radiusSource: string | null;
  method: string;
  communes: EventCommuneImpactRow[];
}

/** Niveaux officiels d'alerte cyclonique malgaches. */
export type CommuneAlertLevel = 'VERT' | 'JAUNE' | 'ROUGE' | 'BLEU';
/** Niveau affiché sur la carte : hors alerte (aucune ligne documentée) = GRIS. */
export type DisplayedCommuneAlertLevel = CommuneAlertLevel | 'GRIS';
export type CommuneAlertInfoType =
  | 'OFFICIELLE'
  | 'PREVISION'
  | 'IMPACT_OBSERVE'
  | 'ESTIMATION';
/** Échelle à laquelle l'information d'alerte a été publiée ou construite. */
export type CommuneAlertScope = 'COMMUNE' | 'DISTRICT' | 'REGION' | 'EVENEMENT';

export interface EventCommuneAlertRow {
  communeId: string;
  communeName: string;
  communeCode: string | null;
  districtId: string | null;
  districtName: string | null;
  alertLevel: CommuneAlertLevel;
  validFrom: string;
  validTo: string | null;
  infoType: CommuneAlertInfoType;
  territoryScope: CommuneAlertScope;
  sourceName: string | null;
  sourceUrl: string | null;
  comment: string | null;
  confidence: number | null;
}

export interface EventCommuneAlertsResult {
  eventId: string;
  at: string;
  count: number;
  source: string | null;
  method: string;
  communes: EventCommuneAlertRow[];
}

export interface CommuneAlertLevelCounts {
  VERT: number;
  JAUNE: number;
  ROUGE: number;
  BLEU: number;
  GRIS: number;
}

export interface EventCommuneAlertsSummary {
  eventId: string;
  at: string;
  total: number;
  levels: CommuneAlertLevelCounts;
  /** Niveaux issus d'une estimation spatiale (héritage district/région ou dérivé). */
  estimated: number;
  eventHasAlertData: boolean;
  sources: string[];
  method: string;
}

export interface EventCommuneAlertHistoryRow extends EventCommuneAlertRow {
  activeAt: boolean;
}

export interface EventCommuneAlertHistory {
  eventId: string;
  communeId: string;
  communeName: string;
  count: number;
  method: string;
  rows: EventCommuneAlertHistoryRow[];
}

export interface AlertListRow {
  id: string;
  eventId: string | null;
  districtId: string | null;
  communeId: string | null;
  type: AlertType;
  severity: SeverityLevel;
  status: AlertStatus;
  title: string;
  message: string;
  source?: string | null;
  basis?: AlertBasis | null;
  isAutomatic?: boolean;
  /** Alerte importée depuis un bulletin archivé : jamais active, jamais notifiée. */
  isHistorique?: boolean;
  updateCount?: number;
  createdBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventName: string | null;
  districtName: string | null;
  communeName: string | null;
  /** Présents uniquement avec group=event (liste regroupée par événement). */
  groupIds?: string[];
  alertCount?: number;
  communeCount?: number;
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  FAIBLE: '#7a9e7e',
  MODERE: '#c4a85a',
  ELEVE: '#c4845a',
  EXTREME: '#c46b6b',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  FAIBLE: 'Faible',
  MODERE: 'Modéré',
  ELEVE: 'Élevé',
  EXTREME: 'Extrême',
};

export interface TerritorySearchResult {
  type: 'district' | 'commune';
  id: string;
  adminCode: string;
  name: string;
  normalizedName: string;
  district?: { id: string; adminCode: string; name: string } | null;
}

export interface CommuneWeatherSummary {
  observedAt: string;
  precipitationMm: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
}

export interface CommuneRiskSummary {
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: RiskPhase | null;
  assessedAt: string | null;
}

export interface CommuneEventRef {
  id: string;
  eventCode: string;
  name: string;
  type: string;
  status: string;
  startedAt: string | null;
}

export interface GeoJsonPoint {
  type: string;
  coordinates: unknown;
  [key: string]: unknown;
}

export interface CommuneDetail {
  commune: {
    id: string;
    adminCode: string;
    name: string;
    normalizedName: string;
    postalCode: string | null;
    population: number | null;
    vulnerabilityScore: number | null;
    centroid: GeoJsonPoint | null;
  };
  district: {
    id: string;
    adminCode: string;
    name: string;
    normalizedName: string;
  } | null;
  geometry: unknown | null;
  weather: CommuneWeatherSummary | null;
  risk: CommuneRiskSummary | null;
  events: CommuneEventRef[];
}

export interface WeatherObservation {
  id: string;
  communeId: string | null;
  eventId: string | null;
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
  createdAt: string;
}

export interface WeatherCurrentData {
  observedAt: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
}

export interface WeatherForecastData {
  generatedAt: string;
  timezone: string;
  latitude: number;
  longitude: number;
  current: WeatherCurrentData;
  hourly: {
    time: string[];
    temperatureC: (number | null)[];
    humidityPercent: (number | null)[];
    precipitationMm: (number | null)[];
    rainMm: (number | null)[];
    windSpeedKmh: (number | null)[];
    windDirectionDeg: (number | null)[];
    pressureHpa: (number | null)[];
    weatherCode: (number | null)[];
  };
}

export interface RiskAssessment {
  id: string;
  communeId: string;
  eventId: string | null;
  riskConfigurationId: string | null;
  phase: RiskPhase;
  riskScore: number;
  riskLevel: RiskLevel;
  displayLevel: string;
  color: string;
  factors: {
    rainScore: number;
    windScore: number;
    proximityScore: number;
    vulnerabilityScore: number;
    exposureScore: number;
  };
  explanation: string[];
  modelVersion: string;
  assessedAt: string;
  createdAt: string;
}

export interface RiskMapFeatureProperties {
  communeId: string;
  communeName: string;
  districtName: string;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  explanation: string[] | null;
  assessedAt: string | null;
}

export interface CommuneMapFeatureProperties {
  communeId: string;
  communeCode: string;
  commune: string;
  districtId: string;
  districtCode: string;
  district: string;
  population: number | null;
  vulnerabilityScore: number | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  displayLevel: string | null;
  color: string | null;
  phase: RiskPhase | null;
  assessedAt: string | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
}

export interface WeatherMapFeatureProperties {
  communeId: string;
  communeName: string;
  districtId: string;
  districtName: string;
  longitude: number;
  latitude: number;
  observedAt: string | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  rainfall24hMm: number | null;
  pressureHpa: number | null;
  weatherCode: string | null;
}

/** Conversation de l'assistant IA (entête), telle que listée pour son propriétaire. */
export interface AiConversationListItem {
  id: string;
  userId: string;
  title: string | null;
  /** Messages persistés, tours d'outil compris — donc supérieur aux échanges visibles. */
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rôle **persisté** d'un message. Ce ne sont pas les rôles du fournisseur :
 * `buildMemory` traduit UTILISATEUR/ASSISTANT en user/model à la lecture de la
 * mémoire, ces valeurs ne sont donc jamais stockées telles quelles.
 *
 * `OUTIL` porte les résultats bruts d'outils (JSON) : ils servent à l'audit et
 * ne doivent pas être affichés dans le fil.
 */
export type AiMessageRole = 'UTILISATEUR' | 'ASSISTANT' | 'OUTIL' | 'SYSTEME';

/** Métadonnées d'un tour, telles que relues depuis la conversation. */
export interface AiMessageMetadata {
  /** Outils du socle réellement exécutés (clé `internalSources` côté serveur). */
  internalSources?: string[];
  dataTimestamp?: string | null;
  limitations?: string[];
  /** Présent uniquement sur les tours d'outil. */
  tool?: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  tokenCount: number | null;
  /**
   * `null` sur les messages antérieurs à la persistance des métadonnées : ne pas
   * en déduire « aucune source », seulement « non renseigné ».
   */
  metadata: AiMessageMetadata | null;
  createdAt: string;
}

export interface AiConversationDetail {
  id: string;
  userId: string;
  title: string | null;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}
