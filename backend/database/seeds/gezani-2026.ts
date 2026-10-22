// Données de trajectoire du cyclone GEZANI (février 2026) importées depuis IBTrACS.
//
// Source : NOAA/NCEI, International Best Track Archive for Climate Stewardship
// (IBTrACS) v04r01, identifiant de tempête 2026035S11065.
// Intensité retenue : WMO/RSMC La Réunion (Météo-France) ; à défaut JTWC (USA).
// Résolution : 1 point toutes les 3 h (00/03/06/09/12/15/18/21 UTC), de la
// formation (4 février 2026) à la dissipation (21 février 2026).
//
// Vitesse et direction de déplacement : IBTrACS v04r01 ne publie pas ces colonnes
// pour cette tempête. Elles sont DÉRIVÉES des points REUNION consécutifs
// (distance orthodromique / intervalle de 3 h pour la vitesse ; azimut du grand
// cercle pour la direction). Le premier point n'a pas de point précédent : ses
// deux valeurs restent `null`. Aucune autre valeur n'est estimée.
//
// Fichier régénéré automatiquement : ne pas éditer à la main.
//
// ATTENTION : ces coordonnées proviennent d'un best track officiel reconnu.
// Ne jamais les modifier manuellement ; régénérer depuis la source si besoin.

export interface GezaniTrackPoint {
  /** Horodatage UTC ISO-8601. */
  time: string;
  lat: number;
  lon: number;
  /** Vent soutenu maximal (nœuds, source WMO/RSMC La Réunion). */
  windKt: number | null;
  /** Pression minimale au centre (hPa). */
  pressureHpa: number | null;
  /** Nature du système (DS, TS, NR, ET...). */
  nature: string;
  /** Vitesse de déplacement dérivée (nœuds). */
  speedKt: number | null;
  /** Direction de déplacement dérivée (degrés). */
  dirDeg: number | null;
}

