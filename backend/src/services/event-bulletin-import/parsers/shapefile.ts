import fs from 'fs';
import path from 'path';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shp = require('shpjs') as (input: Buffer | ArrayBuffer | string) => Promise<FeatureCollection | FeatureCollection[]>;

import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const m = s.match(/(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
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

function getProp(props: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!props) return undefined;
  const map = new Map<string, unknown>();
  for (const k of Object.keys(props)) {
    map.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), props[k]);
  }
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map.has(norm)) return map.get(norm);
  }
  return undefined;
}

export async function parseShapefileFromZip(zipPath: string): Promise<CanonicalTrackPoint[]> {
  try {
    const buffer = fs.readFileSync(zipPath);
    const geojson = await shp(buffer);
    const collection: FeatureCollection = Array.isArray(geojson) ? geojson[0] : geojson;
    const features = collection?.features ?? [];
    const points: CanonicalTrackPoint[] = [];

    for (const f of features as Feature[]) {
      const geom = f.geometry as Geometry | null;
      if (!geom || geom.type !== 'Point') continue;
      const coords = (geom as Point).coordinates;
      const lon = toNumber(coords?.[0]);
      const lat = toNumber(coords?.[1]);
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      const props = f.properties as Record<string, unknown> | undefined;
      const timeIso = toIso(
        getProp(props, ['time', 'datetime', 'date', 'observedat', 'observed_at', 'iso_time', 'timestamp', 'heure']),
      );
      if (!timeIso) continue;

      const wind = toNumber(
        getProp(props, ['wind', 'windspeed', 'wind_speed_kmh', 'wind_speed', 'vmoy', 'vmax', 'vent', 'maxwind']),
      );
      const pres = toNumber(getProp(props, ['pressure', 'pres', 'press', 'pressure_hpa', 'pmer', 'slp']));
      const dir = getProp(props, ['dir', 'direction', 'mvd', 'movementdirection', 'movement_dir']);

      points.push({
        observedAt: timeIso,
        trackType: 'OBSERVEE',
        lat,
        lon,
        windSpeedKmh: wind !== null && wind < 400 ? (wind < 150 ? Math.round(wind * 1.852 * 100) / 100 : wind) : null,
        gustSpeedKmh: null,
        pressureHpa: pres,
        movementDirection: dir == null ? null : String(dir),
        movementSpeedKmh: null,
        sourceRef: path.basename(zipPath),
      });
    }

    return points.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  } catch {
    return [];
  }
}

export function isShapefileZip(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.zip';
}