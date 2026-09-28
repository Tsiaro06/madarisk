import type { FeatureCollection } from 'geojson';
import type {
  ExposedCommuneInfo,
  WeatherForecastData,
  WeatherObservation,
} from '@/types';
import { isRiskLevel } from '@/lib/crisisStyles';

export interface ForecastDay {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precip: number | null;
}

export function buildForecastDays(
  forecast: WeatherForecastData | null | undefined,
): ForecastDay[] {
  if (!forecast) return [];
  const days = new Map<string, { tempMax: number; tempMin: number; precip: number }>();
  forecast.hourly.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    const cur = days.get(day) ?? { tempMax: -Infinity, tempMin: Infinity, precip: 0 };
    const tc = forecast.hourly.temperatureC[i];
    const pr = forecast.hourly.precipitationMm[i];
    if (tc != null) {
      if (tc > cur.tempMax) cur.tempMax = tc;
      if (tc < cur.tempMin) cur.tempMin = tc;
    }
    if (pr != null) cur.precip += pr;
    days.set(day, cur);
  });
  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date: date.slice(5),
      tempMax: Number.isFinite(d.tempMax) ? Number(d.tempMax.toFixed(1)) : null,
      tempMin: Number.isFinite(d.tempMin) ? Number(d.tempMin.toFixed(1)) : null,
      precip: Number(d.precip.toFixed(1)),
    }));
}

export interface HistoryDay {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precip: number | null;
}

export function buildHistoryDays(
  rows: WeatherObservation[],
  maxDays = 7,
): HistoryDay[] {
  const days = new Map<string, { tempMax: number; tempMin: number; precip: number }>();
  for (const row of rows) {
    const day = (row.observedAt ?? '').slice(0, 10);
    if (!day) continue;
    const cur = days.get(day) ?? { tempMax: -Infinity, tempMin: Infinity, precip: 0 };
    const tc = row.temperatureC;
    const pr = row.precipitationMm;
    if (tc != null) {
      if (tc > cur.tempMax) cur.tempMax = tc;
      if (tc < cur.tempMin) cur.tempMin = tc;
    }
    if (pr != null) cur.precip += pr;
    days.set(day, cur);
  }
  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-maxDays)
    .map(([date, d]) => ({
      date: date.slice(5),
      tempMax: Number.isFinite(d.tempMax) ? Number(d.tempMax.toFixed(1)) : null,
      tempMin: Number.isFinite(d.tempMin) ? Number(d.tempMin.toFixed(1)) : null,
      precip: Number(d.precip.toFixed(1)),
    }));
}

export interface ExposureIndex {
  exposedIds: Set<string>;
  info: Map<string, ExposedCommuneInfo>;
}

export function buildExposureIndex(layer?: FeatureCollection | null): ExposureIndex {
  const exposedIds = new Set<string>();
  const info = new Map<string, ExposedCommuneInfo>();
  for (const feature of layer?.features ?? []) {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    const communeId = String(p.communeId ?? feature.id ?? '');
    if (!communeId) continue;
    exposedIds.add(communeId);
    const riskLevel =
      isRiskLevel(p.riskLevel) || p.riskLevel === null ? (p.riskLevel as ExposedCommuneInfo['riskLevel']) : null;
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' ? Number(v) : null;
    info.set(communeId, {
      communeId,
      communeCode: String(p.communeCode ?? '') || null,
      communeName: String(p.communeName ?? '') || null,
      districtName: String(p.districtName ?? '') || null,
      population: num(p.population),
      exposedPopulation: num(p.exposedPopulation),
      overlapPercent: num(p.overlapPercent),
      distanceToTrackKm: num(p.distanceToTrackKm),
      isInsideInfluenceArea: typeof p.isInsideInfluenceArea === 'boolean' ? p.isInsideInfluenceArea : null,
      sourceType:
        p.sourceType === 'SEUIL' || p.sourceType === 'ZONE' || p.sourceType === 'TRAJECTOIRE' || p.sourceType === 'MANUEL'
          ? p.sourceType
          : null,
      dataType: p.dataType === 'REEL' || p.dataType === 'ESTIME' ? p.dataType : null,
      riskLevel,
      riskScore: num(p.riskScore),
      updatedAt: String(p.updatedAt ?? '') || null,
    });
  }
  return { exposedIds, info };
}

export const EXPOSURE_SOURCE_LABELS: Record<string, string> = {
  SEUIL: 'Seuil dépassé',
  ZONE: 'Recouvrement de zone',
  TRAJECTOIRE: 'Proximité de la trajectoire',
  MANUEL: 'Déclaré manuellement',
};

export const EXPOSURE_DATA_LABELS: Record<string, string> = {
  REEL: 'Données réelles',
  ESTIME: 'Estimation système',
};

export function exposureSourceLabel(source: string | null | undefined): string | null {
  return source && source in EXPOSURE_SOURCE_LABELS ? EXPOSURE_SOURCE_LABELS[source] : null;
}

export function exposureDataLabel(data: string | null | undefined): string | null {
  return data && data in EXPOSURE_DATA_LABELS ? EXPOSURE_DATA_LABELS[data] : null;
}