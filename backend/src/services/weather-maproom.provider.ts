import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository, WeatherInsertData } from '../repositories/weather.repository';
import { WeatherDgmIngestResult } from '../types/weather.types';
import { AppError } from '../utils/app-error';

// Dataset IRI Data Library — pluie décadaire (≈10 jours) DGM, grille 0.0375° (~4 km).
// Source officielle : https://map.meteomadagascar.mg (maproom de la Direction Générale de la Météo).
const DATASET_PATH = '/SOURCES/.Madagascar_v4/.MON/.dekadal/.rainfall/.rfe';

export interface GridSample {
  longitude: number;
  latitude: number;
  valueMm: number;
}

/** Index spatial : clé de cellule (pas de 0.01°) -> points de grille contenus. */
export type GridIndex = Map<string, GridSample[]>;

const KM_PER_DEG = 111.32;
const BUCKET_STEP = 0.01;

function bucketKey(lon: number, lat: number): string {
  return `${lon.toFixed(2)},${lat.toFixed(2)}`;
}

function isNumericToken(token: string): boolean {
  return token !== '' && !Number.isNaN(Number(token));
}

function monthNumber(value: string): number | null {
  const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    fev: 2,
    mar: 3,
    apr: 4,
    avr: 4,
    may: 5,
    mai: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    aou: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const key = value.toLowerCase().replace('é', 'e').replace('û', 'u').slice(0, 3);
  return MONTHS[key] ?? null;
}

function decodeCell(cell: string): string {
  return cell
    .trim()
    .replace(/\s+/, ' ')
    .replace(/^"(.*)"$/, '$1')
    .replace(/^\uFEFF/, '');
}

/** Extrait les points (lon, lat, valeur) d'un CSV de grille renvoyé par l'IRI Data Library. */
export function parseIridlCsv(text: string): { points: GridSample[]; timeLabel: string | null } {
  const lines = text.split(/\r?\n/);
  const points: GridSample[] = [];
  let timeLabel: string | null = null;
  const rangeRe = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zéû]+)\s+(\d{4})/i;
  const singleRe = /(\d{1,2})\s+([A-Za-zéû]+)\s+(\d{4})/i;

  const tryAdd = (delimiter: RegExp): boolean => {
    let added = 0;
    for (const raw of lines) {
      const line = raw.replace(/^\uFEFF/, '');
      const cols = line
        .split(delimiter)
        .map(decodeCell)
        .filter((cell) => cell !== '');
      if (
        cols.length >= 3 &&
        isNumericToken(cols[0]) &&
        isNumericToken(cols[1]) &&
        isNumericToken(cols[2])
      ) {
        const lon = Number(cols[0]);
        const lat = Number(cols[1]);
        const value = Number(cols[2]);
        if (lon >= 41 && lon <= 53 && lat >= -27 && lat <= -11 && Number.isFinite(value)) {
          points.push({ longitude: lon, latitude: lat, valueMm: value });
          added += 1;
        }
      }
    }
    return added >= 1;
  };

  if (!tryAdd(/,/)) {
    points.length = 0;
    tryAdd(/\s+/);
  }

  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '');
    const match = line.match(rangeRe) ?? line.match(singleRe);
    if (match) timeLabel = match[0];
  }

  return { points, timeLabel };
}

/**
 * Décalage de Madagascar (UTC+3, sans heure d'été).
 *
 * Une décade se termine à 23:59:59 heure LOCALE, soit 20:59:59 UTC. Utiliser
 * `Date.UTC(..., 23, 59, 59)` datait la valeur trois heures trop tard : la DGM
 * apparaissait plus fraîche qu'elle ne l'est (21/10 02:59 heure locale pour une
 * décade close le 20/10) et pouvait même dépasser l'heure courante.
 */
const MADAGASCAR_OFFSET_MS = 3 * 60 * 60 * 1000;

const MONTH_LABELS_FR = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

/** Fin de journée LOCALE (Madagascar) convertie en instant UTC. */
function localEndOfDayUtc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59) - MADAGASCAR_OFFSET_MS);
}

/** Convertit un label de décade (« 16-25 Fév 2026 » ou « 26 Fév 2026 ») en fin de décade LOCALE. */
export function parseDekadEndDate(label: string | null): Date | null {
  if (!label) return null;
  const range = label.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zéû]+)\s+(\d{4})/i);
  const single = label.match(/(\d{1,2})\s+([A-Za-zéû]+)\s+(\d{4})/i);
  const target = range ?? single;
  if (!target) return null;

  const day = Number(range ? target[2] : target[1]);
  const month = monthNumber(range ? target[3] : target[2]);
  const year = Number(range ? target[4] : target[3]);

  if (!month || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return localEndOfDayUtc(year, month - 1, day);
}

