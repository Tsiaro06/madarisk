import { describe, expect, it } from 'vitest';
import {
  deriveRiskFromWind,
  filterImpactsAt,
  formatAntananarivo,
  formatAntananarivoShort,
  isAffectedAt,
  observedSteps,
  toAntananarivoTime,
} from './historical';

describe('deriveRiskFromWind', () => {
  const cases: Array<[number | null, string]> = [
    [null, 'INCONNU'],
    [0, 'MODERE'],
    [88, 'MODERE'],
    [89, 'ELEVE'],
    [117, 'ELEVE'],
    [118, 'TRES_ELEVE'],
    [167, 'TRES_ELEVE'],
  ];
  it.each(cases)('vent %s km/h → %s', (wind, expected) => {
    expect(deriveRiskFromWind(wind)).toBe(expected);
  });

  it('retourne INCONNU sans donnée de vent (jamais inventé)', () => {
    expect(deriveRiskFromWind(undefined as unknown as number)).toBe('INCONNU');
    expect(deriveRiskFromWind(Number.NaN)).toBe('INCONNU');
  });
});

describe('heure locale Madagascar (UTC+3) — Batsirai, atterrissage 16:00Z = 19:00 locales', () => {
  it('décale la date UTC de +3 heures', () => {
    const local = toAntananarivoTime('2022-02-05T16:00:00.000Z');
    expect(local.getUTCHours()).toBe(19);
    expect(local.getUTCDate()).toBe(5);
  });

  it('bascule la date au lendemain après minuit UTC', () => {
    const local = toAntananarivoTime('2022-02-05T22:30:00.000Z');
    expect(local.getUTCHours()).toBe(1);
    expect(local.getUTCDate()).toBe(6);
  });

  it('formate en heure locale de Madagascar', () => {
    expect(formatAntananarivo('2022-02-05T16:00:00.000Z')).toContain('19:00');
    expect(formatAntananarivo('2022-02-05T16:00:00.000Z')).toContain('2022');
  });

  it('formate compact pour la barre temporelle', () => {
    const short = formatAntananarivoShort('2022-02-05T16:00:00.000Z');
    expect(short).toContain('19:00');
  });

  it('renvoie « — » sans valeur', () => {
    expect(formatAntananarivo(null)).toBe('—');
    expect(formatAntananarivo(undefined)).toBe('—');
    expect(formatAntananarivoShort('')).toBe('—');
  });
});

describe('isAffectedAt / filterImpactsAt (premier impact observé ≤ at)', () => {
  const atLandfall = '2022-02-05T16:00:00.000Z';
  it('colore la commune à partir de son first_affected_at (bornes incluses)', () => {
    expect(isAffectedAt({ communeId: 'a', firstAffectedAt: '2022-02-05T16:00:00.000Z' }, atLandfall)).toBe(true);
    expect(isAffectedAt({ communeId: 'b', firstAffectedAt: '2022-02-05T15:59:00.000Z' }, atLandfall)).toBe(true);
  });

  it('ne colore jamais la commune avant son passage observé', () => {
    expect(isAffectedAt({ communeId: 'c', firstAffectedAt: '2022-02-05T18:00:00.000Z' }, atLandfall)).toBe(false);
  });

  it('traite un first_affected_at absent comme affecté (cohérent backend)', () => {
    expect(isAffectedAt({ communeId: 'd', firstAffectedAt: null }, atLandfall)).toBe(true);
  });

  it('filtre le sous-ensemble des impacts au temps choisi', () => {
    const impacts = [
      { communeId: 'a', firstAffectedAt: '2022-02-04T00:00:00.000Z' },
      { communeId: 'b', firstAffectedAt: '2022-02-05T18:00:00.000Z' },
      { communeId: 'c', firstAffectedAt: null },
    ];
    const at = filterImpactsAt(impacts, atLandfall);
    expect(at.map((i) => i.communeId)).toEqual(['a', 'c']);
  });
});

describe('observedSteps', () => {
  const pt = (observedAt: string, trackType: 'OBSERVEE' | 'PREVUE' = 'OBSERVEE') => ({
    id: observedAt,
    eventId: 'evt',
    observedAt,
    forecastFor: null,
    trackType,
    latitude: -20,
    longitude: 48,
    windSpeedKmh: null,
    gustSpeedKmh: null,
    pressureHpa: null,
    precipitationMm: null,
    movementDirection: null,
    movementSpeedKmh: null,
    createdAt: observedAt,
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusMaxKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    radiusQuality: null,
    dataQuality: null,
    confidence: null,
  });

  it('n’expose que les points OBSERVÉS, triés chronologiquement', () => {
    const steps = observedSteps([
      pt('2022-02-05T18:00:00.000Z'),
      pt('2022-02-04T00:00:00.000Z', 'PREVUE'),
      pt('2022-02-05T12:00:00.000Z'),
    ]);
    expect(steps.map((s) => s.observedAt)).toEqual([
      '2022-02-05T12:00:00.000Z',
      '2022-02-05T18:00:00.000Z',
    ]);
  });
});