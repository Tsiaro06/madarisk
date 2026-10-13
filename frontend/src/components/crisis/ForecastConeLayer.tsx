import { GeoJSON } from 'react-leaflet';
import { coneStyle } from '@/lib/crisisStyles';
import type { ForecastCone } from '@/lib/forecastCone';

/**
 * Zone de position probable du centre (trajectoire PRÉVUE).
 *
 * Une seule forme lisse, construite par `buildCone` (lib/forecastCone.ts) :
 * un cercle par échéance — rayon d'erreur de position — relié au suivant par
 * l'enveloppe convexe des deux cercles, le tout fusionné en un polygone.
 * Le composant ne calcule rien : il ne fait qu'afficher la géométrie reçue, ce
 * qui laisse l'appelant mémoriser le résultat et s'en servir pour colorer les
 * communes traversées.
 *
 * La couche est passive (`interactive: false`) : la zone ne doit capturer ni
 * clic ni survol, la sélection des communes dessous reste possible.
 */
export function ForecastConeLayer({ cone }: { cone: ForecastCone | null }) {
  if (!cone) return null;
  return <GeoJSON data={cone} style={coneStyle} interactive={false} />;
}