/**
 * Fin de la dernière décade ACHEVÉE à la date de référence.
 *
 * Repli utilisé quand l'en-tête IRI ne fournit pas de libellé de décade
 * exploitable. Horodater l'ingestion avec `new Date()` était le pire choix :
 * la valeur changeait à chaque redémarrage, ce qui réinscrivait les 1579
 * communes à chaque `tsx watch` (6304 lignes pour 1579 communes dans la base)
 * et faisait passer la DGM pour la source la plus fraîche alors qu'elle publie
 * une donnée décennale.
 *
 * Les décades malgaches sont 1-10, 11-20 puis 21-fin du mois. Une décade n'est
 * publiée qu'une fois ACHEVÉE : le 11 on ne connaît que la décade 1-10, le 21
 * que la 11-20. Rendre la fin de la décade en cours datait la valeur jusqu'à
 * 9 jours dans le futur (onze jours pour une fin de mois).
 *
 * Les composantes de date sont lues en heure LOCALE (Madagascar) : à 01:00
 * locale le 11, `getUTCDate()` renvoie encore le 10 et choisirait la mauvaise
 * décade.
 */
export function lastCompletedDekadEnd(reference: Date): Date {
  const local = new Date(reference.getTime() + MADAGASCAR_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  if (day <= 10) {
    // Décade 21..fin du mois précédent.
    const lastDayOfPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return localEndOfDayUtc(year, month - 1, lastDayOfPrevMonth);
  }
  if (day <= 20) {
    // Décade 1-10, achevée le 10.
    return localEndOfDayUtc(year, month, 10);
  }
  // Décade 11-20, achevée le 20.
  return localEndOfDayUtc(year, month, 20);
}

/**
 * Libellé de la décade dont `end` marque la fin (ex. « 11-20 Oct 2026 »).
 *
 * Le flux IRI ne renvoie pas toujours de libellé de période ; dériver celui-ci
 * de la date d'observation permet d'afficher « cumul du 11 au 20 octobre »
 * plutôt qu'un simple horodatage, sans jamais confondre ce cumul avec une pluie
 * horaire.
 */
export function dekadLabelFromEnd(end: Date): string {
  const local = new Date(end.getTime() + MADAGASCAR_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startDay = day <= 10 ? 1 : day <= 20 ? 11 : 21;
  const endDay = day <= 10 ? 10 : day <= 20 ? 20 : lastDayOfMonth;
  return `${startDay}-${endDay} ${MONTH_LABELS_FR[month]} ${year}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Construit l'index spatial de la grille. À appeler UNE SEULE FOIS par jeu de points :
 * le reconstruire pour chaque commune coûte O(communes × points) et bloque l'event loop.
 */
export function buildGridIndex(points: GridSample[]): GridIndex {
  const buckets: GridIndex = new Map();
  for (const p of points) {
    const key = bucketKey(p.longitude, p.latitude);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  return buckets;
}

/**
 * Échantillonne la valeur du point de grille le plus proche du centroïde de la commune,
 * dans un rayon maximal donné (en degrés). Retourne null si aucun point dans le rayon.
 *
 * @param buckets Index produit par {@link buildGridIndex} (réutilisable d'une commune à l'autre).
 */
export function sampleNearestFromIndex(
  buckets: GridIndex,
  longitude: number,
  latitude: number,
  maxDistanceDeg: number,
): number | null {
  const kMax = Math.max(1, Math.ceil(maxDistanceDeg / BUCKET_STEP));
  const maxDistanceKm = maxDistanceDeg * KM_PER_DEG;
  const baseLon = Math.round(longitude / BUCKET_STEP) * BUCKET_STEP;
  const baseLat = Math.round(latitude / BUCKET_STEP) * BUCKET_STEP;

  let best: GridSample | null = null;
  let bestKm = Infinity;

  for (let oy = -kMax; oy <= kMax; oy += 1) {
    for (let ox = -kMax; ox <= kMax; ox += 1) {
      const cell = buckets.get(bucketKey(baseLon + ox * BUCKET_STEP, baseLat + oy * BUCKET_STEP));
      if (!cell) continue;
      for (const candidate of cell) {
        const km = haversineKm(latitude, longitude, candidate.latitude, candidate.longitude);
        if (km < bestKm) {
          bestKm = km;
          best = candidate;
        }
      }
    }
  }

  return best && bestKm <= maxDistanceKm ? best.valueMm : null;
}

/** Variante pratique pour un usage ponctuel : construit l'index puis échantillonne. */
export function sampleNearest(
  points: GridSample[],
  longitude: number,
  latitude: number,
  maxDistanceDeg: number,
): number | null {
  return sampleNearestFromIndex(buildGridIndex(points), longitude, latitude, maxDistanceDeg);
}

export class DgmMaproomProvider {
  private readonly client = axios.create({
    baseURL: env.DGM_MAPROOM_BASE_URL,
    timeout: env.DGM_MAPROOM_TIMEOUT_MS,
    headers: { Accept: 'text/csv, text/plain, */*' },
  });

  async fetchLatestDekadText(): Promise<string> {
    const url = `${DATASET_PATH}/T/last/VALUES/gridtable.tsv`;
    logger.debug({ url }, 'Récupération de la dernière décade DGM (maproom)');
    const response = await this.client.get<string>(url, { responseType: 'text' });
    return response.data;
  }

  async ingestLatestDekad(): Promise<WeatherDgmIngestResult> {
    let text: string;
    try {
      text = await this.fetchLatestDekadText();
    } catch (err) {
      logger.warn(
        { err },
        'Échec de récupération des données DGM — ingestion annulée (source temporairement indisponible ?)',
      );
      throw new AppError('Source DGM (maproom) inaccessible', 502, true);
    }

    const { points, timeLabel } = parseIridlCsv(text);
    if (points.length < 100) {
      throw new AppError(
        `Grille de pluie DGM illisible (${points.length} points trouvés)`,
        502,
        true,
      );
    }

    const parsedObservation = parseDekadEndDate(timeLabel);
    // Garde-fou : `.T/last` peut exposer la décade EN COURS (le libellé couvre
    // toute la période alors que les valeurs s'accumulent encore). La dater
    // dans le futur ferait passer la DGM pour la source la plus fraîche et
    // contaminerait toute lecture de type « dernière observation ». On ne
    // retient donc que les décades réellement achevées.
    const now = new Date();
    const isCompleted = parsedObservation !== null && parsedObservation.getTime() <= now.getTime();
    const observedAt = isCompleted ? parsedObservation : lastCompletedDekadEnd(now);
    if (parsedObservation && !isCompleted) {
      logger.warn(
        { dekad: timeLabel, parsedObservedAt: parsedObservation.toISOString() },
        'Décade DGM datée dans le futur — repli sur la dernière décade achevée',
      );
    }
    // Le libellé doit désigner la décade réellement datée : conserver celui du
    // flux alors qu'on a replié sur la décade précédente afficherait une
    // période qui ne correspond pas à la valeur.
    const dekadLabel = isCompleted && timeLabel ? timeLabel : dekadLabelFromEnd(observedAt);
    const sourceId = await weatherRepository.getDgmSourceId();
    const existing = await weatherRepository.existingCommunesForDate(sourceId, observedAt);
    const targets = await weatherRepository.targetCommunes({});

    const rows: WeatherInsertData[] = [];
    let communesSampled = 0;
    let communesWithoutValue = 0;

    // Index spatial construit une seule fois, réutilisé pour chaque commune.
    const gridIndex = buildGridIndex(points);

    for (const target of targets) {
      if (existing.has(target.id)) continue;
      const value = sampleNearestFromIndex(
        gridIndex,
        target.longitude,
        target.latitude,
        env.DGM_MAPROOM_MAX_DISTANCE_DEG,
      );
      if (value === null) {
        communesWithoutValue += 1;
        continue;
      }
      rows.push({
        communeId: target.id,
        eventId: null,
        observedAt: observedAt.toISOString(),
        latitude: target.latitude,
        longitude: target.longitude,
        temperatureC: null,
        humidityPercent: null,
        precipitationMm: Number(value.toFixed(2)),
        rainfall24hMm: null,
        windSpeedKmh: null,
        windGustsKmh: null,
        windDirectionDeg: null,
        pressureHpa: null,
        weatherCode: null,
        rawData: { provider: 'dgm-maproom', dekad: dekadLabel },
      });
      communesSampled += 1;
    }

    const saved = rows.length > 0 ? await weatherRepository.insertObservations(rows, sourceId) : 0;

    logger.info(
      {
        dekad: dekadLabel,
        gridPoints: points.length,
        communesSampled,
        alreadyPresent: existing.size,
        communesWithoutValue,
        saved,
      },
      'Ingestion DGM (maproom) terminée',
    );

    return {
      dekadLabel,
      observedAt: observedAt.toISOString(),
      gridPoints: points.length,
      communesSampled,
      alreadyPresent: existing.size,
      communesWithoutValue,
      saved,
    };
  }
}

export const dgmMaproomProvider = new DgmMaproomProvider();
