import { booleanIntersects } from '@turf/boolean-intersects';
import { circle } from '@turf/circle';
import { convex } from '@turf/convex';
import { featureCollection } from '@turf/helpers';
import { union } from '@turf/union';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { TrackStatePoint } from '@/types';
import { featureId } from '@/lib/crisisStyles';

/**
 * Zone de position probable du centre (cône d'incertitude de trajectoire).
 *
 * Le calcul part des seuls points de prévision (`trackType === 'PREVUE'`) : un
 * cercle par point, de rayon égal à l'erreur de position de son échéance, puis
 * l'enveloppe convexe de chaque paire de cercles consécutifs, enfin l'union de
 * tous les tronçons — un seul polygone continu, sans trou entre deux échéances.
 *
 * Ce que la zone n'est PAS : une donnée observée. Aucune erreur de position
 * n'est publiée dans la base (`event_tracks` n'a pas de colonne d'incertitude) ;
 * les rayons viennent de la table de travail ci-dessous, interpolée linéairement
 * entre deux échéances et jamais extrapolée au-delà de la dernière.
 */

/** Échéance (heures après le bulletin) → rayon d'erreur de position du centre (km). */
export interface ForecastErrorAnchor {
  hours: number;
  radiusKm: number;
}

/**
 * Table de travail de l'erreur de position.
 *
 * ATTENTION — provenance : ces valeurs ne sont publiées par aucune source
 * présente dans l'application (ni colonne en base, ni bulletin RSMC importé).
 * Elles doivent être remplacées par les statistiques officielles d'erreur de
 * prévision dès qu'elles sont disponibles ; la légende le dit explicitement à
 * l'utilisateur de la salle de crise.
 */
export const FORECAST_ERROR_RADII_KM: readonly ForecastErrorAnchor[] = [
  { hours: 0, radiusKm: 20 },
  { hours: 12, radiusKm: 60 },
  { hours: 24, radiusKm: 90 },
  { hours: 36, radiusKm: 120 },
  { hours: 48, radiusKm: 150 },
  { hours: 72, radiusKm: 220 },
  { hours: 96, radiusKm: 300 },
  { hours: 120, radiusKm: 400 },
];

export const FORECAST_CONE_LABEL = 'Zone de position probable du centre';

export const FORECAST_CONE_NOTE =
  'Rayons d’erreur de position interpolés selon l’échéance : valeurs de travail, ' +
  'non publiées par le RSMC — la zone est un modèle, pas une donnée observée.';

/** Échéance d'un point de prévision, exprimée en heures après le bulletin. */
export interface ForecastConePoint {
  latitude: number;
  longitude: number;
  hours: number;
}

/** Propriétés posées sur le polygone de la zone (tests, légende, débogage). */
export type ForecastConeProperties = {
  pointCount: number;
  firstHours: number;
  lastHours: number;
  maxRadiusKm: number;
};

export type ForecastCone = Feature<Polygon | MultiPolygon, ForecastConeProperties>;

/** Nombre de sommets par cercle : assez fin pour un contour lisible. */
const CIRCLE_STEPS = 64;
const MS_PER_HOUR = 3_600_000;

/**
 * Rayon d'erreur d'une échéance, par interpolation linéaire entre les échéances
 * de la table. Renvoie `null` — donc aucun cercle — sans échéance exploitable,
 * pour une échéance négative ou au-delà de la dernière échéance : aucune valeur
 * n'est extrapolée, et une absence n'est jamais un zéro.
 */
export function forecastErrorRadiusKm(hours: number | null | undefined): number | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;

  const first = FORECAST_ERROR_RADII_KM[0];
  if (hours <= first.hours) return first.radiusKm;

  for (let index = 1; index < FORECAST_ERROR_RADII_KM.length; index += 1) {
    const previous = FORECAST_ERROR_RADII_KM[index - 1];
    const next = FORECAST_ERROR_RADII_KM[index];
    if (hours > next.hours) continue;
    const ratio = (hours - previous.hours) / (next.hours - previous.hours);
    return previous.radiusKm + ratio * (next.radiusKm - previous.radiusKm);
  }
  // Au-delà de la dernière échéance connue : pas d'extrapolation.
  return null;
}

/**
 * Normalise une longitude dans [-180, 180[ : la traversée de l'antiméridien ne
 * doit pas replier la zone à l'autre bout du monde.
 */
