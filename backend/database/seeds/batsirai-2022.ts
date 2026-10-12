// Donnees de trajectoire Cyclone Batsirai (2022) importees depuis IBTrACS.
//
// Source : NOAA/NCEI, International Best Track Archive for Climate Stewardship
// (IBTrACS) v04r01, identifiant de tempete 2022024S09090.
// Intensite retenue : WMO/RSMC La Reunion (Meteo-France) ; a defaut JTWC (USA).
// Resolution : 1 point toutes les 6 h (00/06/12/18 UTC), de la formation a la
// dissipation. Fichier regenere automatiquement : ne pas editer a la main.
//
// ATTENTION : ces coordonnees proviennent d'un best track officiel reconnu.
// Ne jamais les modifier manuellement ; regenerer depuis la source si besoin.

export interface BatsiraiTrackPoint {
  /** Horodatage UTC ISO-8601. */
  time: string;
  lat: number;
  lon: number;
  /** Vent soutenu maximal (noeuds, source WMO/RSMC La Reunion). */
  windKt: number | null;
  /** Pression minimale au centre (hPa). */
  pressureHpa: number | null;
  /** Nature du systeme (DS, TS, MX, ET...). */
  nature: string;
  /** Vitesse de deplacement (noeuds). */
  speedKt: number | null;
  /** Direction de deplacement (degres). */
  dirDeg: number | null;
}

