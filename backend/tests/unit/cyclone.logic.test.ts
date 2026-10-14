import { describe, it, expect } from 'vitest';
import {
  buildIngestionPlans,
  eventCodeForSid,
  eventCodeForWatch,
  normalizeStormName,
  parseWatchBbox,
  pointInBbox,
  severityFromWindKmh,
  splitGdacsEventName,
  systemIntersectsWatch,
} from '../../src/services/cyclone/cyclone.logic';
import type { CycloneSystem, CycloneTrackPoint, CycloneWatch } from '../../src/types/cyclone.types';

function point(overrides: Partial<CycloneTrackPoint> & { observedAt: string }): CycloneTrackPoint {
  return {
    latitude: -20,
    longitude: 49,
    windSpeedKmh: 120,
    pressureHpa: 950,
    movementDirection: null,
    movementSpeedKmh: null,
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    nature: null,
    ...overrides,
  };
}

function system(overrides: Partial<CycloneSystem> = {}): CycloneSystem {
  return {
    source: 'IBTRACS',
    sourceSystemId: '2022024S09090',
    name: 'BATSIRAI',
    basin: 'SI',
    season: 2022,
    sourceUrl: 'https://example.test/ibtracs',
    points: [point({ observedAt: '2022-02-06T12:00:00Z' })],
    rawMetadata: {},
    ...overrides,
  };
}

function watch(overrides: Partial<CycloneWatch> = {}): CycloneWatch {
  return {
    source: 'GDACS',
    sourceSystemId: '1001335:29',
    name: 'BATSIRAI',
    season: 2022,
    alertLevel: 'Red',
    severityWindKmh: 220,
    countries: ['Madagascar'],
    reportUrl: 'https://www.gdacs.org/report.aspx?eventid=1001335',
    latitude: -20,
    longitude: 49,
    observedAt: '2022-02-06T15:00:00Z',
    fromDate: '2022-02-04T00:00:00Z',
    toDate: '2022-02-06T15:00:00Z',
    rawMetadata: { eventid: 1001335 },
    ...overrides,
  };
}

describe('parseWatchBbox', () => {
  it('convertit « minLon,minLat,maxLon,maxLat »', () => {
    expect(parseWatchBbox('30,-40,80,5')).toEqual({
      minLon: 30,
      minLat: -40,
      maxLon: 80,
      maxLat: 5,
    });
  });

  it('refuse une valeur illisible', () => {
    expect(() => parseWatchBbox('30,-40,80')).toThrow(/CYCLONE_WATCH_BBOX/);
    expect(() => parseWatchBbox('a,b,c,d')).toThrow(/CYCLONE_WATCH_BBOX/);
  });

  it('refuse des bornes incohérentes', () => {
    expect(() => parseWatchBbox('80,-40,30,5')).toThrow(/incohérent/);
  });
});

describe('pointInBbox / systemIntersectsWatch', () => {
  const bbox = parseWatchBbox('30,-40,80,5');

  it('accepte un point dans le rectangle et rejette l’extérieur', () => {
    expect(pointInBbox(-20, 49, bbox)).toBe(true);
    expect(pointInBbox(10, 49, bbox)).toBe(false);
    expect(pointInBbox(-20, 100, bbox)).toBe(false);
  });

  it('retient un système dès qu’un seul point entre dans la veille', () => {
    const far = system({
      points: [
        point({ observedAt: '2022-02-01T00:00:00Z', latitude: 5, longitude: 120 }),
        point({ observedAt: '2022-02-06T12:00:00Z', latitude: -20, longitude: 49 }),
      ],
    });
    expect(systemIntersectsWatch(far, bbox)).toBe(true);

    const outside = system({
      points: [point({ observedAt: '2022-02-01T00:00:00Z', latitude: 20, longitude: 140 })],
    });
    expect(systemIntersectsWatch(outside, bbox)).toBe(false);
  });
});

describe('severityFromWindKmh', () => {
  it('découpe selon les seuils 63 / 118 / 178 km/h', () => {
    expect(severityFromWindKmh(null)).toBe('FAIBLE');
    expect(severityFromWindKmh(62)).toBe('FAIBLE');
    expect(severityFromWindKmh(63)).toBe('MODEREE');
    expect(severityFromWindKmh(117)).toBe('MODEREE');
    expect(severityFromWindKmh(118)).toBe('ELEVEE');
    expect(severityFromWindKmh(177)).toBe('ELEVEE');
    expect(severityFromWindKmh(178)).toBe('EXTREME');
  });
});

