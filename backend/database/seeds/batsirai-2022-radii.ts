// Rayons de vent documentés du cyclone Batsirai (janvier-février 2022).
//
// Source : NOAA/NCEI, IBTrACS v04r01, tempête 2022024S09090.
// Agence retenue : RSMC La Réunion (Météo-France), autorité WMO du bassin —
// même agence que l'intensité retenue pour la trajectoire officielle.
// Valeur retenue : rayon MAXIMAL des 4 quadrants (NE/SE/SW/NW) du vent ≥ 34, 50
// et 64 kt, converti en kilomètres (1 nmi = 1,852 km). IBTrACS publie quatre
// rayons par seuil ; la carte n'affiche qu'un cercle, on retient donc l'enveloppe
// maximale réellement documentée — jamais une valeur estimée.
// Un seuil non publié par la RSMC La Réunion reste à null (aucune valeur inventée).
//
// Fichier regénéré automatiquement : ne pas éditer à la main.
// Commande : npm run db:generate:batsirai-radii

export interface BatsiraiRadiiPoint {
  /** Horodatage UTC ISO-8601, identique au point de trajectoire correspondant. */
  time: string;
  /** Rayon maximal des 4 quadrants du vent ≥ 34 kt (km), ou null si non publié. */
  radius34ktKm: number | null;
  /** Rayon maximal des 4 quadrants du vent ≥ 50 kt (km), ou null si non publié. */
  radius50ktKm: number | null;
  /** Rayon maximal des 4 quadrants du vent ≥ 64 kt (km), ou null si non publié. */
  radius64ktKm: number | null;
}

