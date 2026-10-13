import { describe, expect, it } from 'vitest';
import {
  availableWindRadiusKm,
  clockBounds,
  deriveRiskFromWind,
  describeMovementDirection,
  documentedWindCircles,
  documentedWindRadius,
  filterImpactsAt,
  formatAntananarivo,
  formatAntananarivoShort,
  formatMeasure,
  frameAt,
  framePosition,
  isAffectedAt,
  observedSteps,
  segmentMinutesAt,
  toAntananarivoTime,
  vigilanceLabel,
  windRadiusLongLabel,
  windRadiusShortLabel,
} from './historical';
import type { TrackStatePoint } from '@/types';

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

describe('cadre temporel du marqueur cyclone (aucune donnée inventée)', () => {
  const track = (
    observedAt: string,
    latitude: number,
    longitude: number,
  ) => ({
    id: observedAt,
    eventId: 'evt',
    observedAt,
    forecastFor: null,
    trackType: 'OBSERVEE' as const,
    latitude,
    longitude,
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

  const steps = [
    track('2022-02-05T12:00:00.000Z', -20, 50),
    track('2022-02-05T18:00:00.000Z', -21, 48),
  ];

  it('borne le curseur sur la première/dernière observation', () => {
    expect(clockBounds(steps)).toEqual({
      startMs: new Date('2022-02-05T12:00:00.000Z').getTime(),
      endMs: new Date('2022-02-05T18:00:00.000Z').getTime(),
      spanMinutes: 360,
    });
    expect(clockBounds([])).toBeNull();
  });

  it('retrouve exactement le point quand l’instant coïncide', () => {
    const frame = frameAt(steps, new Date('2022-02-05T12:00:00.000Z').getTime());
    expect(frame?.exact).toBe(true);
    expect(frame?.progress).toBe(0);
    expect(frame?.from.id).toBe('2022-02-05T12:00:00.000Z');
    expect(framePosition(frame!)).toEqual([-20, 50]);
  });

  it('interpole la POSITION entre les deux points vérifiés (50 %)', () => {
    const at = new Date('2022-02-05T15:00:00.000Z').getTime();
    const frame = frameAt(steps, at);
    expect(frame?.exact).toBe(false);
    expect(frame?.progress).toBeCloseTo(0.5, 6);
    expect(framePosition(frame!)).toEqual([-20.5, 49]);
    // Les valeurs affichées restent celles du point source `from`.
    expect(frame?.from.observedAt).toBe('2022-02-05T12:00:00.000Z');
  });

  it('reste sur le dernier point au-delà de la trajectoire', () => {
    const frame = frameAt(steps, new Date('2022-03-01T00:00:00.000Z').getTime());
    expect(frame?.index).toBe(1);
    expect(frame?.to).toBeNull();
    expect(framePosition(frame!)).toEqual([-21, 48]);
  });

  it('clockBounds résume plusieurs points', () => {
    expect(clockBounds([steps[0]])?.spanMinutes).toBe(0);
    expect(clockBounds(steps)?.spanMinutes).toBe(360);
  });
});

describe('describeMovementDirection (rose des vents)', () => {
  it.each([
    ['220°', 'Sud-Ouest (220°)'],
    ['0°', 'Nord (0°)'],
    ['90°', 'Est (90°)'],
    ['265°', 'Ouest (265°)'],
  ])('convertit %s en %s', (raw, expected) => {
    expect(describeMovementDirection(raw)).toBe(expected);
  });

  it('retourne null sans donnée et préserve une valeur non numérique', () => {
    expect(describeMovementDirection(null)).toBeNull();
    expect(describeMovementDirection('   ')).toBeNull();
    expect(describeMovementDirection('stationnaire')).toBe('stationnaire');
  });
});

describe('rayon de vent et mesures manquantes', () => {
  const base = {
    id: 'p',
    eventId: 'evt',
    observedAt: '2022-02-05T12:00:00.000Z',
    forecastFor: null,
    trackType: 'OBSERVEE' as const,
    latitude: -20,
    longitude: 48,
    windSpeedKmh: 185,
    gustSpeedKmh: null,
    pressureHpa: 955,
    precipitationMm: null,
    movementDirection: null,
    movementSpeedKmh: null,
    createdAt: '2022-02-05T12:00:00.000Z',
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusMaxKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    radiusQuality: null,
    dataQuality: null,
    confidence: null,
  };

  it('n’utilise aucun rayon quand la source n’en fournit pas', () => {
    expect(availableWindRadiusKm(base)).toBeNull();
    expect(availableWindRadiusKm(null)).toBeNull();
  });

  it('privilégie le rayon documenté', () => {
    expect(availableWindRadiusKm({ ...base, radiusMaxKm: 250, radius34ktKm: 400 })).toBe(250);
    expect(availableWindRadiusKm({ ...base, radius34ktKm: 400 })).toBe(400);
  });

  it('retourne le seuil publié avec la valeur (pour pouvoir le nommer)', () => {
    expect(documentedWindRadius(base)).toBeNull();
    expect(documentedWindRadius(null)).toBeNull();
    expect(documentedWindRadius({ ...base, radiusMaxKm: 250, radius34ktKm: 400 })).toEqual({
      km: 250,
      kind: 'max',
    });
    expect(documentedWindRadius({ ...base, radius34ktKm: 368.5, radius50ktKm: 164.8 })).toEqual({
      km: 368.5,
      kind: 34,
    });
    expect(documentedWindRadius({ ...base, radius50ktKm: 164.8 })).toEqual({ km: 164.8, kind: 50 });
    expect(documentedWindRadius({ ...base, radius64ktKm: 90 })).toEqual({ km: 90, kind: 64 });
  });

  it('nomme les seuils tels qu’ils figurent dans les bulletins', () => {
    expect(windRadiusShortLabel('max')).toBe('RMW');
    expect(windRadiusShortLabel(34)).toBe('R34');
    expect(windRadiusLongLabel(34)).toBe('Rayon du vent ≥ 34 nœuds (R34)');
    expect(windRadiusLongLabel('max')).toBe('Rayon des vents maximaux (RMW)');
  });

  it('ne construit l’emprise des vents qu’avec les rayons réellement publiés', () => {
    // Aucun rayon publié : aucune emprise, jamais un cercle de rayon zéro.
    expect(documentedWindCircles([base, { ...base, id: 'p2' }])).toEqual([]);

    const circles = documentedWindCircles([
      { ...base, id: 'p1', radius34ktKm: 368.5, latitude: -21.0, longitude: 48.0 },
      { ...base, id: 'p2', radius34ktKm: null, radius50ktKm: null },
      { ...base, id: 'p3', radius50ktKm: 164.8, latitude: -22.5, longitude: 46.5 },
    ]);

    // Le point muet (p2) est ignoré : une absence n'est pas un zéro.
    expect(circles).toHaveLength(2);
    expect(circles[0]).toMatchObject({
      id: 'p1',
      radiusKm: 368.5,
      kind: 34,
      latitude: -21.0,
      longitude: 48.0,
    });
    expect(circles[1]).toMatchObject({ id: 'p3', radiusKm: 164.8, kind: 50 });
  });

  it('ne retient que la valeur publiée du seuil le plus large (aucune interpolation)', () => {
    const [circle] = documentedWindCircles([
      { ...base, id: 'p1', radiusMaxKm: 250, radius34ktKm: 400, radius50ktKm: 164.8 },
    ]);
    expect(circle).toMatchObject({ radiusKm: 250, kind: 'max' });
  });

  it('affiche « non disponible » plutôt que zéro', () => {
    expect(formatMeasure(null, 'km/h')).toBe('non disponible');
    expect(formatMeasure(undefined, 'km/h')).toBe('non disponible');
    expect(formatMeasure(185.4, 'km/h')).toBe('185,4 km/h');
  });
});

describe('vigilanceLabel (zones de vigilance du bulletin)', () => {
  it('reprend le libellé de la source jusqu’à « zone placée »', () => {
    expect(
      vigilanceLabel(
        'Alerte rouge — région Analamanga — zone placée en vigilance selon le bulletin Météo Madagascar du 4 février 2022.',
      ),
    ).toBe('Alerte rouge — région Analamanga');
  });

  it('retourne null sans libellé exploitable', () => {
    expect(vigilanceLabel(null)).toBeNull();
    expect(vigilanceLabel('')).toBeNull();
  });
});

describe('segmentMinutesAt (lecture visuelle : 3 s par segment)', () => {
  const p = (id: string, observedAt: string): TrackStatePoint =>
    ({
      id,
      eventId: 'e',
      observedAt,
      forecastFor: null,
      trackType: 'OBSERVEE',
      latitude: 0,
      longitude: 0,
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
    }) as TrackStatePoint;

  const steps = [
    p('p1', '2022-02-05T12:00:00.000Z'),
    p('p2', '2022-02-05T18:00:00.000Z'),
    p('p3', '2022-02-05T19:00:00.000Z'),
  ];
  const startMs = new Date(steps[0].observedAt).getTime();

  it('renvoie la durée réelle du segment courant, quelle que soit sa longueur', () => {
    expect(segmentMinutesAt(steps, startMs)).toBe(360);
    expect(segmentMinutesAt(steps, startMs + 180 * 60_000)).toBe(360);
    expect(segmentMinutesAt(steps, startMs + 380 * 60_000)).toBe(60);
  });

  it('vaut 0 sur le dernier point (fin de trajectoire → boucle)', () => {
    expect(segmentMinutesAt(steps, startMs + 420 * 60_000)).toBe(0);
    expect(segmentMinutesAt([], 0)).toBe(0);
  });
});