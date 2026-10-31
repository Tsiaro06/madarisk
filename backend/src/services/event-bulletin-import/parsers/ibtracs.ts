import fs from 'fs';
import path from 'path';
import { parseCsv } from '../../../utils/csv';
import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

function knotsToKmh(kt: number | null): number | null {
  if (kt === null || kt === undefined || Number.isNaN(kt)) return null;
  return Math.round(kt * 1.852 * 100) / 100;
}

export function parseIbtracsFile(filePath: string): CanonicalTrackPoint[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCsv(content) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const points: CanonicalTrackPoint[] = [];
  for (const row of rows) {
    const isoTime = String(row.ISO_TIME ?? row.iso_time ?? row.TIME ?? row.time ?? '').trim();
    if (!isoTime) continue;
    const lat = Number(row.LAT ?? row.lat);
    const lon = Number(row.LON ?? row.lon ?? row.LON_WMO ?? row.lon_wmo);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const windKt = Number(
      row.WMO_WIND ?? row.USA_WIND ?? row.wmo_wind ?? row.usa_wind ?? row.WIND ?? row.wind,
    );
    const pres = Number(
      row.WMO_PRES ?? row.USA_PRES ?? row.wmo_pres ?? row.usa_pres ?? row.PRES ?? row.pressure,
    );
    const speedKt = Number(row.STORM_SPEED ?? row.storm_speed ?? row.MOV_SPEED ?? row.mov_speed);
    const dir = row.STORM_DR ?? row.storm_dr ?? row.MOV_DIR ?? row.mov_dir;

    points.push({
      observedAt:
        isoTime.replace(' ', 'T').endsWith('Z') || isoTime.includes('+')
          ? isoTime.replace(' ', 'T')
          : `${isoTime.replace(' ', 'T')}Z`,
      trackType: 'OBSERVEE',
      lat,
      lon,
      windSpeedKmh: Number.isNaN(windKt) ? null : knotsToKmh(windKt),
      gustSpeedKmh: null,
      pressureHpa: Number.isNaN(pres) ? null : pres,
      movementDirection: dir ? String(dir) : null,
      movementSpeedKmh: Number.isNaN(speedKt) ? null : knotsToKmh(speedKt),
      sourceRef: path.basename(filePath),
    });
  }
  return points.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}

export function isIbtracsLike(filePath: string, content?: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes('ibtracs')) return true;
  if (!content) {
    try {
      content = fs.readFileSync(filePath, 'utf-8').slice(0, 2048);
    } catch {
      return false;
    }
  }
  const head = content.toLowerCase();
  return (
    head.includes('iso_time') &&
    head.includes('lat') &&
    head.includes('lon') &&
    (head.includes('sid') || head.includes('wmo_wind') || head.includes('usa_wind'))
  );
}
