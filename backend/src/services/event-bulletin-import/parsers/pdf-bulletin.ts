import fs from 'fs';
import path from 'path';
import { CanonicalTrackPoint } from '../../../types/event-bulletin-import.types';

function parseDateTime(text: string, yearHint?: number): Date | null {
  // DD/MM/YYYY HH:MM or DD-MM-YYYY HHhMM
  let m = text.match(/(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{2,4})\s+(\d{1,2})[h:\s](\d{2})(?:[:\s](\d{2}))?/i);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const hour = Number(m[4]);
    const min = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }
  // JJ mois YYYY HH:MM (fr)
  m = text.match(/(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(\d{4})\s+(\d{1,2})[h:](\d{2})/i);
  if (m) {
    const months: Record<string, number> = {
      janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, décembre: 11,
    };
    const monthKey = m[2].toLowerCase().replace('é', 'e');
    const month = months[monthKey] ?? 0;
    const day = Number(m[1]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const min = Number(m[5]);
    return new Date(Date.UTC(year, month, day, hour, min, 0));
  }
  if (yearHint) {
    m = text.match(/(\d{1,2})[/.\\-](\d{1,2})\s+(\d{1,2})[h:\s](\d{2})/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]) - 1;
      const hour = Number(m[3]);
      const min = Number(m[4]);
      return new Date(Date.UTC(yearHint, month, day, hour, min, 0));
    }
  }
  return null;
}

function parsePosition(text: string): { lat: number; lon: number } | null {
  // 19.4°S 52.5°E
  let m = text.match(/(-?\d+(?:\.\d+)?)\s*[°d]?\s*(S|sud)\s+(-?\d+(?:\.\d+)?)\s*[°d]?\s*(E|est)/i);
  if (m) {
    let lat = Number(m[1]);
    const lon = Number(m[3]);
    if (m[2].toLowerCase().startsWith('s')) lat = -Math.abs(lat);
    return { lat, lon };
  }
  // 12°30'S 49°20'E
  m = text.match(/(\d{1,2})[°d]\s*(\d{1,2})['’]\s*(S|sud)\s+(\d{1,2})[°d]\s*(\d{1,2})['’]\s*(E|est)/i);
  if (m) {
    const lat = -(Number(m[1]) + Number(m[2]) / 60);
    const lon = Number(m[4]) + Number(m[5]) / 60;
    return { lat, lon };
  }
  // lat/lon decimals
  m = text.match(/latitude\s*:?\s*(-?\d+(?:\.\d+)?)\s*[°]?\s*(N|S)?[^0-9-]+longitude\s*:?\s*(-?\d+(?:\.\d+)?)\s*[°]?\s*(E|W)?/i);
  if (m) {
    let lat = Number(m[1]);
    let lon = Number(m[3]);
    if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
    if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

function parseWindKmh(text: string): number | null {
  // 185 km/h, 150 Km/h
  let m = text.match(/(\d{2,3})\s*km\/?h/i);
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v < 400) return v;
  }
  // vent soutenu ... 185 km/h
  m = text.match(/vent[^\d]{0,20}(\d{2,3})\s*km/i);
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v < 400) return v;
  }
  // 100 noeuds / 100 kt
  m = text.match(/(\d{2,3})\s*(noeud|kt|kts)/i);
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v < 200) return Math.round(v * 1.852);
  }
  return null;
}

function parsePressure(text: string): number | null {
  const m = text.match(/(\d{3,4})\s*hpa/i);
  if (m) {
    const v = Number(m[1]);
    if (v > 800 && v < 1100) return v;
  }
  return null;
}

export async function parsePdfBulletin(filePath: string): Promise<CanonicalTrackPoint[]> {
  try {
    const buffer = fs.readFileSync(filePath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text?: string }>;
    const data = await pdfParse(buffer);
    const text = typeof data.text === 'string' ? data.text : '';
    if (!text.trim()) return [];

    const yearMatch = text.match(/(20\d{2})/);
    const yearHint = yearMatch ? Number(yearMatch[1]) : undefined;

    const points: CanonicalTrackPoint[] = [];
    // Split into lines/blocks
    const blocks = text.split(/\n\s*\n/);
    for (const block of blocks) {
      const b = block.replace(/\s+/g, ' ').trim();
      if (b.length < 20) continue;
      const d = parseDateTime(b, yearHint);
      if (!d) continue;
      const pos = parsePosition(b);
      if (!pos) continue;
      const wind = parseWindKmh(b);
      const pres = parsePressure(b);
      points.push({
        observedAt: d.toISOString(),
        trackType: 'OBSERVEE',
        lat: pos.lat,
        lon: pos.lon,
        windSpeedKmh: wind,
        gustSpeedKmh: null,
        pressureHpa: pres,
        movementDirection: null,
        movementSpeedKmh: null,
        sourceRef: path.basename(filePath),
      });
    }

    // Deduplicate by observedAt
    const seen = new Set<string>();
    const unique = points.filter((p) => {
      if (seen.has(p.observedAt)) return false;
      seen.add(p.observedAt);
      return true;
    });

    return unique.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  } catch {
    return [];
  }
}

export function isPdfBulletinLike(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}
