import type { EventStatus, SeverityLevel } from '../../types/event.types';
import type {
  CycloneIngestionPlan,
  CycloneSystem,
  CycloneTrackPoint,
  CycloneWatch,
  WatchBbox,
} from '../../types/cyclone.types';
import { AppError } from '../../utils/app-error';

/** 1 mille nautique = 1,852 km (conversion utilisée par IBTrACS et le seed Batsirai). */
export const NM_TO_KM = 1.852;

/** 1 nœud = 1,852 km/h. */
export const KT_TO_KMH = 1.852;

/** Type de mesure des rayons, aligné sur le seed Batsirai. */
export const RADIUS_MEASURE_TYPE = 'Rayon maximal des 4 quadrants';

/** Préfixe de la source des rayons, aligné sur le seed Batsirai. */
export function radiusSourceForSid(sid: string): string {
  return `RSMC La Réunion (Météo-France) — IBTrACS v04r01 (${sid})`;
}

/** Nom de source affiché sur l'événement (traçabilité). */
export const IBTRACS_SOURCE_NAME = 'IBTrACS v04r01 (RSMC La Réunion)';
export const GDACS_SOURCE_NAME = 'GDACS';

/**
 * Zone de veille : rectangle géographique en degrés décimaux WGS84.
 */
export function parseWatchBbox(raw: string): WatchBbox {
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new AppError(
      `CYCLONE_WATCH_BBOX invalide (« ${raw} ») : attends « minLon,minLat,maxLon,maxLat »`,
      500,
      true,
    );
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new AppError(
      `CYCLONE_WATCH_BBOX incohérent (« ${raw} ») : min doit être strictement inférieur à max`,
      500,
      true,
    );
  }
  return { minLon, minLat, maxLon, maxLat };
}

export function pointInBbox(latitude: number, longitude: number, bbox: WatchBbox): boolean {
  return (
    latitude >= bbox.minLat &&
    latitude <= bbox.maxLat &&
    longitude >= bbox.minLon &&
    longitude <= bbox.maxLon
  );
}

/** Vrai dès qu'un point de la trajectoire entre dans la zone de veille. */
export function systemIntersectsWatch(system: CycloneSystem, bbox: WatchBbox): boolean {
  return system.points.some((point) => pointInBbox(point.latitude, point.longitude, bbox));
}

/**
 * Sévérité de l'événement à partir du vent soutenu maximal (km/h).
 *
 * Seuils exprimés en km/h pour rester lisibles sans conversion mentale :
 * 63 km/h = 34 kt (dépression tropicale), 118 km/h = 64 kt (seuil cyclonique),
 * 178 km/h = 96 kt (cyclone tropical intense).
 */
export function severityFromWindKmh(kmh: number | null): SeverityLevel {
  if (kmh === null || !Number.isFinite(kmh)) return 'FAIBLE';
  if (kmh < 63) return 'FAIBLE';
  if (kmh < 118) return 'MODEREE';
  if (kmh < 178) return 'ELEVEE';
  return 'EXTREME';
}

/** Normalise un nom de tempête pour l'appariement entre sources. */
export function normalizeStormName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** « SIMON-26 » -> { name: 'SIMON', season: 2026 }. */
export function splitGdacsEventName(raw: string): { name: string; season: number | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.*?)[-\s](\d{2})$/);
  if (!match) return { name: trimmed, season: null };
  const name = match[1].trim();
  // Un nom d'une seule lettre (« B-25 ») n'est pas exploitable : on garde le brut.
  if (name.length < 2) return { name: trimmed, season: null };
  return { name, season: 2000 + Number(match[2]) };
}

export function eventCodeForSid(sid: string): string {
  return `CYCLONE-${sid}`;
}

export function eventCodeForWatch(sourceSystemId: string): string {
  return `CYCLONE-GDACS-${sourceSystemId.replace(/[^A-Za-z0-9-]/g, '-')}`;
}

function maxWindKmh(points: CycloneTrackPoint[]): number | null {
  let max: number | null = null;
  for (const point of points) {
    if (point.windSpeedKmh === null) continue;
    if (max === null || point.windSpeedKmh > max) max = point.windSpeedKmh;
  }
  return max;
}

function statusForLastObservation(
  lastObservedAt: string | null,
  now: number,
  activeWindowHours: number,
): EventStatus {
  if (lastObservedAt === null) return 'SUIVI';
  const ageHours = (now - new Date(lastObservedAt).getTime()) / 3_600_000;
  return ageHours <= activeWindowHours ? 'ACTIF' : 'SUIVI';
}

