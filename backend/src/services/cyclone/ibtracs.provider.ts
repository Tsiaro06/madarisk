import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/app-error';
import type {
  CycloneSystem,
  CycloneTrackPoint,
  CycloneTrackProvider,
  WatchBbox,
} from '../../types/cyclone.types';
import {
  KT_TO_KMH,
  NM_TO_KM,
  RADIUS_MEASURE_TYPE,
  radiusSourceForSid,
  systemIntersectsWatch,
} from './cyclone.logic';

const QUADRANTS = ['NE', 'SE', 'SW', 'NW'] as const;

/** Agence WMO de référence pour le bassin sud-ouest de l'océan Indien. */
const DEFAULT_AGENCY = 'REUNION';

/** Parse une ligne CSV en respectant les guillemets et les virgules échappées. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

export function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** IBTrACS publie les longitudes en 0-360 : la carte attend -180..180. */
export function normalizeLongitude(longitude: number): number {
  if (longitude > 180) return longitude - 360;
  if (longitude < -180) return longitude + 360;
  return longitude;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function knotsToKmh(knots: number | null): number | null {
  return knots === null ? null : round1(knots * KT_TO_KMH);
}

/** Premier nombre non nul parmi plusieurs colonnes candidates. */
function pickNumber(row: string[], indices: number[]): number | null {
  for (const index of indices) {
    if (index < 0) continue;
    const value = toNumber(row[index]);
    if (value !== null) return value;
  }
  return null;
}

/** Rayon maximal des 4 quadrants (nmi) converti en km, ou null si non publié. */
function maxQuadrantKm(
  row: string[],
  indexOf: (name: string) => number,
  agency: string,
  threshold: number,
): number | null {
  const values = QUADRANTS.map((quadrant) =>
    toNumber(row[indexOf(`${agency}_R${threshold}_${quadrant}`)]),
  ).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return round1(Math.max(...values) * NM_TO_KM);
}

/** Nombre de rayons documentés : sert à préférer la ligne la plus complète. */
function radiusScore(point: CycloneTrackPoint): number {
  return [point.radius34ktKm, point.radius50ktKm, point.radius64ktKm].filter(
    (value) => value !== null,
  ).length;
}

interface SystemAccumulator {
  name: string;
  season: number | null;
  basin: string | null;
  agency: string | null;
  atcfId: string | null;
  byTime: Map<string, CycloneTrackPoint>;
}

/**
 * Lit un CSV IBTrACS et reconstruit les systèmes, un par `SID`.
 *
 * Le fichier contient une ligne d'en-tête puis une ligne d'unités : toute ligne
 * dont le `SID` est vide ou dont l'`ISO_TIME` n'est pas une date est ignorée.
 * Les rayons R34/R50/R64 proviennent EXCLUSIVEMENT de l'agence demandée (RSMC
 * La Réunion par défaut) : on n'amorce aucune valeur avec une autre agence, pour
 * ne jamais mélanger deux échelles d'intensité. Un seuil non publié reste `null`,
 * jamais une estimation.
 */
export function parseIbtracsCsv(text: string, agency = DEFAULT_AGENCY): CycloneSystem[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0].replace(/^\uFEFF/, ''));
  const indexOf = (name: string) => header.indexOf(name);

  const sidIdx = indexOf('SID');
  const timeIdx = indexOf('ISO_TIME');
  const latIdx = indexOf('LAT');
  const lonIdx = indexOf('LON');
  if (sidIdx < 0 || timeIdx < 0 || latIdx < 0 || lonIdx < 0) {
    throw new AppError(
      'En-tête IBTrACS inattendu : colonnes SID / ISO_TIME / LAT / LON absentes.',
      502,
      true,
    );
  }

  const natureIdx = indexOf('NATURE');
  const trackTypeIdx = indexOf('TRACK_TYPE');
  const nameIdx = indexOf('NAME');
  const seasonIdx = indexOf('SEASON');
  const basinIdx = indexOf('BASIN');
  const agencyIdx = indexOf('WMO_AGENCY');
  const atcfIdx = indexOf('USA_ATCF_ID');
  const speedIdx = indexOf('STORM_SPEED');
  const dirIdx = indexOf('STORM_DIR');
  const windIdx = indexOf(`${agency}_WIND`);
  const presIdx = indexOf(`${agency}_PRES`);

  const systems = new Map<string, SystemAccumulator>();

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const row = splitCsvLine(line);

    const sid = (row[sidIdx] ?? '').trim();
    if (!sid || !/^\d/.test(sid)) continue; // ligne d'unités ou ligne vide
    const iso = (row[timeIdx] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) continue;

    // Le produit ACTIVE publie des pistes « PROVISIONAL » (opérationnelles), le
    // produit définitif des pistes « main », et quelques « spur » qui dupliquent
    // les horaires de la piste principale. On n'exclut donc QUE les « spur ».
    const trackType = trackTypeIdx >= 0 ? (row[trackTypeIdx] ?? '').trim().toLowerCase() : '';
    if (trackType === 'spur') continue;

    const latitude = toNumber(row[latIdx]);
    const longitudeRaw = toNumber(row[lonIdx]);
    if (latitude === null || longitudeRaw === null) continue;

    const windKt = pickNumber(row, [windIdx, indexOf('WMO_WIND'), indexOf('USA_WIND')]);
    const pressure = pickNumber(row, [presIdx, indexOf('WMO_PRES'), indexOf('USA_PRES')]);
    const speedKt = toNumber(speedIdx >= 0 ? row[speedIdx] : undefined);
    const dirDeg = toNumber(dirIdx >= 0 ? row[dirIdx] : undefined);

    const radius34ktKm = maxQuadrantKm(row, indexOf, agency, 34);
    const radius50ktKm = maxQuadrantKm(row, indexOf, agency, 50);
    const radius64ktKm = maxQuadrantKm(row, indexOf, agency, 64);
    const hasRadii = radius34ktKm !== null || radius50ktKm !== null || radius64ktKm !== null;

    const observedAt = `${iso.replace(' ', 'T')}Z`;
    const point: CycloneTrackPoint = {
      observedAt,
      latitude: round1(latitude),
      longitude: round1(normalizeLongitude(longitudeRaw)),
      windSpeedKmh: knotsToKmh(windKt),
      pressureHpa: pressure === null ? null : round1(pressure),
      movementDirection: dirDeg === null ? null : `${Math.round(dirDeg)}°`,
      movementSpeedKmh: knotsToKmh(speedKt),
      radius34ktKm,
      radius50ktKm,
      radius64ktKm,
      radiusSource: hasRadii ? radiusSourceForSid(sid) : null,
      radiusMeasureType: hasRadii ? RADIUS_MEASURE_TYPE : null,
      nature: natureIdx >= 0 ? (row[natureIdx] ?? '').trim() || null : null,
    };

    let accumulator = systems.get(sid);
    if (!accumulator) {
      accumulator = {
        name: (nameIdx >= 0 ? (row[nameIdx] ?? '').trim() : '') || sid,
        season: toNumber(seasonIdx >= 0 ? row[seasonIdx] : undefined),
        basin: basinIdx >= 0 ? (row[basinIdx] ?? '').trim() || null : null,
        agency: agencyIdx >= 0 ? (row[agencyIdx] ?? '').trim() || null : null,
        atcfId: atcfIdx >= 0 ? (row[atcfIdx] ?? '').trim() || null : null,
        byTime: new Map<string, CycloneTrackPoint>(),
      };
      systems.set(sid, accumulator);
    }

    const existing = accumulator.byTime.get(observedAt);
    if (!existing || radiusScore(point) > radiusScore(existing)) {
      accumulator.byTime.set(observedAt, point);
    }
  }

  const result: CycloneSystem[] = [];
  for (const [sid, acc] of systems) {
    const points = [...acc.byTime.values()].sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt),
    );
    if (points.length === 0) continue;
    result.push({
      source: 'IBTRACS',
      sourceSystemId: sid,
      name: acc.name,
      basin: acc.basin,
      season: acc.season,
      sourceUrl: env.CYCLONE_IBTRACS_URL,
      points,
      rawMetadata: {
        agency: acc.agency,
        atcfId: acc.atcfId,
        points: points.length,
        firstAt: points[0].observedAt,
        lastAt: points[points.length - 1].observedAt,
      },
    });
  }

  return result;
}

export class IbtracsProvider implements CycloneTrackProvider {
  readonly source = 'IBTRACS' as const;

  private readonly client = axios.create({ timeout: env.CYCLONE_TIMEOUT_MS });

  /** Systèmes actifs dont au moins un point entre dans la zone de veille. */
  async listActiveSystems(watch: WatchBbox): Promise<CycloneSystem[]> {
    let text: string;
    try {
      const response = await this.client.get<string>(env.CYCLONE_IBTRACS_URL, {
        responseType: 'text',
        headers: { Accept: 'text/csv, text/plain, */*' },
      });
      text = response.data;
    } catch (err) {
      logger.warn({ err }, 'IBTrACS ACTIVE inaccessible — aucune trajectoire récupérée');
      throw new AppError('Source IBTrACS (NCEI) inaccessible', 502, true);
    }

    const all = parseIbtracsCsv(text);
    const inWatch = all.filter((system) => systemIntersectsWatch(system, watch));
    logger.debug(
      { systems: all.length, inWatch: inWatch.length },
      'IBTrACS ACTIVE : systèmes actifs lus',
    );
    return inWatch;
  }
}

export const ibtracsProvider = new IbtracsProvider();