export const BATSIRAI_RADII: BatsiraiRadiiPoint[] = [
  { time: '2022-01-24T00:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-24T06:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-24T12:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-24T18:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-25T00:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-25T06:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-25T12:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-25T18:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-26T00:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-26T06:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-26T12:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-26T18:00:00Z', radius34ktKm: 27.8, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-27T00:00:00Z', radius34ktKm: 35.2, radius50ktKm: 7.4, radius64ktKm: null },
  { time: '2022-01-27T06:00:00Z', radius34ktKm: 44.4, radius50ktKm: 18.5, radius64ktKm: null },
  { time: '2022-01-27T12:00:00Z', radius34ktKm: 53.7, radius50ktKm: 27.8, radius64ktKm: null },
  { time: '2022-01-27T18:00:00Z', radius34ktKm: 64.8, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-28T00:00:00Z', radius34ktKm: 44.4, radius50ktKm: 33.3, radius64ktKm: null },
  { time: '2022-01-28T06:00:00Z', radius34ktKm: 44.4, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-28T12:00:00Z', radius34ktKm: 53.7, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-28T18:00:00Z', radius34ktKm: 64.8, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-01-29T00:00:00Z', radius34ktKm: 53.7, radius50ktKm: 20.4, radius64ktKm: null },
  { time: '2022-01-29T06:00:00Z', radius34ktKm: 44.4, radius50ktKm: 27.8, radius64ktKm: null },
  { time: '2022-01-29T12:00:00Z', radius34ktKm: 64.8, radius50ktKm: 35.2, radius64ktKm: null },
  { time: '2022-01-29T18:00:00Z', radius34ktKm: 64.8, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-30T00:00:00Z', radius34ktKm: 83.3, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-30T06:00:00Z', radius34ktKm: 94.5, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-30T12:00:00Z', radius34ktKm: 98.2, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-30T18:00:00Z', radius34ktKm: 109.3, radius50ktKm: 44.4, radius64ktKm: null },
  { time: '2022-01-31T00:00:00Z', radius34ktKm: 129.6, radius50ktKm: 53.7, radius64ktKm: null },
  { time: '2022-01-31T06:00:00Z', radius34ktKm: 129.6, radius50ktKm: 53.7, radius64ktKm: null },
  { time: '2022-01-31T12:00:00Z', radius34ktKm: 129.6, radius50ktKm: 53.7, radius64ktKm: null },
  { time: '2022-01-31T18:00:00Z', radius34ktKm: 138.9, radius50ktKm: 64.8, radius64ktKm: null },
  { time: '2022-02-01T00:00:00Z', radius34ktKm: 148.2, radius50ktKm: 64.8, radius64ktKm: null },
  { time: '2022-02-01T06:00:00Z', radius34ktKm: 183.3, radius50ktKm: 74.1, radius64ktKm: null },
  { time: '2022-02-01T12:00:00Z', radius34ktKm: 218.5, radius50ktKm: 83.3, radius64ktKm: null },
  { time: '2022-02-01T18:00:00Z', radius34ktKm: 218.5, radius50ktKm: 83.3, radius64ktKm: null },
  { time: '2022-02-02T00:00:00Z', radius34ktKm: 218.5, radius50ktKm: 94.5, radius64ktKm: null },
  { time: '2022-02-02T06:00:00Z', radius34ktKm: 238.9, radius50ktKm: 94.5, radius64ktKm: null },
  { time: '2022-02-02T12:00:00Z', radius34ktKm: 259.3, radius50ktKm: 94.5, radius64ktKm: null },
  { time: '2022-02-02T18:00:00Z', radius34ktKm: 294.5, radius50ktKm: 94.5, radius64ktKm: null },
  { time: '2022-02-03T00:00:00Z', radius34ktKm: 314.8, radius50ktKm: 109.3, radius64ktKm: null },
  { time: '2022-02-03T06:00:00Z', radius34ktKm: 314.8, radius50ktKm: 118.5, radius64ktKm: null },
  { time: '2022-02-03T12:00:00Z', radius34ktKm: 333.4, radius50ktKm: 138.9, radius64ktKm: null },
  { time: '2022-02-03T18:00:00Z', radius34ktKm: 368.5, radius50ktKm: 138.9, radius64ktKm: null },
  { time: '2022-02-04T00:00:00Z', radius34ktKm: 314.8, radius50ktKm: 138.9, radius64ktKm: null },
  { time: '2022-02-04T06:00:00Z', radius34ktKm: 279.7, radius50ktKm: 148.2, radius64ktKm: null },
  { time: '2022-02-04T12:00:00Z', radius34ktKm: 259.3, radius50ktKm: 153.7, radius64ktKm: null },
  { time: '2022-02-04T18:00:00Z', radius34ktKm: 259.3, radius50ktKm: 153.7, radius64ktKm: null },
  { time: '2022-02-05T00:00:00Z', radius34ktKm: 294.5, radius50ktKm: 153.7, radius64ktKm: null },
  { time: '2022-02-05T06:00:00Z', radius34ktKm: 348.2, radius50ktKm: 164.8, radius64ktKm: null },
  { time: '2022-02-05T12:00:00Z', radius34ktKm: 368.5, radius50ktKm: 164.8, radius64ktKm: null },
  { time: '2022-02-05T18:00:00Z', radius34ktKm: 403.7, radius50ktKm: 164.8, radius64ktKm: null },
  { time: '2022-02-06T00:00:00Z', radius34ktKm: 444.5, radius50ktKm: 98.2, radius64ktKm: null },
  { time: '2022-02-06T06:00:00Z', radius34ktKm: 198.2, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-06T12:00:00Z', radius34ktKm: 238.9, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-06T18:00:00Z', radius34ktKm: 279.7, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-07T00:00:00Z', radius34ktKm: 279.7, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-07T06:00:00Z', radius34ktKm: 368.5, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-07T12:00:00Z', radius34ktKm: 464.9, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-07T18:00:00Z', radius34ktKm: 553.7, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-08T00:00:00Z', radius34ktKm: 498.2, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-08T06:00:00Z', radius34ktKm: 444.5, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-08T12:00:00Z', radius34ktKm: 498.2, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-08T18:00:00Z', radius34ktKm: 553.7, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-09T00:00:00Z', radius34ktKm: 518.6, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-09T06:00:00Z', radius34ktKm: 464.9, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-09T12:00:00Z', radius34ktKm: 359.3, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-09T18:00:00Z', radius34ktKm: 333.4, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-10T00:00:00Z', radius34ktKm: 388.9, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-10T06:00:00Z', radius34ktKm: 464.9, radius50ktKm: null, radius64ktKm: null },
  { time: '2022-02-10T12:00:00Z', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },
];
