import { useMemo } from 'react';
import { Circle, Polygon } from 'react-leaflet';
import { CYCLONE_VIOLET, documentedWindBelts, documentedWindCircles } from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

/**
 * Emprise documentée des vents du cyclone : un disque translucide par point de
 * trajectoire dont la source publie un rayon (RSMC), et surtout un « entre-deux »
 * entre chaque paire de mesures — l'enveloppe convexe des deux disques. Sans
 * ces entre-deux, l'emprise n'apparaîtrait que comme une suite de cercles isolés
 * là où les rayons sont petits devant l'écart entre points ; avec eux, elle est
 * continue du premier au dernier point documenté.
 *
 * Ce n'est PAS un cône d'incertitude : pour un événement observé (best track),
 * aucune incertitude de position n'est publiée. Rien n'est dessiné pour les
 * points muets (une absence n'est pas un zéro) et aucune largeur intermédiaire
 * n'est calculée : chaque cercle garde le rayon publié, chaque entre-deux n'est
 * que la liaison entre deux mesures datées.
 *
 * La couche est passive (sans contour, non interactive) : une emprise de 550 km
 * ne doit capter ni clic ni survol. La teinte plus dense au centre n'est qu'un
 * cumul de superpositions, pas une donnée.
 */
export function CycloneWindSwath({ points }: { points: readonly TrackStatePoint[] }) {
  const { circles, belts } = useMemo(() => {
    const measured = documentedWindCircles(points);
    return { circles: measured, belts: documentedWindBelts(measured) };
  }, [points]);

  if (circles.length === 0) return null;

  const pathOptions = {
    className: 'madarisk-wind-swath',
    stroke: false,
    fillColor: CYCLONE_VIOLET,
    fillOpacity: 0.1,
    interactive: false,
  };

  return (
    <>
      {belts.map((belt) => (
        <Polygon key={belt.id} positions={belt.positions} pathOptions={pathOptions} />
      ))}
      {circles.map((circle) => (
        <Circle
          key={circle.id}
          center={[circle.latitude, circle.longitude]}
          radius={circle.radiusKm * 1000}
          pathOptions={pathOptions}
        />
      ))}
    </>
  );
}
