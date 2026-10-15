import type { EventStatus, SeverityLevel } from './event.types';

/**
 * Zone de veille : rectangle géographique en degrés décimaux WGS84.
 *
 * Sert à ne pas ingérer les cyclones du monde entier : un système n'est retenu
 * que si au moins un point de sa trajectoire entre dans ce rectangle.
 */
export interface WatchBbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Provenance d'une donnée cyclone. */
export type CycloneSource = 'IBTRACS' | 'GDACS';

/**
 * Point de trajectoire normalisé, indépendant de la source.
 *
 * Les rayons sont en kilomètres mesurés au sol ; `null` signifie « non publié
 * par l'agence » et n'est JAMAIS remplacé par une estimation. C'est la règle
 * appliquée à Batsirai (RSMC La Réunion, IBTrACS v04r01).
 */
export interface CycloneTrackPoint {
  observedAt: string;
  latitude: number;
  longitude: number;
  /** Vitesse du vent soutenu (km/h), ou null si non publiée. */
  windSpeedKmh: number | null;
  pressureHpa: number | null;
  /** Ex. « 250° » — sens de déplacement. */
  movementDirection: string | null;
  movementSpeedKmh: number | null;
  radius34ktKm: number | null;
  radius50ktKm: number | null;
  radius64ktKm: number | null;
  radiusSource: string | null;
  radiusMeasureType: string | null;
  /** Nature IBTrACS (TS, ET, DS…) — information de traçabilité. */
  nature: string | null;
}

/** Système cyclonique actif reconstruit à partir d'une source de trajectoire. */
export interface CycloneSystem {
  source: CycloneSource;
  /** Identifiant stable dans la source (SID IBTrACS). */
  sourceSystemId: string;
  name: string;
  basin: string | null;
  season: number | null;
  sourceUrl: string | null;
  /** Points triés du plus ancien au plus récent. */
  points: CycloneTrackPoint[];
  rawMetadata: Record<string, unknown>;
}

/**
 * Veille GDACS : identité, niveau d'alerte et position courante, sans
 * trajectoire détaillée ni rayons de vent (GDACS ne les publie pas par pas de
 * temps). Sert de détection précoce, avant qu'IBTrACS ne publie la tempête.
 */
export interface CycloneWatch {
  source: 'GDACS';
  sourceSystemId: string;
  name: string;
  season: number | null;
  alertLevel: string | null;
  severityWindKmh: number | null;
  countries: string[];
  reportUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  observedAt: string | null;
  fromDate: string | null;
  toDate: string | null;
  rawMetadata: Record<string, unknown>;
}

export interface CycloneTrackProvider {
  readonly source: CycloneSource;
  listActiveSystems(watch: WatchBbox): Promise<CycloneSystem[]>;
}

export interface CycloneWatchProvider {
  readonly source: 'GDACS';
  listWatchedSystems(watch: WatchBbox): Promise<CycloneWatch[]>;
}

/**
 * Plan d'ingestion : un événement cyclone et sa trajectoire, prêts à être
 * persistés. Les identités source (`sourceSystemId`) et liées (`linkedSources`)
 * permettent de retrouver le MÊME événement aux cycles suivants.
 */
export interface CycloneIngestionPlan {
  source: CycloneSource;
  sourceSystemId: string;
  eventCode: string;
  linkedSources: { source: CycloneSource; sourceSystemId: string }[];
  name: string;
  basin: string | null;
  season: number | null;
  sourceUrl: string | null;
  sourceName: string;
  alertLevel: string | null;
  maxWindKmh: number | null;
  severity: SeverityLevel;
  status: EventStatus;
  startedAt: string | null;
  lastObservedAt: string | null;
  points: CycloneTrackPoint[];
  rawMetadata: Record<string, unknown>;
}

export interface CycloneSyncSummary {
  runId: string;
  systemsDetected: number;
  systemsTracked: number;
  eventsCreated: number;
  eventsUpdated: number;
  trackPoints: number;
  /** Événements dont la coloration communale a été (re)calculée. */
  coloredEvents: number;
  /** Communes dans le champ de vent au dernier point (alertes déclenchées). */
  coloredCommunes: number;
  /** Alertes automatiques créées par ce cycle. */
  alertsCreated: number;
  durationMs: number;
}

export interface CycloneSyncRunInfo {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  sources: string;
  systemsDetected: number;
  systemsTracked: number;
  eventsCreated: number;
  eventsUpdated: number;
  trackPoints: number;
  errorsCount: number;
  errorMessage: string | null;
}
