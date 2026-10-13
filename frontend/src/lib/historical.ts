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