export const GEZANI_TRACK: GezaniTrackPoint[] = [
  { time: '2026-02-04T00:00:00Z', lat: -11.3, lon: 64.7, windKt: 20, pressureHpa: 1007, nature: 'DS', speedKt: null, dirDeg: null },
  { time: '2026-02-04T03:00:00Z', lat: -11.3, lon: 64.2, windKt: 20, pressureHpa: 1007, nature: 'DS', speedKt: 9.8, dirDeg: 270 },
  { time: '2026-02-04T06:00:00Z', lat: -11.4, lon: 63.8, windKt: 20, pressureHpa: 1007, nature: 'DS', speedKt: 8.1, dirDeg: 255.7 },
  { time: '2026-02-04T09:00:00Z', lat: -11.5, lon: 63.6, windKt: 23, pressureHpa: 1007, nature: 'DS', speedKt: 4.4, dirDeg: 243 },
  { time: '2026-02-04T12:00:00Z', lat: -11.7, lon: 63.5, windKt: 25, pressureHpa: 1006, nature: 'TS', speedKt: 4.5, dirDeg: 206.1 },
  { time: '2026-02-04T15:00:00Z', lat: -11.9, lon: 63.2, windKt: 28, pressureHpa: 1006, nature: 'TS', speedKt: 7.1, dirDeg: 235.7 },
  { time: '2026-02-04T18:00:00Z', lat: -12.2, lon: 62.9, windKt: 30, pressureHpa: 1006, nature: 'TS', speedKt: 8.4, dirDeg: 224.3 },
  { time: '2026-02-04T21:00:00Z', lat: -12.6, lon: 62.6, windKt: 30, pressureHpa: 1006, nature: 'TS', speedKt: 9.9, dirDeg: 216.2 },
  { time: '2026-02-05T00:00:00Z', lat: -13, lon: 62.3, windKt: 30, pressureHpa: 1006, nature: 'TS', speedKt: 9.9, dirDeg: 216.1 },
  { time: '2026-02-05T03:00:00Z', lat: -13.4, lon: 62.1, windKt: 30, pressureHpa: 1006, nature: 'TS', speedKt: 8.9, dirDeg: 205.9 },
  { time: '2026-02-05T06:00:00Z', lat: -13.7, lon: 62, windKt: 30, pressureHpa: 1006, nature: 'TS', speedKt: 6.3, dirDeg: 197.9 },
  { time: '2026-02-05T09:00:00Z', lat: -13.9, lon: 61.8, windKt: 28, pressureHpa: 1006, nature: 'TS', speedKt: 5.6, dirDeg: 224.1 },
  { time: '2026-02-05T12:00:00Z', lat: -14.1, lon: 61.6, windKt: 25, pressureHpa: 1006, nature: 'TS', speedKt: 5.6, dirDeg: 224.1 },
  { time: '2026-02-05T15:00:00Z', lat: -14.3, lon: 61.3, windKt: 25, pressureHpa: 1006, nature: 'TS', speedKt: 7.1, dirDeg: 235.4 },
  { time: '2026-02-05T18:00:00Z', lat: -14.5, lon: 61, windKt: 25, pressureHpa: 1006, nature: 'TS', speedKt: 7.1, dirDeg: 235.4 },
  { time: '2026-02-05T21:00:00Z', lat: -14.8, lon: 60.7, windKt: 28, pressureHpa: 1006, nature: 'TS', speedKt: 8.4, dirDeg: 224 },
  { time: '2026-02-06T00:00:00Z', lat: -15.2, lon: 60.4, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 9.9, dirDeg: 215.9 },
  { time: '2026-02-06T03:00:00Z', lat: -15.6, lon: 60.2, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 8.9, dirDeg: 205.7 },
  { time: '2026-02-06T06:00:00Z', lat: -16, lon: 60.1, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 8.2, dirDeg: 193.5 },
  { time: '2026-02-06T09:00:00Z', lat: -16.4, lon: 59.9, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 8.9, dirDeg: 205.6 },
  { time: '2026-02-06T12:00:00Z', lat: -16.7, lon: 59.7, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 7.1, dirDeg: 212.6 },
  { time: '2026-02-06T15:00:00Z', lat: -17.1, lon: 59.7, windKt: 28, pressureHpa: 1006, nature: 'TS', speedKt: 8, dirDeg: 180 },
  { time: '2026-02-06T18:00:00Z', lat: -17.4, lon: 59.7, windKt: 25, pressureHpa: 1007, nature: 'TS', speedKt: 6, dirDeg: 180 },
  { time: '2026-02-06T21:00:00Z', lat: -17.7, lon: 59.4, windKt: 25, pressureHpa: 1007, nature: 'TS', speedKt: 8.3, dirDeg: 223.6 },
  { time: '2026-02-07T00:00:00Z', lat: -18, lon: 58.9, windKt: 25, pressureHpa: 1007, nature: 'TS', speedKt: 11.3, dirDeg: 237.7 },
  { time: '2026-02-07T03:00:00Z', lat: -18.1, lon: 58.5, windKt: 25, pressureHpa: 1007, nature: 'TS', speedKt: 7.9, dirDeg: 255.2 },
  { time: '2026-02-07T06:00:00Z', lat: -18.2, lon: 58.2, windKt: 25, pressureHpa: 1007, nature: 'TS', speedKt: 6, dirDeg: 250.6 },
  { time: '2026-02-07T09:00:00Z', lat: -18.3, lon: 57.8, windKt: 28, pressureHpa: 1006, nature: 'TS', speedKt: 7.9, dirDeg: 255.2 },
  { time: '2026-02-07T12:00:00Z', lat: -18.3, lon: 57.4, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 7.6, dirDeg: 269.9 },
  { time: '2026-02-07T15:00:00Z', lat: -18.3, lon: 57.2, windKt: 35, pressureHpa: 1004, nature: 'TS', speedKt: 3.8, dirDeg: 270 },
  { time: '2026-02-07T18:00:00Z', lat: -18.2, lon: 57.1, windKt: 40, pressureHpa: 1003, nature: 'TS', speedKt: 2.8, dirDeg: 316.5 },
  { time: '2026-02-07T21:00:00Z', lat: -18.1, lon: 57, windKt: 38, pressureHpa: 1003, nature: 'TS', speedKt: 2.8, dirDeg: 316.4 },
  { time: '2026-02-08T00:00:00Z', lat: -18.1, lon: 56.9, windKt: 35, pressureHpa: 1003, nature: 'TS', speedKt: 1.9, dirDeg: 270 },
  { time: '2026-02-08T03:00:00Z', lat: -18, lon: 56.9, windKt: 33, pressureHpa: 1004, nature: 'TS', speedKt: 2, dirDeg: 0 },
  { time: '2026-02-08T06:00:00Z', lat: -18, lon: 56.8, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 1.9, dirDeg: 270 },
  { time: '2026-02-08T09:00:00Z', lat: -18.1, lon: 56.7, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 2.8, dirDeg: 223.5 },
  { time: '2026-02-08T12:00:00Z', lat: -18.1, lon: 56.5, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 3.8, dirDeg: 270 },
  { time: '2026-02-08T15:00:00Z', lat: -18, lon: 56.3, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 4.3, dirDeg: 297.7 },
  { time: '2026-02-08T18:00:00Z', lat: -17.9, lon: 56.1, windKt: 30, pressureHpa: 1005, nature: 'TS', speedKt: 4.3, dirDeg: 297.7 },
  { time: '2026-02-08T21:00:00Z', lat: -17.9, lon: 55.8, windKt: 33, pressureHpa: 1004, nature: 'TS', speedKt: 5.7, dirDeg: 270 },
  { time: '2026-02-09T00:00:00Z', lat: -17.9, lon: 55.5, windKt: 35, pressureHpa: 1002, nature: 'TS', speedKt: 5.7, dirDeg: 270 },
  { time: '2026-02-09T03:00:00Z', lat: -17.9, lon: 55.1, windKt: 38, pressureHpa: 1000, nature: 'TS', speedKt: 7.6, dirDeg: 269.9 },
  { time: '2026-02-09T06:00:00Z', lat: -18, lon: 54.7, windKt: 40, pressureHpa: 998, nature: 'TS', speedKt: 7.9, dirDeg: 255.2 },
  { time: '2026-02-09T09:00:00Z', lat: -18.1, lon: 54.3, windKt: 48, pressureHpa: 993, nature: 'TS', speedKt: 7.9, dirDeg: 255.2 },
  { time: '2026-02-09T12:00:00Z', lat: -18.1, lon: 53.9, windKt: 55, pressureHpa: 988, nature: 'TS', speedKt: 7.6, dirDeg: 269.9 },
  { time: '2026-02-09T15:00:00Z', lat: -18.1, lon: 53.4, windKt: 60, pressureHpa: 984, nature: 'TS', speedKt: 9.5, dirDeg: 269.9 },
  { time: '2026-02-09T18:00:00Z', lat: -18.1, lon: 52.9, windKt: 65, pressureHpa: 980, nature: 'TS', speedKt: 9.5, dirDeg: 269.9 },
  { time: '2026-02-09T21:00:00Z', lat: -18.1, lon: 52.4, windKt: 73, pressureHpa: 976, nature: 'TS', speedKt: 9.5, dirDeg: 269.9 },
  { time: '2026-02-10T00:00:00Z', lat: -18.1, lon: 52, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 7.6, dirDeg: 269.9 },
  { time: '2026-02-10T03:00:00Z', lat: -18.1, lon: 51.5, windKt: 83, pressureHpa: 971, nature: 'TS', speedKt: 9.5, dirDeg: 269.9 },
  { time: '2026-02-10T06:00:00Z', lat: -18.1, lon: 51.1, windKt: 85, pressureHpa: 969, nature: 'TS', speedKt: 7.6, dirDeg: 269.9 },
  { time: '2026-02-10T09:00:00Z', lat: -18.2, lon: 50.7, windKt: 95, pressureHpa: 961, nature: 'TS', speedKt: 7.9, dirDeg: 255.2 },
  { time: '2026-02-10T12:00:00Z', lat: -18.2, lon: 50.2, windKt: 105, pressureHpa: 952, nature: 'TS', speedKt: 9.5, dirDeg: 269.9 },
  { time: '2026-02-10T15:00:00Z', lat: -18.1, lon: 49.7, windKt: 100, pressureHpa: 955, nature: 'TS', speedKt: 9.7, dirDeg: 281.8 },
  { time: '2026-02-10T18:00:00Z', lat: -18, lon: 49.2, windKt: 95, pressureHpa: 957, nature: 'TS', speedKt: 9.7, dirDeg: 281.8 },
  { time: '2026-02-10T21:00:00Z', lat: -18, lon: 48.5, windKt: 75, pressureHpa: 975, nature: 'TS', speedKt: 13.3, dirDeg: 269.9 },
  { time: '2026-02-11T00:00:00Z', lat: -18, lon: 47.7, windKt: 55, pressureHpa: 992, nature: 'TS', speedKt: 15.2, dirDeg: 269.9 },
  { time: '2026-02-11T03:00:00Z', lat: -18, lon: 46.8, windKt: 40, pressureHpa: 999, nature: 'TS', speedKt: 17.1, dirDeg: 269.9 },
  { time: '2026-02-11T06:00:00Z', lat: -18.1, lon: 46, windKt: 25, pressureHpa: 1005, nature: 'NR', speedKt: 15.4, dirDeg: 262.4 },
  { time: '2026-02-11T09:00:00Z', lat: -18.3, lon: 45.3, windKt: 28, pressureHpa: 1004, nature: 'NR', speedKt: 13.9, dirDeg: 253.2 },
  { time: '2026-02-11T12:00:00Z', lat: -18.6, lon: 44.6, windKt: 30, pressureHpa: 1003, nature: 'TS', speedKt: 14.6, dirDeg: 245.6 },
  { time: '2026-02-11T15:00:00Z', lat: -18.8, lon: 44, windKt: 33, pressureHpa: 1002, nature: 'TS', speedKt: 12.1, dirDeg: 250.5 },
  { time: '2026-02-11T18:00:00Z', lat: -19, lon: 43.4, windKt: 35, pressureHpa: 1000, nature: 'TS', speedKt: 12, dirDeg: 250.5 },
  { time: '2026-02-11T21:00:00Z', lat: -19.4, lon: 42.7, windKt: 43, pressureHpa: 997, nature: 'TS', speedKt: 15.5, dirDeg: 238.7 },
  { time: '2026-02-12T00:00:00Z', lat: -19.7, lon: 42, windKt: 50, pressureHpa: 994, nature: 'TS', speedKt: 14.5, dirDeg: 245.4 },
  { time: '2026-02-12T03:00:00Z', lat: -19.8, lon: 41.4, windKt: 55, pressureHpa: 991, nature: 'TS', speedKt: 11.5, dirDeg: 259.9 },
  { time: '2026-02-12T06:00:00Z', lat: -19.9, lon: 40.9, windKt: 60, pressureHpa: 987, nature: 'TS', speedKt: 9.6, dirDeg: 257.9 },
  { time: '2026-02-12T09:00:00Z', lat: -20.1, lon: 40.4, windKt: 68, pressureHpa: 981, nature: 'TS', speedKt: 10.2, dirDeg: 246.9 },
  { time: '2026-02-12T12:00:00Z', lat: -20.3, lon: 40, windKt: 75, pressureHpa: 975, nature: 'TS', speedKt: 8.5, dirDeg: 241.9 },
  { time: '2026-02-12T15:00:00Z', lat: -20.5, lon: 39.5, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 10.2, dirDeg: 246.8 },
  { time: '2026-02-12T18:00:00Z', lat: -20.8, lon: 39, windKt: 85, pressureHpa: 968, nature: 'TS', speedKt: 11.1, dirDeg: 237.2 },
  { time: '2026-02-12T21:00:00Z', lat: -21, lon: 38.4, windKt: 85, pressureHpa: 968, nature: 'TS', speedKt: 11.9, dirDeg: 250.3 },
  { time: '2026-02-13T00:00:00Z', lat: -21.3, lon: 37.9, windKt: 85, pressureHpa: 968, nature: 'TS', speedKt: 11.1, dirDeg: 237.2 },
  { time: '2026-02-13T03:00:00Z', lat: -21.5, lon: 37.4, windKt: 83, pressureHpa: 970, nature: 'TS', speedKt: 10.1, dirDeg: 246.7 },
  { time: '2026-02-13T06:00:00Z', lat: -21.8, lon: 36.9, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 11.1, dirDeg: 237.1 },
  { time: '2026-02-13T09:00:00Z', lat: -22.1, lon: 36.5, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 9.5, dirDeg: 231 },
  { time: '2026-02-13T12:00:00Z', lat: -22.5, lon: 36.3, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 8.8, dirDeg: 204.8 },
  { time: '2026-02-13T15:00:00Z', lat: -22.8, lon: 36.2, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 6.3, dirDeg: 197.1 },
  { time: '2026-02-13T18:00:00Z', lat: -23.2, lon: 36.1, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 8.2, dirDeg: 192.9 },
  { time: '2026-02-13T21:00:00Z', lat: -23.6, lon: 35.9, windKt: 83, pressureHpa: 970, nature: 'TS', speedKt: 8.8, dirDeg: 204.6 },
  { time: '2026-02-14T00:00:00Z', lat: -24, lon: 35.7, windKt: 85, pressureHpa: 967, nature: 'TS', speedKt: 8.8, dirDeg: 204.5 },
  { time: '2026-02-14T03:00:00Z', lat: -24.4, lon: 35.7, windKt: 85, pressureHpa: 967, nature: 'TS', speedKt: 8, dirDeg: 180 },
  { time: '2026-02-14T06:00:00Z', lat: -24.9, lon: 35.9, windKt: 85, pressureHpa: 967, nature: 'TS', speedKt: 10.6, dirDeg: 160.1 },
  { time: '2026-02-14T09:00:00Z', lat: -25.4, lon: 36.1, windKt: 83, pressureHpa: 970, nature: 'TS', speedKt: 10.6, dirDeg: 160.1 },
  { time: '2026-02-14T12:00:00Z', lat: -25.9, lon: 36.5, windKt: 80, pressureHpa: 972, nature: 'TS', speedKt: 12.3, dirDeg: 144.3 },
  { time: '2026-02-14T15:00:00Z', lat: -26.2, lon: 37, windKt: 75, pressureHpa: 975, nature: 'TS', speedKt: 10.8, dirDeg: 123.8 },
  { time: '2026-02-14T18:00:00Z', lat: -26.4, lon: 37.5, windKt: 70, pressureHpa: 978, nature: 'TS', speedKt: 9.8, dirDeg: 114.2 },
  { time: '2026-02-14T21:00:00Z', lat: -26.6, lon: 37.9, windKt: 70, pressureHpa: 978, nature: 'TS', speedKt: 8.2, dirDeg: 119.3 },
  { time: '2026-02-15T00:00:00Z', lat: -26.7, lon: 38.2, windKt: 70, pressureHpa: 978, nature: 'TS', speedKt: 5.7, dirDeg: 110.5 },
  { time: '2026-02-15T03:00:00Z', lat: -26.7, lon: 38.7, windKt: 70, pressureHpa: 979, nature: 'TS', speedKt: 8.9, dirDeg: 90.1 },
  { time: '2026-02-15T06:00:00Z', lat: -26.6, lon: 39.2, windKt: 70, pressureHpa: 980, nature: 'TS', speedKt: 9.2, dirDeg: 77.5 },
  { time: '2026-02-15T09:00:00Z', lat: -26.6, lon: 39.7, windKt: 73, pressureHpa: 979, nature: 'TS', speedKt: 8.9, dirDeg: 90.1 },
  { time: '2026-02-15T12:00:00Z', lat: -26.5, lon: 40.1, windKt: 75, pressureHpa: 977, nature: 'TS', speedKt: 7.4, dirDeg: 74.5 },
  { time: '2026-02-15T15:00:00Z', lat: -26.3, lon: 40.5, windKt: 73, pressureHpa: 978, nature: 'TS', speedKt: 8.2, dirDeg: 60.9 },
  { time: '2026-02-15T18:00:00Z', lat: -26, lon: 40.9, windKt: 70, pressureHpa: 979, nature: 'TS', speedKt: 9.4, dirDeg: 50.2 },
  { time: '2026-02-15T21:00:00Z', lat: -25.6, lon: 41, windKt: 63, pressureHpa: 984, nature: 'TS', speedKt: 8.2, dirDeg: 12.7 },
  { time: '2026-02-16T00:00:00Z', lat: -25.2, lon: 41.2, windKt: 55, pressureHpa: 988, nature: 'TS', speedKt: 8.8, dirDeg: 24.4 },
  { time: '2026-02-16T03:00:00Z', lat: -25, lon: 41.6, windKt: 50, pressureHpa: 990, nature: 'TS', speedKt: 8.3, dirDeg: 61.2 },
  { time: '2026-02-16T06:00:00Z', lat: -24.9, lon: 42, windKt: 45, pressureHpa: 992, nature: 'TS', speedKt: 7.5, dirDeg: 74.7 },
  { time: '2026-02-16T09:00:00Z', lat: -24.7, lon: 42.3, windKt: 48, pressureHpa: 991, nature: 'TS', speedKt: 6.8, dirDeg: 53.8 },
  { time: '2026-02-16T12:00:00Z', lat: -24.6, lon: 42.7, windKt: 50, pressureHpa: 990, nature: 'TS', speedKt: 7.5, dirDeg: 74.7 },
  { time: '2026-02-16T15:00:00Z', lat: -24.8, lon: 43.3, windKt: 55, pressureHpa: 987, nature: 'TS', speedKt: 11.6, dirDeg: 110.3 },
  { time: '2026-02-16T18:00:00Z', lat: -25.3, lon: 43.8, windKt: 60, pressureHpa: 983, nature: 'TS', speedKt: 13.5, dirDeg: 137.9 },
  { time: '2026-02-16T21:00:00Z', lat: -26.1, lon: 44.2, windKt: 58, pressureHpa: 985, nature: 'TS', speedKt: 17.6, dirDeg: 155.8 },
  { time: '2026-02-17T00:00:00Z', lat: -27.1, lon: 44.4, windKt: 55, pressureHpa: 986, nature: 'TS', speedKt: 20.3, dirDeg: 169.9 },
  { time: '2026-02-17T03:00:00Z', lat: -28, lon: 44.2, windKt: 55, pressureHpa: 986, nature: 'TS', speedKt: 18.4, dirDeg: 191.1 },
  { time: '2026-02-17T06:00:00Z', lat: -28.9, lon: 43.7, windKt: 55, pressureHpa: 986, nature: 'TS', speedKt: 20, dirDeg: 205.9 },
  { time: '2026-02-17T09:00:00Z', lat: -29.6, lon: 43.1, windKt: 55, pressureHpa: 987, nature: 'TS', speedKt: 17.5, dirDeg: 216.6 },
  { time: '2026-02-17T12:00:00Z', lat: -30.2, lon: 42.5, windKt: 55, pressureHpa: 987, nature: 'TS', speedKt: 15.9, dirDeg: 220.8 },
  { time: '2026-02-17T15:00:00Z', lat: -30.8, lon: 42.2, windKt: 55, pressureHpa: 988, nature: 'TS', speedKt: 13.1, dirDeg: 203.2 },
  { time: '2026-02-17T18:00:00Z', lat: -31.5, lon: 42, windKt: 55, pressureHpa: 989, nature: 'TS', speedKt: 14.4, dirDeg: 193.7 },
  { time: '2026-02-17T21:00:00Z', lat: -32.3, lon: 41.8, windKt: 53, pressureHpa: 990, nature: 'TS', speedKt: 16.4, dirDeg: 191.9 },
  { time: '2026-02-18T00:00:00Z', lat: -33, lon: 41.6, windKt: 50, pressureHpa: 990, nature: 'ET', speedKt: 14.4, dirDeg: 193.5 },
  { time: '2026-02-18T03:00:00Z', lat: -33.6, lon: 41.2, windKt: 48, pressureHpa: 991, nature: 'ET', speedKt: 13.7, dirDeg: 209 },
  { time: '2026-02-18T06:00:00Z', lat: -34.2, lon: 41, windKt: 45, pressureHpa: 992, nature: 'ET', speedKt: 12.5, dirDeg: 195.4 },
  { time: '2026-02-18T09:00:00Z', lat: -34.9, lon: 41.1, windKt: 43, pressureHpa: 992, nature: 'ET', speedKt: 14.1, dirDeg: 173.3 },
  { time: '2026-02-18T12:00:00Z', lat: -35.7, lon: 41.3, windKt: 40, pressureHpa: 992, nature: 'ET', speedKt: 16.3, dirDeg: 168.5 },
  { time: '2026-02-18T15:00:00Z', lat: -36.3, lon: 41.6, windKt: 38, pressureHpa: 992, nature: 'ET', speedKt: 13, dirDeg: 158.1 },
  { time: '2026-02-18T18:00:00Z', lat: -36.9, lon: 41.9, windKt: 35, pressureHpa: 992, nature: 'ET', speedKt: 12.9, dirDeg: 158.2 },
  { time: '2026-02-18T21:00:00Z', lat: -37.5, lon: 42.3, windKt: 35, pressureHpa: 991, nature: 'ET', speedKt: 13.6, dirDeg: 152.2 },
  { time: '2026-02-19T00:00:00Z', lat: -38.2, lon: 42.8, windKt: 35, pressureHpa: 990, nature: 'ET', speedKt: 16.1, dirDeg: 150.7 },
  { time: '2026-02-19T03:00:00Z', lat: -39, lon: 43.4, windKt: 38, pressureHpa: 989, nature: 'ET', speedKt: 18.6, dirDeg: 149.8 },
  { time: '2026-02-19T06:00:00Z', lat: -39.8, lon: 44.2, windKt: 40, pressureHpa: 987, nature: 'ET', speedKt: 20.2, dirDeg: 142.6 },
  { time: '2026-02-19T09:00:00Z', lat: -40.7, lon: 45.2, windKt: 40, pressureHpa: 987, nature: 'ET', speedKt: 23.6, dirDeg: 140 },
  { time: '2026-02-19T12:00:00Z', lat: -41.6, lon: 46.4, windKt: 40, pressureHpa: 986, nature: 'ET', speedKt: 25.5, dirDeg: 135.3 },
  { time: '2026-02-19T15:00:00Z', lat: -42.5, lon: 47.6, windKt: 40, pressureHpa: 986, nature: 'ET', speedKt: 25.3, dirDeg: 135.7 },
  { time: '2026-02-19T18:00:00Z', lat: -43.4, lon: 49.1, windKt: 40, pressureHpa: 986, nature: 'ET', speedKt: 28.4, dirDeg: 129.9 },
  { time: '2026-02-19T21:00:00Z', lat: -44.4, lon: 50.9, windKt: 43, pressureHpa: 985, nature: 'ET', speedKt: 32.8, dirDeg: 128.3 },
  { time: '2026-02-20T00:00:00Z', lat: -45.5, lon: 53.1, windKt: 45, pressureHpa: 983, nature: 'ET', speedKt: 38.2, dirDeg: 126 },
  { time: '2026-02-20T03:00:00Z', lat: -46.7, lon: 55.6, windKt: 50, pressureHpa: 981, nature: 'ET', speedKt: 42.2, dirDeg: 125.6 },
  { time: '2026-02-20T06:00:00Z', lat: -47.8, lon: 58.4, windKt: 55, pressureHpa: 978, nature: 'ET', speedKt: 43.9, dirDeg: 121.1 },
  { time: '2026-02-20T09:00:00Z', lat: -48.7, lon: 61.3, windKt: 58, pressureHpa: 976, nature: 'ET', speedKt: 42.6, dirDeg: 116.1 },
  { time: '2026-02-20T12:00:00Z', lat: -49.4, lon: 64.1, windKt: 60, pressureHpa: 974, nature: 'ET', speedKt: 39.3, dirDeg: 111.9 },
  { time: '2026-02-20T15:00:00Z', lat: -50, lon: 66.8, windKt: 63, pressureHpa: 973, nature: 'ET', speedKt: 37, dirDeg: 110 },
  { time: '2026-02-20T18:00:00Z', lat: -50.5, lon: 69.4, windKt: 65, pressureHpa: 972, nature: 'ET', speedKt: 34.7, dirDeg: 107.7 },
  { time: '2026-02-20T21:00:00Z', lat: -51.1, lon: 71.9, windKt: 65, pressureHpa: 970, nature: 'ET', speedKt: 33.8, dirDeg: 111.8 },
  { time: '2026-02-21T00:00:00Z', lat: -51.6, lon: 74.6, windKt: 65, pressureHpa: 968, nature: 'ET', speedKt: 35.2, dirDeg: 107.6 },
  { time: '2026-02-21T03:00:00Z', lat: -52, lon: 77.8, windKt: 63, pressureHpa: 969, nature: 'ET', speedKt: 40.4, dirDeg: 102.7 },
  { time: '2026-02-21T06:00:00Z', lat: -52.2, lon: 81.2, windKt: 60, pressureHpa: 970, nature: 'ET', speedKt: 42, dirDeg: 96.8 },
  { time: '2026-02-21T09:00:00Z', lat: -52.3, lon: 84.5, windKt: 58, pressureHpa: 971, nature: 'ET', speedKt: 40.5, dirDeg: 94.1 },
  { time: '2026-02-21T12:00:00Z', lat: -52.3, lon: 87.8, windKt: 55, pressureHpa: 972, nature: 'ET', speedKt: 40.4, dirDeg: 91.3 },
  { time: '2026-02-21T15:00:00Z', lat: -52.2, lon: 91, windKt: 53, pressureHpa: 973, nature: 'ET', speedKt: 39.3, dirDeg: 88.3 },
  { time: '2026-02-21T18:00:00Z', lat: -52.1, lon: 94.1, windKt: 50, pressureHpa: 973, nature: 'ET', speedKt: 38.1, dirDeg: 88.2 },
];

