import { useMemo } from 'react';
import { Circle } from 'react-leaflet';
import { CYCLONE_VIOLET, documentedWindCircles } from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

/**
 * Emprise documentée des vents du cyclone : un cercle translucide par point de
 * trajectoire dont la source publie un rayon (RSMC). Le long du trajet, l'union
 * de ces cercles dessine une forme en entonnoir qui s'élargit puis se referme —
 * c'est la lecture demandée, mais elle vient uniquement des mesures publiées.
 *
 * Ce n'est PAS un cône d'incertitude : pour un événement observé (best track),
 * aucune incertitude de position n'est publiée, et rien n'est dessiné pour les
 * points muets (une absence n'est pas un zéro). Aucun rayon n'est interpolé : la
 * forme change de largeur seulement là où une nouvelle mesure est publiée.
 *
 * Rendu volontairement passif : pas de contour, `interactive: false` — un cercle
 * de 550 km ne doit capter ni clic ni survol de la carte, ni masquer les couches
 * cliquables dessinées au-dessus. La teinte plus dense au centre n'est que
 * l'effet de superposition des cercles, pas une donnée supplémentaire.
 */
export function CycloneWindSwath({
  points,
}: {
  /** Points observés, dans l'ordre chronologique. */
  points: readonly TrackStatePoint[];
}) {
  const circles = useMemo(() => documentedWindCircles(points), [points]);

  if (circles.length === 0) return null;

  return (
    <>
      {circles.map((circle) => (
        <Circle
          key={circle.id}
          center={[circle.latitude, circle.longitude]}
          radius={circle.radiusKm * 1000}
          pathOptions={{
            className: 'madarisk-wind-swath',
            stroke: false,
            fillColor: CYCLONE_VIOLET,
            fillOpacity: 0.1,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}