export function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * Déplie les longitudes d'une suite de points (déjà triés par échéance) pour
 * qu'elles restent continues : deux points à 179° et −179° ne sont qu'à 2° l'un
 * de l'autre, et la zone ne doit pas faire le tour du monde pour les relier.
 * Les longitudes dépliées peuvent sortir de [-180, 180[ (179° → 181°) : c'est
 * la seule façon de garder la zone d'un seul tenant de part et d'autre de la
 * ligne de changement de date.
 */
function unwrapLongitudes(points: Array<{ longitude: number }>): void {
  const first = normalizeLongitude(points[0].longitude);
  points[0].longitude = first;
  let previous = first;
  for (let index = 1; index < points.length; index += 1) {
    let longitude = normalizeLongitude(points[index].longitude);
    while (longitude - previous > 180) longitude -= 360;
    while (previous - longitude > 180) longitude += 360;
    points[index].longitude = longitude;
    previous = longitude;
  }
}

/**
 * Construit la zone probable à partir des points de prévision.
 *
 * Renvoie `null` quand rien n'est dessinable (liste vide, points sans échéance
 * exploitable, coordonnées non finies) : l'appelant n'affiche alors aucune
 * couche. Un seul point exploitable donne ce seul cercle — il n'y a aucune
 * liaison à inventer entre deux échéances qui n'existent pas.
 */
export function buildCone(points: readonly ForecastConePoint[]): ForecastCone | null {
  const usable: Array<ForecastConePoint & { radiusKm: number }> = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    const radiusKm = forecastErrorRadiusKm(point.hours);
    if (radiusKm == null || radiusKm <= 0) continue;
    usable.push({
      hours: point.hours,
      latitude: point.latitude,
      longitude: point.longitude,
      radiusKm,
    });
  }
  if (usable.length === 0) return null;

  // Ordre d'échéance : une enveloppe convexe relie deux points voisins dans le
  // temps, jamais un point à un autre qui le précède.
  usable.sort((a, b) => a.hours - b.hours);
  unwrapLongitudes(usable);

  const properties: ForecastConeProperties = {
    pointCount: usable.length,
    firstHours: usable[0].hours,
    lastHours: usable[usable.length - 1].hours,
    maxRadiusKm: usable.reduce((max, point) => Math.max(max, point.radiusKm), 0),
  };

  const shapes = usable.map((point) =>
    circle([point.longitude, point.latitude], point.radiusKm, {
      steps: CIRCLE_STEPS,
      units: 'kilometers',
    }),
  );

  // Une seule échéance : la zone est ce cercle, rien à relier.
  if (shapes.length === 1) return { ...shapes[0], properties };

  // L'enveloppe convexe de chaque paire consécutive contient les deux cercles :
  // toutes les échéances sont couvertes, la première comme la dernière.
  const pieces: Array<Feature<Polygon>> = [];
  for (let index = 0; index < shapes.length - 1; index += 1) {
    const hull = convex(featureCollection([shapes[index], shapes[index + 1]]));
    pieces.push(hull ?? shapes[index]);
  }

  // Une seule liaison (deux échéances) : la zone est cette enveloppe. Passer
  // par l'union la transformerait en multi-polygone sans rien changer à l'écran.
  if (pieces.length === 1) return { ...pieces[0], properties };

  try {
    const merged = union(featureCollection(pieces));
    if (merged) return { ...merged, properties };
  } catch {
    // Géométrie dégénérée : on rend les tronçons tels quels plutôt que rien.
    // Superposés à l'écran, ils dessinent exactement la même zone.
  }

  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'MultiPolygon',
      coordinates: pieces.map((piece) => piece.geometry.coordinates),
    },
  };
}

/** Boîte englobante [minLng, minLat, maxLng, maxLat]. */
export type BBox = [number, number, number, number];

function collectPositions(node: unknown, out: Array<[number, number]>): void {
  if (!Array.isArray(node)) return;
  const [first, second] = node as [unknown, unknown];
  if (typeof first === 'number' && typeof second === 'number') {
    out.push([first, second]);
    return;
  }
  for (const child of node) collectPositions(child, out);
}

/** Boîte englobante d'une géométrie, `null` si elle ne porte aucune coordonnée. */
export function geometryBBox(geometry: Geometry | null | undefined): BBox | null {
  if (!geometry) return null;
  const positions: Array<[number, number]> = [];
  if ('coordinates' in geometry) {
    collectPositions(geometry.coordinates, positions);
  } else if ('geometries' in geometry) {
    for (const child of geometry.geometries ?? []) {
      const box = geometryBBox(child);
      if (box) positions.push([box[0], box[1]], [box[2], box[3]]);
    }
  }
  if (positions.length === 0) return null;

  let [minLng, minLat] = positions[0];
  let [maxLng, maxLat] = positions[0];
  for (const [lng, lat] of positions) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Identifiants des polygones qui intersectent la zone probable.
 *
 * Le test d'intersection est coûteux : il n'est lancé qu'après un pré-filtre sur
 * les boîtes englobantes, qui écarte l'immense majorité des communes. Le
 * résultat est destiné à être mémorisé par l'appelant tant que la zone et la
 * couche affichée ne changent pas.
 */
export function intersectingFeatureIds(
  area: Feature<Polygon | MultiPolygon>,
  collection: FeatureCollection | null | undefined,
  idOf: (properties: Record<string, unknown>) => string = featureId,
): Set<string> {
  const ids = new Set<string>();
  const areaBox = geometryBBox(area.geometry);
  if (!areaBox || !collection?.features?.length) return ids;

  for (const item of collection.features) {
    const featureBox = geometryBBox(item.geometry);
    if (!featureBox || !bboxIntersects(areaBox, featureBox)) continue;
    try {
      if (!booleanIntersects(item as Feature, area)) continue;
    } catch {
      // Géométrie illisible côté commune : la zone reste affichée sans elle.
      continue;
    }
    const id = idOf((item.properties ?? {}) as Record<string, unknown>);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Points de prévision exploitables : uniquement `PREVUE`, et seulement ceux
 * dont l'échéance est datable (`forecastFor` − `observedAt`). Un point sans
 * `forecastFor` est écarté — sans échéance, pas de rayon, et un rayon inventé
 * vaut moins que pas de zone du tout.
 */
export function conePointsFromTrack(points: readonly TrackStatePoint[]): ForecastConePoint[] {
  const usable: ForecastConePoint[] = [];
  for (const point of points) {
    if (point.trackType !== 'PREVUE') continue;
    if (!point.forecastFor || !point.observedAt) continue;
    const hours = (Date.parse(point.forecastFor) - Date.parse(point.observedAt)) / MS_PER_HOUR;
    if (!Number.isFinite(hours)) continue;
    usable.push({ latitude: point.latitude, longitude: point.longitude, hours });
  }
  return usable;
}
