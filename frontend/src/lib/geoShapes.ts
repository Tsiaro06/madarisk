import { circle } from '@turf/circle';
import { featureCollection } from '@turf/helpers';
import { union } from '@turf/union';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

/**
 * Formes géographiques partagées par les couches d'emprise : le disque d'un
 * rayon publié et la fusion de plusieurs polygones en une seule surface.
 *
 * Les deux couches concernées (emprise documentée des vents d'un événement
 * observé, zone de position probable d'une trajectoire prévue) suivent le même
 * principe : à chaque point daté correspond un cercle, et l'ensemble doit se lire
 * comme UNE surface continue, pas comme une mosaïque de formes superposées.
 */

/** Nombre de sommets par cercle : assez fin pour un contour lisible de près. */
export const CIRCLE_STEPS = 64;

/**
 * Taille des paquets fusionnés séparément avant l'union finale. Un long relevé
 * (une mesure toutes les 6 h pendant deux semaines) demande l'union de plus de
 * cent formes : une seule passe de balayage coûte alors près d'une seconde,
 * alors que des paquets d'une quinzaine se fusionnent en un tiers de ce temps
 * pour un résultat géométriquement identique (l'union est associative).
 */
const UNION_BLOCK_SIZE = 16;

/** Disque Turf (km) autour d'un centre [lon, lat], au rayon publié. */
export function circlePolygon(
  longitude: number,
  latitude: number,
  radiusKm: number,
): Feature<Polygon> {
  return circle([longitude, latitude], radiusKm, {
    steps: CIRCLE_STEPS,
    units: 'kilometers',
  });
}

/** Un morceau à fusionner : le plus souvent un polygone, parfois déjà une union. */
export type ShapePiece = Feature<Polygon | MultiPolygon>;

function unionAll(pieces: readonly ShapePiece[]): Feature<Polygon | MultiPolygon> | null {
  if (pieces.length === 0) return null;
  if (pieces.length === 1) return pieces[0];
  try {
    return union(featureCollection([...pieces])) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fusionne des polygones en une seule surface : l'union Turf des morceaux.
 *
 * Sans union, chaque morceau garderait son propre contour et les recouvrements
 * s'additionneraient à l'écran — des bandes plus denses qui ne sont pas une
 * donnée. Fusionnés, la couche n'a qu'un contour et une teinte uniforme.
 *
 * Replis successifs : un seul morceau est rendu tel quel (l'union le
 * transformerait en multi-polygone sans rien changer au dessin) ; si l'union
 * échoue sur une géométrie dégénérée, les morceaux sont rendus côte à côte —
 * superposés à l'écran, ils dessinent exactement la même surface. `null` quand
 * il n'y a aucun morceau : l'appelant n'affiche alors aucune couche.
 *
 * Les propriétés passées remplacent celles des morceaux : elles décrivent
 * l'ensemble (nombre de mesures prises dans l'union), pas un morceau isolé.
 */
export function mergePolygons<P>(
  pieces: readonly ShapePiece[],
  properties: P,
): Feature<Polygon | MultiPolygon, P> | null {
  if (pieces.length === 0) return null;

  let merged: Feature<Polygon | MultiPolygon> | null;
  if (pieces.length <= UNION_BLOCK_SIZE) {
    // Peu de morceaux : une seule passe suffit (et deux échéances ne doivent pas
    // être transformées en multi-polygone par une union intermédiaire).
    merged = pieces.length === 1 ? pieces[0] : unionAll(pieces);
  } else {
    const blocks: ShapePiece[] = [];
    for (let index = 0; index < pieces.length; index += UNION_BLOCK_SIZE) {
      const chunk = pieces.slice(index, index + UNION_BLOCK_SIZE);
      const mergedChunk = unionAll(chunk);
      // Paquet dégénéré : ses morceaux repartent tels quels dans l'union finale.
      if (mergedChunk) blocks.push(mergedChunk);
      else blocks.push(...chunk);
    }
    merged = unionAll(blocks);
  }

  if (merged) return { ...merged, properties };

  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'MultiPolygon',
      coordinates: pieces.flatMap((piece) =>
        piece.geometry.type === 'MultiPolygon'
          ? piece.geometry.coordinates
          : [piece.geometry.coordinates],
      ),
    },
  };
}
