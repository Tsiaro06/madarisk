import type { ImpactState, ObservedRiskLevel, RiskLevel, TrackStatePoint } from '@/types';

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

/**
 * Niveaux d'une zone de vigilance du bulletin prévisionnel, du plus faible au
 * plus intense. Sert à n'afficher que les niveaux réellement présents en base.
 */
export const VIGILANCE_LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

/** Violet du marqueur cyclone (historique) — distinct du navy MadaRisk. */
export const CYCLONE_VIOLET = '#7c3aed';
export const CYCLONE_VIOLET_DEEP = '#5b21b6';

/** Vitesses de lecture d'une trajectoire (1× = temps d'animation nominal). */
export type PlaybackSpeed = '1x' | '2x' | '4x';

/**
 * Lecture visuelle provisoire : chaque segment de la trajectoire est parcouru
 * en 3 s, indépendamment de l'écart d'horodatage réel entre les deux points (le
 * temps réel n'est pas encore pris en compte). Les vitesses multiplient ce pas.
 */
export const PLAYBACK_SEGMENT_MS: Record<PlaybackSpeed, number> = {
  '1x': 3_000,
  '2x': 1_500,
  '4x': 750,
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

/**
 * Durée réelle (en minutes) du segment de trajectoire contenant l'instant
 * `atMs`, ou 0 lorsqu'il n'y a plus de point suivant (fin de trajectoire).
 *
 * Sert à la lecture visuelle provisoire : le curseur n'avance pas selon une
 * horloge réelle, il avance pour que CHAQUE segment soit parcouru dans le même
 * laps de temps d'animation — quel que soit l'écart réel entre les points.
 */
export function segmentMinutesAt(steps: TrackStatePoint[], atMs: number): number {
  const frame = frameAt(steps, atMs);
  if (!frame || !frame.to) return 0;
  const minutes = (pointTimeMs(frame.to) - pointTimeMs(frame.from)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
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
 * Seuil du rayon de vent publié par la source : RMW (vent maximal), R34, R50
 * ou R64 (nœuds d'après l'échelle de Beaufort utilisée par les RSMC).
 */
export type WindRadiusKind = 'max' | 34 | 50 | 64;

export interface DocumentedWindRadius {
  /** Rayon en km, tel que publié par la source (jamais recalculé, jamais interpolé). */
  km: number;
  /** Seuil correspondant : un seul cercle est dessiné, le plus large gagne. */
  kind: WindRadiusKind;
}

/**
 * Rayon de vent réellement documenté, sinon `null`. On n'assimile jamais une
 * absence à zéro et on ne parle pas de « diamètre » sans définition.
 *
 * Les seuils sont examinés du plus large au plus étroit (RMW → R34 → R50 → R64)
 * car la carte n'affiche qu'un cercle : il représente donc l'enveloppe
 * documentée la plus large de ce point. Le seuil retenu est retourné avec la
 * valeur, pour pouvoir l'annoncer à l'écran (ex. « R34 · 368,5 km »).
 */
export function documentedWindRadius(
  point: TrackStatePoint | null | undefined,
): DocumentedWindRadius | null {
  if (!point) return null;
  const candidates: Array<{ kind: WindRadiusKind; value: number | null | undefined }> = [
    { kind: 'max', value: point.radiusMaxKm },
    { kind: 34, value: point.radius34ktKm },
    { kind: 50, value: point.radius50ktKm },
    { kind: 64, value: point.radius64ktKm },
  ];
  for (const candidate of candidates) {
    if (candidate.value != null && Number.isFinite(candidate.value)) {
      return { km: candidate.value, kind: candidate.kind };
    }
  }
  return null;
}

/** Rayon de vent (km) réellement documenté, sinon `null`. */
export function availableWindRadiusKm(point: TrackStatePoint | null | undefined): number | null {
  return documentedWindRadius(point)?.km ?? null;
}

/** Libellé court du seuil, tel qu'il figure dans les bulletins cycloniques. */
export function windRadiusShortLabel(kind: WindRadiusKind): string {
  return kind === 'max' ? 'RMW' : `R${kind}`;
}

/** Libellé explicite du seuil, pour les infobulles et le panneau de détail. */
export function windRadiusLongLabel(kind: WindRadiusKind): string {
  if (kind === 'max') return 'Rayon des vents maximaux (RMW)';
  return `Rayon du vent ≥ ${kind} nœuds (R${kind})`;
}

/** Cercle d'emprise : un point daté et le rayon de vent publié pour lui. */
export interface DocumentedWindCircle {
  id: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  kind: WindRadiusKind;
}

/**
 * Emprise documentée des vents : un cercle par point dont la source publie un
 * rayon. Aucun cercle n'est créé pour un point muet — une absence n'est pas un
 * zéro — et aucun rayon n'est interpolé entre deux mesures : la forme se déduit
 * uniquement de ce qui est publié, point par point.
 *
 * C'est l'UNION de ces cercles qui donne l'aspect d'entonnoir le long de la
 * trajectoire. Ce n'est pas un cône d'incertitude : pour un événement observé
 * (best track), aucune incertitude de position n'est publiée.
 */
export function documentedWindCircles(
  points: readonly TrackStatePoint[],
): DocumentedWindCircle[] {
  const circles: DocumentedWindCircle[] = [];
  for (const point of points) {
    const radius = documentedWindRadius(point);
    if (!radius || radius.km <= 0) continue;
    circles.push({
      id: point.id,
      observedAt: point.observedAt,
      latitude: point.latitude,
      longitude: point.longitude,
      radiusKm: radius.km,
      kind: radius.kind,
    });
  }
  return circles;
}

/** Kilomètres par degré : repère local suffisant à l'échelle d'un intervalle de 6 h. */
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/** Entre-deux continu entre deux mesures : les deux tangentes extérieures. */
export interface WindSwathBelt {
  id: string;
  /**
   * Quatre sommets [lat, lon] dans l'ordre du contour : deux points de tangence
   * sur le premier cercle, deux sur le second.
   */
  positions: Array<[number, number]>;
}

/**
 * « Entre-deux » documenté : pour deux cercles publiés consécutifs, l'enveloppe
 * convexe des deux disques, c'est-à-dire la bande comprise entre leurs deux
 * tangentes extérieures. C'est elle qui relie les mesures au lieu de laisser
 * une suite de cercles isolés là où les rayons sont petits devant l'écart entre
 * points (début de trajectoire).
 *
 * Rien n'est inventé de plus que la continuité du phénomène d'un point daté au
 * suivant : les deux tangentes touchent les cercles publiés, et les sommets
 * sont à exactement `radiusKm` de leur centre — aucune largeur intermédiaire
 * n'est calculée.
 *
 * Les tangentes extérieures n'existent pas quand un disque contient l'autre
 * (distance ≤ |r1 − r2|) : la paire est alors ignorée, la plus grande mesure
 * couvrant déjà l'union.
 */
export function documentedWindBelts(
  circles: readonly DocumentedWindCircle[],
): WindSwathBelt[] {
  const belts: WindSwathBelt[] = [];
  for (let index = 0; index < circles.length - 1; index += 1) {
    const from = circles[index];
    const to = circles[index + 1];
    const scale = Math.cos((from.latitude * Math.PI) / 180);
    const dx = (to.longitude - from.longitude) * KM_PER_DEG_LON_EQUATOR * scale;
    const dy = (to.latitude - from.latitude) * KM_PER_DEG_LAT;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance <= Math.abs(to.radiusKm - from.radiusKm)) continue;

    const ux = dx / distance;
    const uy = dy / distance;
    const cosPsi = (to.radiusKm - from.radiusKm) / distance;
    const sinPsi = Math.sqrt(Math.max(0, 1 - cosPsi * cosPsi));

    /** Retour au lat/lon depuis le repère local (km) ancré sur le premier centre. */
    const toLatLng = (offsetX: number, offsetY: number): [number, number] => [
      from.latitude + offsetY / KM_PER_DEG_LAT,
      from.longitude + offsetX / (KM_PER_DEG_LON_EQUATOR * scale),
    ];

    // Une tangente par côté : m = cos ψ · u + side · sin ψ · n (n = normale gauche),
    // et les points de contact sont les centres reculés de −r · m.
    const tangent: Array<[number, number]> = [];
    for (const side of [1, -1]) {
      const mx = cosPsi * ux + side * sinPsi * -uy;
      const my = cosPsi * uy + side * sinPsi * ux;
      tangent.push(toLatLng(-from.radiusKm * mx, -from.radiusKm * my));
      tangent.push(
        toLatLng(dx - to.radiusKm * mx, dy - to.radiusKm * my),
      );
    }
    // Ordre du contour : tangente du premier côté, puis retour par le second.
    belts.push({
      id: `${from.id}→${to.id}`,
      positions: [tangent[0], tangent[1], tangent[3], tangent[2]],
    });
  }
  return belts;
}

/** Mesure avec unité, ou « non disponible » quand la source ne la fournit pas. */
export function formatMeasure(value: number | null | undefined, unit: string): string {
  if (value == null || Number.isNaN(value)) return 'non disponible';
  return `${value.toLocaleString('fr-FR')} ${unit}`;
}

/**
 * Libellé court d'une zone de vigilance (bulletin prévisionnel) : on reprend
 * les mots de la source jusqu'à la mention « zone placée… », sans reformuler.
 * Retourne `null` si la description ne porte pas de libellé exploitable.
 */
export function vigilanceLabel(description: string | null | undefined): string | null {
  if (!description) return null;
  const head = description.split(/zone placée/i)[0].replace(/[—–-]\s*$/, '').trim();
  return head || null;
}