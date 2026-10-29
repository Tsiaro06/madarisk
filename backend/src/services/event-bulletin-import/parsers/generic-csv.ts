import fs from 'fs';
import path from 'path';
import { parseCsv } from '../../../utils/csv';
import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

const LAT_KEYS = ['lat', 'latitude', 'LAT', 'LATITUDE', 'y'];
const LON_KEYS = ['lon', 'lng', 'longitude', 'LON', 'LNG', 'LONGITUDE', 'x'];
const TIME_KEYS = ['time', 'datetime', 'date', 'observedat', 'observed_at', 'iso_time', 'timestamp', 'heure', 'date_heure'];
const WIND_KEYS = ['wind', 'windspeed', 'wind_speed', 'wind_speed_kmh', 'wmo_wind', 'vmoy', 'vmax', 'vent'];
const PRES_KEYS = ['pressure', 'pres', 'press', 'pressure_hpa', 'pmer'];
const DIR_KEYS = ['dir', 'direction', 'movement_direction', 'dirdeg'];
const SPD_KEYS = ['speed', 'movement_speed', 'movement_speed_kmh', 'vitesse'];

function getVal(row: Record<string, unknown>, keys: string[]): unknown {
  const lowerMap = new Map<string, unknown>();
  for (const k of Object.keys(row)) {
    lowerMap.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), row[k]);
  }
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lowerMap.has(norm)) return lowerMap.get(norm);
  }
  return undefined;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // try dd/mm/yyyy hh:mm
  const m = s.match(/(\d{1,2})[/ -](\d{1,2})[/ -](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const hour = m[4] ? Number(m[4]) : 0;
    const min = m[5] ? Number(m[5]) : 0;
    const sec = m[6] ? Number(m[6]) : 0;
    const dd = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!Number.isNaN(dd.getTime())) return dd.toISOString();
  }
  return null;
}

export function parseGenericCsv(filePath: string): CanonicalTrackPoint[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCsv(content) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const points: CanonicalTrackPoint[] = [];
  for (const row of rows) {
    const lat = toNumber(getVal(row, LAT_KEYS));
    const lon = toNumber(getVal(row, LON_KEYS));
    const timeIso = toIso(getVal(row, TIME_KEYS));
    if (lat === null || lon === null || !timeIso) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const wind = toNumber(getVal(row, WIND_KEYS));
    const pres = toNumber(getVal(row, PRES_KEYS));
    const dir = getVal(row, DIR_KEYS);
    const spd = toNumber(getVal(row, SPD_KEYS));
    points.push({
      observedAt: timeIso,
      trackType: 'OBSERVEE',
      lat,
      lon,
      windSpeedKmh: wind !== null && wind < 400 ? (wind < 150 ? Math.round(wind * 1.852 * 100) / 100 : wind) : null,
      gustSpeedKmh: null,
      pressureHpa: pres,
      movementDirection: dir ? String(dir) : null,
      movementSpeedKmh: spd !== null && spd < 200 ? (spd < 80 ? Math.round(spd * 1.852 * 100) / 100 : spd) : null,
      sourceRef: path.basename(filePath),
    });
  }
  return points.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}
