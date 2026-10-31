import fs from 'fs';
import path from 'path';
import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function extractPointsFromArray(arr: unknown[]): CanonicalTrackPoint[] {
  const points: CanonicalTrackPoint[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const lat = toNumber(obj.lat ?? obj.latitude ?? obj.y);
    const lon = toNumber(obj.lon ?? obj.lng ?? obj.longitude ?? obj.x);
    const time = toIso(
      obj.time ?? obj.datetime ?? obj.date ?? obj.observedAt ?? obj.observed_at ?? obj.timestamp,
    );
    if (lat === null || lon === null || !time) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const wind = toNumber(obj.windSpeedKmh ?? obj.wind_speed_kmh ?? obj.wind ?? obj.vmax);
    const gust = toNumber(obj.gustSpeedKmh ?? obj.gust_speed_kmh ?? obj.gust);
    const pres = toNumber(obj.pressureHpa ?? obj.pressure ?? obj.pmer);
    const dir = obj.movementDirection ?? obj.direction ?? obj.dir;
    const spd = toNumber(obj.movementSpeedKmh ?? obj.movement_speed_kmh ?? obj.speed);
    points.push({
      observedAt: time,
      trackType:
        String(obj.trackType ?? obj.track_type ?? 'OBSERVEE').toUpperCase() === 'PREVUE'
          ? 'PREVUE'
          : 'OBSERVEE',
      lat,
      lon,
      windSpeedKmh: wind,
      gustSpeedKmh: gust,
      pressureHpa: pres,
      movementDirection: dir ? String(dir) : null,
      movementSpeedKmh: spd,
      sourceRef: path.basename(String(obj.sourceRef ?? '')),
    });
  }
  return points.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}

export function parseGenericJson(filePath: string): CanonicalTrackPoint[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return extractPointsFromArray(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.points)) return extractPointsFromArray(obj.points);
      if (Array.isArray(obj.track)) return extractPointsFromArray(obj.track);
      if (Array.isArray(obj.tracks)) return extractPointsFromArray(obj.tracks);
      const arr = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(arr)) return extractPointsFromArray(arr);
    }
  } catch {
    // ignore
  }
  return [];
}
