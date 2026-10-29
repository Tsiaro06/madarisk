import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shp = require('shpjs') as (input: Buffer | ArrayBuffer | string) => Promise<any>;
import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

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

export async function parseShapefileFromZip(zipPath: string): Promise<CanonicalTrackPoint[]> {
  try {
    const buffer = fs.readFileSync(zipPath);
    const geojson = (await shp(buffer)) as any;
    const features = Array.isArray(geojson) ? (geojson[0]?.features ?? []) : geojson?.features ?? [];
    const points: CanonicalTrackPoint[] = [];
    for (const f of features) {
      const geom = f?.geometry;
      if (!geom) continue;
      if (geom.type === 'Point') {
        const coords = geom.coordinates;
        const lon = toNumber(coords?.[0]);
        const lat = toNumber(coords?.[1]);
        if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        const props: any = f.properties || {};
        const timeIso = toIso(props.time || props.datetime || props.date || props.observedAt || props.observed_at);
        if (!timeIso) continue;
        const wind = toNumber(props.windSpeedKmh || props.wind_speed_kmh || props.wind || props.vmoy || props.vmax);
        const pres = toNumber(props.pressureHpa || props.pressure_hpa || props.pressure);
        points.push({
          observedAt: timeIso,
          trackType: 'OBSERVEE',
          lat,
          lon,
          windSpeedKmh: wind !== null && wind < 400 ? (wind < 150 ? Math.round(wind * 1.852 * 100) / 100 : wind) : null,
          gustSpeedKmh: null,
          pressureHpa: pres,
          movementDirection: props.movementDirection || props.dir || null,
          movementSpeedKmh: null,
          sourceRef: path.basename(zipPath),
        });
      }
    }
    return points.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  } catch {
    return [];
  }
}

export function isShapefileZip(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.zip';
}
