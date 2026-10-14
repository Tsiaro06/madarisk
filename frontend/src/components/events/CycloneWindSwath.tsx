import { useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { PathOptions } from 'leaflet';
import {
  CYCLONE_VIOLET,
  CYCLONE_VIOLET_DEEP,
  documentedWindCircles,
  documentedWindSwath,
} from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

/**
 * Emprise documentée des vents du cyclone, en UNE seule surface : l'union des
 * disques publiés par la source (RSMC, seuil le plus large retenu par point) et
 * des liaisons entre mesures consécutives — leurs tangentes extérieures, du
 * premier au dernier point documenté.
 *
 * L'union est ce qui fait la surface : dessinés séparément, les disques
 * s'additionneraient (bandes plus denses là où ils se recouvrent) et le contour
 * serait répété morceau par morceau. Le contour pointillé marque donc la limite
 * de l'ensemble ; le remplissage reste translucide pour laisser lire les
 * communes situées en dessous.
 *
 * Ce n'est PAS un cône d'incertitude : pour un événement observé (best track),
 * aucune incertitude de position n'est publiée. Rien n'est dessiné pour les
 * points muets (une absence n'est pas un zéro) et aucune largeur intermédiaire
 * n'est calculée entre deux mesures.
 *
 * La couche est passive (non interactive) : une emprise de plusieurs centaines
 * de kilomètres ne doit capter ni clic ni survol — la sélection des communes
 * dessous reste possible.
 */
const swathPathOptions: PathOptions = {
  className: 'madarisk-wind-swath',
  color: CYCLONE_VIOLET_DEEP,
  weight: 1.5,
  dashArray: '6 6',
  opacity: 0.9,
  fillColor: CYCLONE_VIOLET,
  fillOpacity: 0.18,
  interactive: false,
};

export function CycloneWindSwath({ points }: { points: readonly TrackStatePoint[] }) {
  const swath = useMemo(() => documentedWindSwath(points), [points]);

  // Le `GeoJSON` de react-leaflet ne met à jour que le style, jamais les données :
  // la clé force le remontage quand les mesures publiées changent (autre
  // événement, autre série).
  const revision = useMemo(
    () =>
      documentedWindCircles(points)
        .map((measure) => `${measure.id}:${measure.radiusKm}`)
        .join('|'),
    [points],
  );

  if (!swath) return null;

  return <GeoJSON key={revision} data={swath} style={swathPathOptions} interactive={false} />;
}