/**
 * Correspondance région administrative -> districts présents en base.
 *
 * Sources : bulletins cycloniques officiels de la DGM (Météo Madagascar) pour la
 * liste des régions et districts cités ; découpage administratif malgache —
 * « Districts of Madagascar » (Wikipédia, 114 districts) — pour le contenu de
 * chaque région, projeté sur les 119 districts de la table `districts`.
 *
 * Les noms de districts sont ceux de la base (noms historiques conservés) :
 *   Fenerive Est = Fenoarivo-Atsinanana ;
 *   Sainte Marie = Nosy Boraha ;
 *   Befandriana Nord = Befandriana Avaratra ;
 *   Antanambao Manampontsy = Antanambao-Manampotsy ;
 *   Ampanihy Ouest = Ampanihy ;
 *   Brickaville = Vohibinany ;
 *   Fenoarivobe = Fenoarivo-Afovoany ;
 *   Belo Sur Tsiribihina = Belon'i Tsiribihina ;
 *   Port-Berge (Boriziny-Vaovao) = Boriziny-Vaovao ;
 *   Nosy-Varika = Nosy Varika ;
 *   Antananarivo-Renivohitra = 1er à 6e Arrondissement (6 districts en base).
 *
 * Les 119 districts de la base sont couverts exactement une fois.
 */
