import { describe, it, expect } from 'vitest';
import {
  applyOperator,
  detectionKeyFor,
  eventCodeFor,
  eventNameFor,
  frenchHazardName,
  hazardShortCode,
  intensityScore,
  metricToForecastColumn,
  metricToObservationColumn,
  severityForScore,
  WIND_METRICS,
  PRESSURE_METRICS,
  RAIN_METRICS,
} from '../../src/services/detection.logic';
import type { HazardDetectionRule } from '../../src/types/automation.types';

function makeRule(overrides: Partial<HazardDetectionRule>): HazardDetectionRule {
  return {
    id: 'rule-id',
    hazardType: 'INONDATION',
    metric: 'precipitation',
    operator: 'GE',
    threshold: 40,
    thresholdMax: null,
    durationMinutes: 0,
    aggregationWindowMinutes: 0,
    forecastHorizonHours: 0,
    severityRules: [],
    isActive: true,
    regionId: null,
    districtId: null,
    communeId: null,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('applyOperator', () => {
  it('évalue GT, GE, LT, LE, EQ et BETWEEN', () => {
    expect(applyOperator('GT', 41, 40, null)).toBe(true);
    expect(applyOperator('GT', 40, 40, null)).toBe(false);
    expect(applyOperator('GE', 40, 40, null)).toBe(true);
    expect(applyOperator('LT', 39, 40, null)).toBe(true);
    expect(applyOperator('LE', 40, 40, null)).toBe(true);
    expect(applyOperator('EQ', 40, 40, null)).toBe(true);
    expect(applyOperator('EQ', 41, 40, null)).toBe(false);
    expect(applyOperator('BETWEEN', 55, 50, 60)).toBe(true);
    expect(applyOperator('BETWEEN', 65, 50, 60)).toBe(false);
  });
});

describe('intensityScore', () => {
  it('calcule l excès au-dessus du seuil pour GT/GE', () => {
    const rule = makeRule({ operator: 'GT', threshold: 40 });
    expect(intensityScore(40, rule)).toBe(0);
    expect(intensityScore(60, rule)).toBe(50);
    expect(intensityScore(80, rule)).toBe(100);
    expect(intensityScore(120, rule)).toBe(100);
  });

  it('calcule l excès sous le seuil pour LT/LE', () => {
    const rule = makeRule({ operator: 'LE', threshold: 40 });
    expect(intensityScore(40, rule)).toBe(0);
    expect(intensityScore(20, rule)).toBe(50);
    expect(intensityScore(0, rule)).toBe(100);
  });

  it('calcule le dépassement par rapport aux bornes pour BETWEEN', () => {
    const rule = makeRule({ operator: 'BETWEEN', threshold: 50, thresholdMax: 70 });
    expect(intensityScore(50, rule)).toBe(14);
    expect(intensityScore(60, rule)).toBe(7);
    expect(intensityScore(70, rule)).toBe(14);
    expect(intensityScore(80, rule)).toBe(21);
    expect(intensityScore(35, rule)).toBe(25);
  });

  it('ne dépasse jamais 100 et reste positive', () => {
    const rule = makeRule({ operator: 'GE', threshold: -10 });
    expect(intensityScore(1000, rule)).toBe(100);
    expect(intensityScore(-10, rule)).toBe(0);
  });
});

describe('severityForScore', () => {
  it('renvoie FAIBLE sans règles ou score sous le premier seuil', () => {
    expect(severityForScore([], 90)).toBe('FAIBLE');
    expect(severityForScore([{ level: 'ELEVEE', min: 80 }], 50)).toBe('FAIBLE');
  });

  it('renvoie le niveau le plus élevé atteint', () => {
    const rules = [
      { level: 'MODEREE' as const, min: 30 },
      { level: 'ELEVEE' as const, min: 70 },
      { level: 'EXTREME' as const, min: 90 },
    ];
    expect(severityForScore(rules, 35)).toBe('MODEREE');
    expect(severityForScore(rules, 75)).toBe('ELEVEE');
    expect(severityForScore(rules, 95)).toBe('EXTREME');
  });
});

describe('mapping des métriques', () => {
  it('mappe les alias vers les colonnes d observation', () => {
    expect(metricToObservationColumn('wind_speed_10m')).toBe('wind_speed_kmh');
    expect(metricToObservationColumn('precipitation')).toBe('precipitation_mm');
    expect(metricToObservationColumn('temperature_2m')).toBe('temperature_c');
  });

  it('mappe les alias vers les colonnes de prévision', () => {
    expect(metricToForecastColumn('wind_speed_10m')).toBe('wind_speed_max_kmh');
    expect(metricToForecastColumn('precipitation')).toBe('precipitation_sum_mm');
    expect(metricToForecastColumn('temperature_2m')).toBe('temperature_max_c');
  });

  it('renvoie null pour une métrique inconnue', () => {
    expect(metricToObservationColumn('vitesse')).toBeNull();
    expect(metricToForecastColumn('vitesse')).toBeNull();
  });

  it('classe les métriques vent / pression / pluie', () => {
    expect(WIND_METRICS.has('wind_speed_kmh')).toBe(true);
    expect(PRESSURE_METRICS.has('pressure_hpa')).toBe(true);
    expect(RAIN_METRICS.has('rainfall_24h_mm')).toBe(true);
    expect(RAIN_METRICS.has('precipitation_mm')).toBe(true);
  });
});

describe('clés, codes et libellés', () => {
  it('construit la clé de déduplication', () => {
    expect(detectionKeyFor('INONDATION', 'c1')).toBe('INONDATION:c1');
  });

  it('construit un code événement stable et conforme', () => {
    const code = eventCodeFor('INONDATION', 'abcd1234', new Date('2026-09-14T00:00:00Z'));
    expect(code).toMatch(/^INON_\d{8}_[A-Z0-9]+\_[A-Z0-9]+$/);
  });

  it('fournit un nom français lisible', () => {
    expect(frenchHazardName('CYCLONE')).toBe('Cyclone');
    expect(eventNameFor('INONDATION', 'Antananarivo', true)).toBe(
      'Inondation — Antananarivo (prévision)',
    );
    expect(eventNameFor('INONDATION', 'Antananarivo', false)).toBe('Inondation — Antananarivo');
  });

  it('fournit des codes courts d aléa', () => {
    expect(hazardShortCode('CYCLONE')).toBe('CYCL');
    expect(hazardShortCode('INCONNU')).toBe('AUTR');
  });
});