function planFromSystem(
  system: CycloneSystem,
  watch: CycloneWatch | undefined,
  now: number,
  activeWindowHours: number,
): CycloneIngestionPlan {
  const maxKmh = maxWindKmh(system.points) ?? watch?.severityWindKmh ?? null;
  const lastObservedAt = system.points[system.points.length - 1]?.observedAt ?? null;

  // GDACS ne publie que des systèmes en cours (`iscurrent`). Un appariement
  // prouve donc que la tempête est toujours suivie : on ne la rétrograde pas en
  // « SUIVI » sous prétexte que le dernier point IBTrACS a du retard (le produit
  // ACTIVE est mis à jour quotidiennement et accuse parfois plusieurs jours).
  const status: EventStatus = watch
    ? 'ACTIF'
    : statusForLastObservation(lastObservedAt, now, activeWindowHours);

  const linkedSources: { source: CycloneSystem['source']; sourceSystemId: string }[] = [
    { source: system.source, sourceSystemId: system.sourceSystemId },
  ];
  if (watch) linkedSources.push({ source: 'GDACS', sourceSystemId: watch.sourceSystemId });

  const source = watch ? 'GDACS' : system.source;
  const sourceSystemId = watch ? watch.sourceSystemId : system.sourceSystemId;

  const metadata: Record<string, unknown> = { ibtracs: system.rawMetadata };
  if (watch) metadata.gdacs = watch.rawMetadata;

  return {
    source,
    sourceSystemId,
    eventCode: watch
      ? eventCodeForWatch(watch.sourceSystemId)
      : eventCodeForSid(system.sourceSystemId),
    linkedSources,
    name: system.name,
    basin: system.basin,
    season: system.season,
    sourceUrl: watch?.reportUrl ?? system.sourceUrl,
    sourceName: watch ? 'IBTrACS v04r01 (RSMC La Réunion) + veille GDACS' : IBTRACS_SOURCE_NAME,
    alertLevel: watch?.alertLevel ?? null,
    maxWindKmh: maxKmh,
    severity: severityFromWindKmh(maxKmh),
    status,
    startedAt: system.points[0]?.observedAt ?? null,
    lastObservedAt,
    points: system.points,
    rawMetadata: metadata,
  };
}

function planFromWatch(watch: CycloneWatch, now: number): CycloneIngestionPlan {
  const points: CycloneTrackPoint[] = [];
  if (watch.latitude !== null && watch.longitude !== null) {
    points.push({
      observedAt: watch.observedAt ?? watch.toDate ?? new Date(now).toISOString(),
      latitude: watch.latitude,
      longitude: watch.longitude,
      windSpeedKmh: watch.severityWindKmh,
      pressureHpa: null,
      movementDirection: null,
      movementSpeedKmh: null,
      radius34ktKm: null,
      radius50ktKm: null,
      radius64ktKm: null,
      radiusSource: null,
      radiusMeasureType: null,
      nature: null,
    });
  }
  const windKmh = watch.severityWindKmh ?? maxWindKmh(points);

  return {
    source: 'GDACS',
    sourceSystemId: watch.sourceSystemId,
    eventCode: eventCodeForWatch(watch.sourceSystemId),
    linkedSources: [{ source: 'GDACS', sourceSystemId: watch.sourceSystemId }],
    name: watch.name,
    basin: null,
    season: watch.season,
    sourceUrl: watch.reportUrl,
    sourceName: GDACS_SOURCE_NAME,
    alertLevel: watch.alertLevel,
    maxWindKmh: windKmh,
    severity: severityFromWindKmh(windKmh),
    status: 'ACTIF',
    startedAt: watch.fromDate,
    lastObservedAt: points[0]?.observedAt ?? null,
    points,
    rawMetadata: { gdacs: watch.rawMetadata },
  };
}

/**
 * Construit les plans d'ingestion : un événement par cyclone, avec sa
 * trajectoire IBTrACS enrichie de la veille GDACS quand les deux sources
 * décrivent le même système.
 *
 * L'appariement se fait sur le nom normalisé (les noms malgaches/officiels sont
 * stables), la saison ne servant qu'à départager deux homonymes. Fonction pure,
 * donc testable sans base ni réseau.
 */
export function buildIngestionPlans(input: {
  tracked: CycloneSystem[];
  watched: CycloneWatch[];
  now: number;
  activeWindowHours: number;
}): CycloneIngestionPlan[] {
  const { tracked, watched, now, activeWindowHours } = input;

  const watchesByName = new Map<string, CycloneWatch[]>();
  for (const watch of watched) {
    const key = normalizeStormName(watch.name);
    const list = watchesByName.get(key);
    if (list) list.push(watch);
    else watchesByName.set(key, [watch]);
  }

  const claimed = new Set<string>();
  const plans: CycloneIngestionPlan[] = [];

  for (const system of tracked) {
    const candidates = watchesByName.get(normalizeStormName(system.name)) ?? [];
    const watch =
      candidates.find((w) => w.season !== null && w.season === system.season) ??
      (candidates.length === 1 ? candidates[0] : undefined);

    if (watch) claimed.add(watch.sourceSystemId);
    plans.push(planFromSystem(system, watch, now, activeWindowHours));
  }

  for (const watch of watched) {
    if (claimed.has(watch.sourceSystemId)) continue;
    plans.push(planFromWatch(watch, now));
  }

  return plans;
}
