import type { ImpactState, ObservedRiskLevel, TrackStatePoint } from '@/types';

/**
 * Palette des impacts OBSERVÉS d'un événement historique (Batsirai etc.) :
 * vert → jaune → orange → rouge, gris pour « non disponible ». Volontairement
 * distincte de RISK_COLORS (risque prévisionnel désaturé) : la carte de
 * l'historique doit se lire comme des faits datés, pas comme une prévision.
 */
export const OBSERVED_RISK_COLORS: Record<ObservedRiskLevel, string> = {
  FAIBLE: '#6f9e5d',
  MODERE: '#d9a42b',
  ELEVE: '#e26d2b',
  TRES_ELEVE: '#c93a3a',
  INCONNU: '#94a3b8',
};

export const OBSERVED_RISK_LABELS: Record<ObservedRiskLevel, string> = {
  FAIBLE: 'Faible',
  MODERE: 'Modéré',
  ELEVE: 'Élevé',
  TRES_ELEVE: 'Très élevé',
  INCONNU: 'Non disponible',
};

export const IMPACT_STATE_LABELS: Record<ImpactState, string> = {
  NOT_REACHED: 'Non atteint',
  CENTER_CROSSED: 'Centre passé sur la commune',
  WIND_IMPACT: 'Impact de vent',
  RAIN_IMPACT: 'Impact de pluie',
  FLOOD_IMPACT: 'Impact d’inondation',
  IMPACT_ESTIMATED: 'Impact estimé',
  UNKNOWN: 'Inconnu',
};

/** Commune jamais affectée au temps courant : gris neutre transparent. */
export const NOT_AFFECTED_FILL = '#94a3b8';

/** Violet du marqueur cyclone (historique) — distinct du navy MadaRisk. */
export const CYCLONE_VIOLET = '#7c3aed';
export const CYCLONE_VIOLET_DEEP = '#5b21b6';

/** Durée de traversée complète de la trajectoire en lecture (par vitesse). */
export const PLAYBACK_TRAVERSAL_MS: Record<'1x' | '2x' | '4x', number> = {
  '1x': 45_000,
  '2x': 22_500,
  '4x': 11_250,
};

/** Seuil des vents soutenus (ge) ; en dessous : MODERE. */
export const TRES_ELEVE_WIND_THRESHOLD_KMH = 118;
export const ELEVE_WIND_THRESHOLD_KMH = 89;

/**
 * Niveau de risque OBSERVÉ dérivé du vent soutenu documenté (best track /
 * WMO, source : bulletin de suivi). Jamais de FAIBLE ici : en dessous de 89
 * km/h le passage est catégorisé MODÈRE ; sans donnée de vent → INCONNU.
 */
export function deriveRiskFromWind(windSpeedKmh: number | null): ObservedRiskLevel {
  if (windSpeedKmh == null || Number.isNaN(windSpeedKmh)) return 'INCONNU';
  if (windSpeedKmh >= TRES_ELEVE_WIND_THRESHOLD_KMH) return 'TRES_ELEVE';
  if (windSpeedKmh >= ELEVE_WIND_THRESHOLD_KMH) return 'ELEVE';
  return 'MODERE';
}

/** Madagascar est à UTC+3 toute l'année (pas d'heure d'été). */
export const ANTANANARIVO_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Convertit une date/heure UTC en la Date « heure locale de Madagascar »
 * (décalage fixe +3 h). Les affichages utilisent ensuite cette Date avec
 * `timeZone: 'UTC'` pour une sortie déterministe.
 */
export function toAntananarivoTime(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getTime() + ANTANANARIVO_OFFSET_MS);
}