export const GEZANI_REGION_DISTRICTS: Record<string, string[]> = {
  AMBATOSOA: ['Mananara-Avaratra', 'Maroantsetra'],
  ANALANJIROFO: ['Fenerive Est', 'Sainte Marie', 'Soanierana Ivongo', 'Vavatenina'],
  ATSINANANA: [
    'Antanambao Manampontsy',
    'Mahanoro',
    'Marolambo',
    'Toamasina I',
    'Toamasina II',
    'Vatomandry',
    'Brickaville',
  ],
  'ALAOTRA MANGORO': ['Ambatondrazaka', 'Amparafaravola', 'Andilamena', "Anosibe-An'ala", 'Moramanga'],
  ANALAMANGA: [
    'Ambohidratrimo',
    'Andramasina',
    'Anjozorobe',
    'Ankazobe',
    'Antananarivo Atsimondrano',
    'Antananarivo Avaradrano',
    '1er Arrondissement',
    '2e Arrondissement',
    '3e Arrondissement',
    '4e Arrondissement',
    '5e Arrondissement',
    '6e Arrondissement',
    'Manjakandriana',
  ],
  BETSIBOKA: ['Kandreho', 'Maevatanana', 'Tsaratanana'],
  BONGOLAVA: ['Fenoarivobe', 'Tsiroanomandidy'],
  ITASY: ['Arivonimamo', 'Miarinarivo', 'Soavinandriana'],
  VAKINANKARATRA: [
    'Ambatolampy',
    'Antanifotsy',
    'Antsirabe I',
    'Antsirabe II',
    'Betafo',
    'Faratsiho',
    'Mandoto',
  ],
  MELAKY: ['Ambatomainty', 'Antsalova', 'Besalampy', 'Maintirano', 'Morafenobe'],
  MENABE: ['Belo Sur Tsiribihina', 'Mahabo', 'Manja', 'Miandrivazo', 'Morondava'],
};