describe('appariement des sources', () => {
  it('normalise les noms', () => {
    expect(normalizeStormName('Batsirai-22')).toBe('BATSIRAI22');
    expect(normalizeStormName('  Fūnso  ')).toBe('FUNSO');
  });

  it('découpe un nom GDACS en nom + année', () => {
    expect(splitGdacsEventName('SIMON-26')).toEqual({ name: 'SIMON', season: 2026 });
    expect(splitGdacsEventName('BATSIRAI-22')).toEqual({ name: 'BATSIRAI', season: 2022 });
    expect(splitGdacsEventName('FUNSO')).toEqual({ name: 'FUNSO', season: null });
    expect(splitGdacsEventName('B-25')).toEqual({ name: 'B-25', season: null });
  });

  it('génère des codes d’événement stables', () => {
    expect(eventCodeForSid('2022024S09090')).toBe('CYCLONE-2022024S09090');
    expect(eventCodeForWatch('1001335:29')).toBe('CYCLONE-GDACS-1001335-29');
  });
});

describe('buildIngestionPlans', () => {
  const now = Date.parse('2022-02-06T18:00:00Z');

  it('crée un plan IBTrACS seul, avec le bon code et un statut ACTIF', () => {
    const plans = buildIngestionPlans({
      tracked: [system()],
      watched: [],
      now,
      activeWindowHours: 24,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].source).toBe('IBTRACS');
    expect(plans[0].eventCode).toBe('CYCLONE-2022024S09090');
    expect(plans[0].status).toBe('ACTIF');
    expect(plans[0].severity).toBe('ELEVEE');
    expect(plans[0].linkedSources).toEqual([
      { source: 'IBTRACS', sourceSystemId: '2022024S09090' },
    ]);
  });

  it('rattache la veille GDACS au même événement (identité GDACS prioritaire)', () => {
    const plans = buildIngestionPlans({
      tracked: [system()],
      watched: [watch()],
      now,
      activeWindowHours: 24,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].source).toBe('GDACS');
    expect(plans[0].eventCode).toBe('CYCLONE-GDACS-1001335-29');
    expect(plans[0].alertLevel).toBe('Red');
    expect(plans[0].sourceUrl).toBe('https://www.gdacs.org/report.aspx?eventid=1001335');
    expect(plans[0].linkedSources).toHaveLength(2);
    // Le vent documenté (IBTrACS) prime sur la valeur GDACS.
    expect(plans[0].maxWindKmh).toBe(120);
  });

  it('détecte un cyclone vu uniquement par GDACS, sans rayon inventé', () => {
    const plans = buildIngestionPlans({
      tracked: [],
      watched: [watch({ name: 'FUNSO', season: 2022 })],
      now,
      activeWindowHours: 24,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].source).toBe('GDACS');
    expect(plans[0].points).toHaveLength(1);
    expect(plans[0].points[0].radius34ktKm).toBeNull();
    expect(plans[0].points[0].radiusSource).toBeNull();
    expect(plans[0].status).toBe('ACTIF');
    expect(plans[0].severity).toBe('EXTREME');
  });

  it('bascule en SUIVI quand le dernier point observé est trop ancien', () => {
    const plans = buildIngestionPlans({
      tracked: [system()],
      watched: [],
      now: Date.parse('2022-02-08T18:00:00Z'),
      activeWindowHours: 24,
    });
    expect(plans[0].status).toBe('SUIVI');
  });

  it('reste ACTIF si GDACS suit encore la tempête, malgré un point IBTrACS ancien', () => {
    // Dernier point IBTrACS vieux de 54 h (> 24 h) : seul, il donnerait SUIVI.
    // GDACS ne renvoyant que des systèmes `iscurrent`, l'appariement rétablit ACTIF.
    const plans = buildIngestionPlans({
      tracked: [system()],
      watched: [watch()],
      now: Date.parse('2022-02-08T18:00:00Z'),
      activeWindowHours: 24,
    });
    expect(plans[0].status).toBe('ACTIF');
  });
});