export const BATSIRAI_TRACK: BatsiraiTrackPoint[] = [
  { time: '2022-01-24T00:00:00Z', lat: -9.4, lon: 89.7, windKt: 20, pressureHpa: 1006, nature: 'DS', speedKt: 4, dirDeg: 220 },
  { time: '2022-01-24T06:00:00Z', lat: -9.7, lon: 89.5, windKt: 20, pressureHpa: 1006, nature: 'DS', speedKt: 3, dirDeg: 190 },
  { time: '2022-01-24T12:00:00Z', lat: -10.0, lon: 89.6, windKt: 22, pressureHpa: 1005, nature: 'TS', speedKt: 3, dirDeg: 145 },
  { time: '2022-01-24T18:00:00Z', lat: -10.3, lon: 89.9, windKt: 23, pressureHpa: 1004, nature: 'TS', speedKt: 6, dirDeg: 140 },
  { time: '2022-01-25T00:00:00Z', lat: -10.9, lon: 90.4, windKt: null, pressureHpa: null, nature: 'TS', speedKt: 9, dirDeg: 140 },
  { time: '2022-01-25T06:00:00Z', lat: -11.6, lon: 90.9, windKt: 20, pressureHpa: 1003, nature: 'MX', speedKt: 8, dirDeg: 155 },
  { time: '2022-01-25T12:00:00Z', lat: -12.3, lon: 91.1, windKt: 20, pressureHpa: 1003, nature: 'MX', speedKt: 10, dirDeg: 190 },
  { time: '2022-01-25T18:00:00Z', lat: -13.4, lon: 90.5, windKt: 25, pressureHpa: 1005, nature: 'TS', speedKt: 13, dirDeg: 225 },
  { time: '2022-01-26T00:00:00Z', lat: -14.1, lon: 89.4, windKt: 25, pressureHpa: 1003, nature: 'TS', speedKt: 14, dirDeg: 245 },
  { time: '2022-01-26T06:00:00Z', lat: -14.6, lon: 88.0, windKt: 28, pressureHpa: 1001, nature: 'TS', speedKt: 13, dirDeg: 255 },
  { time: '2022-01-26T12:00:00Z', lat: -14.9, lon: 86.7, windKt: 30, pressureHpa: 1000, nature: 'TS', speedKt: 15, dirDeg: 245 },
  { time: '2022-01-26T18:00:00Z', lat: -15.7, lon: 85.1, windKt: 40, pressureHpa: 994, nature: 'TS', speedKt: 18, dirDeg: 245 },
  { time: '2022-01-27T00:00:00Z', lat: -16.3, lon: 83.4, windKt: 50, pressureHpa: 988, nature: 'TS', speedKt: 18, dirDeg: 250 },
  { time: '2022-01-27T06:00:00Z', lat: -17.0, lon: 81.7, windKt: 60, pressureHpa: 982, nature: 'TS', speedKt: 20, dirDeg: 245 },
  { time: '2022-01-27T12:00:00Z', lat: -17.9, lon: 79.8, windKt: 85, pressureHpa: 965, nature: 'TS', speedKt: 20, dirDeg: 250 },
  { time: '2022-01-27T18:00:00Z', lat: -18.2, lon: 77.7, windKt: 70, pressureHpa: 977, nature: 'TS', speedKt: 18, dirDeg: 265 },
  { time: '2022-01-28T00:00:00Z', lat: -18.4, lon: 76.1, windKt: 50, pressureHpa: 992, nature: 'TS', speedKt: 15, dirDeg: 265 },
  { time: '2022-01-28T06:00:00Z', lat: -18.5, lon: 74.6, windKt: 45, pressureHpa: 995, nature: 'TS', speedKt: 12, dirDeg: 270 },
  { time: '2022-01-28T12:00:00Z', lat: -18.5, lon: 73.5, windKt: 40, pressureHpa: 998, nature: 'TS', speedKt: 10, dirDeg: 275 },
  { time: '2022-01-28T18:00:00Z', lat: -18.3, lon: 72.6, windKt: 45, pressureHpa: 994, nature: 'TS', speedKt: 9, dirDeg: 275 },
  { time: '2022-01-29T00:00:00Z', lat: -18.3, lon: 71.6, windKt: 50, pressureHpa: 990, nature: 'TS', speedKt: 9, dirDeg: 275 },
  { time: '2022-01-29T06:00:00Z', lat: -18.2, lon: 70.7, windKt: 65, pressureHpa: 978, nature: 'TS', speedKt: 9, dirDeg: 285 },
  { time: '2022-01-29T12:00:00Z', lat: -17.9, lon: 69.9, windKt: 80, pressureHpa: 965, nature: 'TS', speedKt: 7, dirDeg: 285 },
  { time: '2022-01-29T18:00:00Z', lat: -17.8, lon: 69.1, windKt: 85, pressureHpa: 962, nature: 'TS', speedKt: 9, dirDeg: 285 },
  { time: '2022-01-30T00:00:00Z', lat: -17.5, lon: 68.1, windKt: 85, pressureHpa: 962, nature: 'TS', speedKt: 11, dirDeg: 290 },
  { time: '2022-01-30T06:00:00Z', lat: -17.1, lon: 67.1, windKt: 90, pressureHpa: 957, nature: 'TS', speedKt: 11, dirDeg: 295 },
  { time: '2022-01-30T12:00:00Z', lat: -16.7, lon: 66.0, windKt: 95, pressureHpa: 952, nature: 'TS', speedKt: 9, dirDeg: 285 },
  { time: '2022-01-30T18:00:00Z', lat: -16.6, lon: 65.3, windKt: 85, pressureHpa: 963, nature: 'TS', speedKt: 7, dirDeg: 280 },
  { time: '2022-01-31T00:00:00Z', lat: -16.3, lon: 64.5, windKt: 65, pressureHpa: 980, nature: 'TS', speedKt: 8, dirDeg: 300 },
  { time: '2022-01-31T06:00:00Z', lat: -15.9, lon: 63.8, windKt: 65, pressureHpa: 980, nature: 'TS', speedKt: 7, dirDeg: 295 },
  { time: '2022-01-31T12:00:00Z', lat: -15.8, lon: 63.2, windKt: 60, pressureHpa: 985, nature: 'TS', speedKt: 4, dirDeg: 260 },
  { time: '2022-01-31T18:00:00Z', lat: -16.0, lon: 62.9, windKt: 60, pressureHpa: 983, nature: 'TS', speedKt: 5, dirDeg: 230 },
  { time: '2022-02-01T00:00:00Z', lat: -16.4, lon: 62.3, windKt: 65, pressureHpa: 978, nature: 'TS', speedKt: 10, dirDeg: 245 },
  { time: '2022-02-01T06:00:00Z', lat: -16.8, lon: 61.1, windKt: 70, pressureHpa: 972, nature: 'TS', speedKt: 12, dirDeg: 250 },
  { time: '2022-02-01T12:00:00Z', lat: -17.2, lon: 60.1, windKt: 80, pressureHpa: 957, nature: 'TS', speedKt: 10, dirDeg: 250 },
  { time: '2022-02-01T18:00:00Z', lat: -17.5, lon: 59.1, windKt: 80, pressureHpa: 955, nature: 'TS', speedKt: 10, dirDeg: 240 },
  { time: '2022-02-02T00:00:00Z', lat: -18.1, lon: 58.3, windKt: 90, pressureHpa: 943, nature: 'TS', speedKt: 9, dirDeg: 230 },
  { time: '2022-02-02T06:00:00Z', lat: -18.6, lon: 57.6, windKt: 100, pressureHpa: 933, nature: 'TS', speedKt: 9, dirDeg: 245 },
  { time: '2022-02-02T12:00:00Z', lat: -18.8, lon: 56.7, windKt: 110, pressureHpa: 923, nature: 'TS', speedKt: 8, dirDeg: 260 },
  { time: '2022-02-02T18:00:00Z', lat: -18.9, lon: 56.1, windKt: 100, pressureHpa: 933, nature: 'TS', speedKt: 5, dirDeg: 260 },
  { time: '2022-02-03T00:00:00Z', lat: -19.0, lon: 55.7, windKt: 90, pressureHpa: 942, nature: 'TS', speedKt: 3, dirDeg: 260 },
  { time: '2022-02-03T06:00:00Z', lat: -19.1, lon: 55.4, windKt: 85, pressureHpa: 945, nature: 'TS', speedKt: 3, dirDeg: 250 },
  { time: '2022-02-03T12:00:00Z', lat: -19.2, lon: 55.0, windKt: 85, pressureHpa: 945, nature: 'TS', speedKt: 4, dirDeg: 250 },
  { time: '2022-02-03T18:00:00Z', lat: -19.3, lon: 54.5, windKt: 85, pressureHpa: 945, nature: 'TS', speedKt: 6, dirDeg: 270 },
  { time: '2022-02-04T00:00:00Z', lat: -19.3, lon: 53.8, windKt: 90, pressureHpa: 945, nature: 'TS', speedKt: 7, dirDeg: 270 },
  { time: '2022-02-04T06:00:00Z', lat: -19.3, lon: 53.1, windKt: 90, pressureHpa: 943, nature: 'TS', speedKt: 6, dirDeg: 265 },
  { time: '2022-02-04T12:00:00Z', lat: -19.4, lon: 52.5, windKt: 95, pressureHpa: 938, nature: 'TS', speedKt: 5, dirDeg: 260 },
  { time: '2022-02-04T18:00:00Z', lat: -19.6, lon: 52.0, windKt: 95, pressureHpa: 938, nature: 'TS', speedKt: 6, dirDeg: 250 },
  { time: '2022-02-05T00:00:00Z', lat: -19.8, lon: 51.3, windKt: 90, pressureHpa: 943, nature: 'TS', speedKt: 8, dirDeg: 245 },
  { time: '2022-02-05T06:00:00Z', lat: -20.3, lon: 50.5, windKt: 85, pressureHpa: 948, nature: 'TS', speedKt: 10, dirDeg: 240 },
  { time: '2022-02-05T12:00:00Z', lat: -20.8, lon: 49.4, windKt: 90, pressureHpa: 943, nature: 'TS', speedKt: 11, dirDeg: 250 },
  { time: '2022-02-05T18:00:00Z', lat: -21.0, lon: 48.3, windKt: 80, pressureHpa: 955, nature: 'TS', speedKt: 13, dirDeg: 255 },
  { time: '2022-02-06T00:00:00Z', lat: -21.4, lon: 46.7, windKt: 50, pressureHpa: 980, nature: 'TS', speedKt: 16, dirDeg: 245 },
  { time: '2022-02-06T06:00:00Z', lat: -22.2, lon: 45.2, windKt: 35, pressureHpa: 988, nature: 'TS', speedKt: 13, dirDeg: 235 },
  { time: '2022-02-06T12:00:00Z', lat: -22.8, lon: 44.3, windKt: 32, pressureHpa: 990, nature: 'TS', speedKt: 10, dirDeg: 245 },
  { time: '2022-02-06T18:00:00Z', lat: -23.0, lon: 43.1, windKt: 35, pressureHpa: 988, nature: 'MX', speedKt: 10, dirDeg: 265 },
  { time: '2022-02-07T00:00:00Z', lat: -23.1, lon: 42.3, windKt: 37, pressureHpa: 987, nature: 'MX', speedKt: 6, dirDeg: 240 },
  { time: '2022-02-07T06:00:00Z', lat: -23.7, lon: 42.0, windKt: 40, pressureHpa: 985, nature: 'MX', speedKt: 7, dirDeg: 190 },
  { time: '2022-02-07T12:00:00Z', lat: -24.4, lon: 41.9, windKt: 43, pressureHpa: 983, nature: 'MX', speedKt: 9, dirDeg: 190 },
  { time: '2022-02-07T18:00:00Z', lat: -25.3, lon: 41.6, windKt: 47, pressureHpa: 980, nature: 'MX', speedKt: 8, dirDeg: 195 },
  { time: '2022-02-08T00:00:00Z', lat: -26.0, lon: 41.4, windKt: 45, pressureHpa: 981, nature: 'MX', speedKt: 7, dirDeg: 175 },
  { time: '2022-02-08T06:00:00Z', lat: -26.8, lon: 41.7, windKt: 42, pressureHpa: 983, nature: 'MX', speedKt: 9, dirDeg: 165 },
  { time: '2022-02-08T12:00:00Z', lat: -27.9, lon: 41.9, windKt: 42, pressureHpa: 983, nature: 'MX', speedKt: 12, dirDeg: 170 },
  { time: '2022-02-08T18:00:00Z', lat: -29.2, lon: 42.1, windKt: 42, pressureHpa: 983, nature: 'MX', speedKt: 13, dirDeg: 170 },
  { time: '2022-02-09T00:00:00Z', lat: -30.5, lon: 42.4, windKt: 43, pressureHpa: 982, nature: 'MX', speedKt: 16, dirDeg: 165 },
  { time: '2022-02-09T06:00:00Z', lat: -32.4, lon: 42.9, windKt: 43, pressureHpa: 982, nature: 'MX', speedKt: 20, dirDeg: 170 },
  { time: '2022-02-09T12:00:00Z', lat: -34.3, lon: 43.1, windKt: 42, pressureHpa: 983, nature: 'MX', speedKt: 17, dirDeg: 175 },
  { time: '2022-02-09T18:00:00Z', lat: -35.8, lon: 43.5, windKt: 40, pressureHpa: 984, nature: 'ET', speedKt: 18, dirDeg: 150 },
  { time: '2022-02-10T00:00:00Z', lat: -37.2, lon: 45.4, windKt: 40, pressureHpa: 984, nature: 'ET', speedKt: 25, dirDeg: 120 },
  { time: '2022-02-10T06:00:00Z', lat: -38.4, lon: 48.7, windKt: 40, pressureHpa: 986, nature: 'ET', speedKt: 31, dirDeg: 110 },
  { time: '2022-02-10T12:00:00Z', lat: -39.5, lon: 52.4, windKt: 40, pressureHpa: 986, nature: 'ET', speedKt: 31, dirDeg: 110 },
]