/** Format un timestamp en heure locale de Madagascar (UTC+3), ex. « 5 févr. 2022, 19:00 ». */
export function formatAntananarivo(
  iso: string | null | undefined,
  withSeconds = false,
): string {
  if (!iso) return '—';
  const local = toAntananarivoTime(iso);
  return local.toLocaleString('fr-FR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  });
}

/** Format compact pour la barre temporelle, ex. « 05 févr. 19:00 ». */
export function formatAntananarivoShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const local = toAntananarivoTime(iso);
  return local.toLocaleString('fr-FR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface CommuneImpactLike {
  communeId: string;
  firstAffectedAt: string | null;
}

/**
 * Commune affectée à la date `at` : son premier impact observé est
 * antérieur ou égal à `at`. Un `firstAffectedAt` absent compte comme
 * affecté (cohérent avec le backend qui inclut les NULL à toute date).
 * ISO-8601 du backend → comparaison lexicographique fiable.
 */
export function isAffectedAt(impact: CommuneImpactLike, at: string): boolean {
  if (impact.firstAffectedAt == null) return true;
  return impact.firstAffectedAt <= at;
}

/** Sous-ensemble des impacts observés jusqu'à `at` inclus. */
export function filterImpactsAt<T extends CommuneImpactLike>(
  impacts: T[],
  at: string,
): T[] {
  return impacts.filter((i) => isAffectedAt(i, at));
}

const OBSERVED_ONLY = (p: TrackStatePoint) => p.trackType === 'OBSERVEE';

/** Points OBSERVÉS triés chronologiquement (base des pas de la barre). */
export function observedSteps(points: TrackStatePoint[]): TrackStatePoint[] {
  return points
    .filter(OBSERVED_ONLY)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

/** Coordonnées [lon, lat] GeoJSON à partir d'un point observé. */
export function pointCoords(p: TrackStatePoint): [number, number] {
  return [p.longitude, p.latitude];
}

/* --------------------------------------------------------------------------
 * Lecture temporelle de la trajectoire historique.
 *
 * Le marqueur cyclone n'est PAS une simulation : à l'instant demandé, on
 * retrouve le point observé réel qui précède l'instant (`from`) et le suivant
 * (`to`). Le déplacement visuel interpole uniquement la POSITION entre ces deux
 * points vérifiés ; les valeurs météo affichées restent celles du point source
 * `from`, avec son horodatage. Aucune grandeur n'est fabriquée.
 * ------------------------------------------------------------------------ */

/** Instant d'un point (ISO-8601 UTC côté API). */
export function pointTimeMs(p: { observedAt: string }): number {
  return new Date(p.observedAt).getTime();
}

/** Bornes temporelles d'une trajectoire observée, en minutes (0 min si 1 point). */
export interface TrackClockBounds {
  startMs: number;
  endMs: number;
  spanMinutes: number;
}

export function clockBounds(steps: TrackStatePoint[]): TrackClockBounds | null {
  if (steps.length === 0) return null;
  const startMs = pointTimeMs(steps[0]);
  const endMs = pointTimeMs(steps[steps.length - 1]);
  return { startMs, endMs, spanMinutes: Math.max(0, (endMs - startMs) / 60_000) };
}

/** Encadrement d'un instant par deux points observés. */
export interface ActiveTrackFrame {
  /** Index de `from` dans la liste triée. */
  index: number;
  /** Dernier point observé dont l'horodatage est ≤ l'instant demandé. */
  from: TrackStatePoint;
  /** Point observé suivant, ou `null` en fin de trajectoire. */
  to: TrackStatePoint | null;
  /** Progression de `from` vers `to` (0 = sur `from`, 1 = sur `to`). */
  progress: number;
  /** Vrai lorsque l'instant coïncide exactement avec un point observé. */
  exact: boolean;
}

export function frameAt(steps: TrackStatePoint[], atMs: number): ActiveTrackFrame | null {
  if (steps.length === 0) return null;
  let index = 0;
  for (let i = 1; i < steps.length; i += 1) {
    if (pointTimeMs(steps[i]) <= atMs) index = i;
    else break;
  }
  const from = steps[index];
  const to = steps[index + 1] ?? null;
  const fromMs = pointTimeMs(from);
  const toMs = to ? pointTimeMs(to) : null;
  const span = toMs != null && toMs > fromMs ? toMs - fromMs : 0;
  const raw = span > 0 ? (atMs - fromMs) / span : 0;
  const progress = Math.min(1, Math.max(0, raw));
  return { index, from, to, progress, exact: atMs <= fromMs };
}

/**
 * Position [lat, lng] à afficher : le point `from` exactement, ou une position
 * interpolée linéairement vers `to` (déplacement visuel uniquement).
 */
export function framePosition(frame: ActiveTrackFrame): [number, number] {
  const { from, to, progress } = frame;
  if (!to || progress <= 0) return [from.latitude, from.longitude];
  return [
    from.latitude + (to.latitude - from.latitude) * progress,
    from.longitude + (to.longitude - from.longitude) * progress,
  ];
}

const COMPASS_16 = [
  'Nord',
  'Nord-Nord-Est',
  'Nord-Est',
  'Est-Nord-Est',
  'Est',
  'Est-Sud-Est',
  'Sud-Est',
  'Sud-Sud-Est',
  'Sud',
  'Sud-Sud-Ouest',
  'Sud-Ouest',
  'Ouest-Sud-Ouest',
  'Ouest',
  'Ouest-Nord-Ouest',
  'Nord-Ouest',
  'Nord-Nord-Ouest',
] as const;

/**
 * Direction de déplacement lisible (« 220° » → « Sud-Ouest (220°) »). Purement
 * déterministe : c'est la même information, convertie en rose des vents.
 * Retourne la valeur brute si elle n'est pas un azimut numérique.
 */
export function describeMovementDirection(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return trimmed;
  const value = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(value)) return trimmed;
  const deg = ((value % 360) + 360) % 360;
  return `${COMPASS_16[Math.round(deg / 22.5) % 16]} (${trimmed})`;
}

/**
 * Rayon de vent (km) réellement documenté, sinon `null`. On n'assimile jamais
 * une absence à zéro et on ne parle pas de « diamètre » sans définition.
 */
export function availableWindRadiusKm(point: TrackStatePoint | null | undefined): number | null {
  if (!point) return null;
  const values = [point.radiusMaxKm, point.radius34ktKm, point.radius50ktKm, point.radius64ktKm];
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

/** Mesure avec unité, ou « non disponible » quand la source ne la fournit pas. */
export function formatMeasure(value: number | null | undefined, unit: string): string {
  if (value == null || Number.isNaN(value)) return 'non disponible';
  return `${value.toLocaleString('fr-FR')} ${unit}`;
}