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

/** Convertit un label de décade (« 16-25 Fév 2026 » ou « 26 Fév 2026 ») en fin de décade (23:59:59Z). */
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
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
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
 * Les décades malgaches sont 1-10, 11-20 puis 21-fin du mois ; la décade en
 * cours n'étant pas achevée avant son dernier jour, on retient 11-20 dès le 11.
 */
export function lastCompletedDekadEnd(reference: Date): Date {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();

  if (day <= 10) {
    // Décade 21..fin du mois précédent.
    const lastDayOfPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, lastDayOfPrevMonth, 23, 59, 59));
  }
  // Décade 11-20, que l'on soit en 11-20 ou au-delà.
  return new Date(Date.UTC(year, month, 20, 23, 59, 59));
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

    const observedAt = parseDekadEndDate(timeLabel) ?? lastCompletedDekadEnd(new Date());
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
        rawData: { provider: 'dgm-maproom', dekad: timeLabel ?? null },
      });
      communesSampled += 1;
    }

    const saved = rows.length > 0 ? await weatherRepository.insertObservations(rows, sourceId) : 0;

    logger.info(
      {
        dekad: timeLabel ?? null,
        gridPoints: points.length,
        communesSampled,
        alreadyPresent: existing.size,
        communesWithoutValue,
        saved,
      },
      'Ingestion DGM (maproom) terminée',
    );

    return {
      dekadLabel: timeLabel ?? '',
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
