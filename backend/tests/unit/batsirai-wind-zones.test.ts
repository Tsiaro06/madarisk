import { describe, it, expect } from 'vitest';
import { BATSIRAI_TRACK } from '../../database/seeds/batsirai-2022';
import {
  buildWindSamples,
  classifyWind,
  type WindSample,
  windIntervalsForCommune,
} from '../../database/scripts/seed-batsirai-alerts';

/**
 * Coloration communale de Batsirai : la commune est ROUGE dans le cœur du cyclone
 * (« passage »), JAUNE dans le rayon de vent ≥ 34 kt, VERT hors du champ de vent,
 * puis BLEU dès qu'elle sort du rayon — la transition doit rester progressive,
 * commune par commune, et ne jamais reposer sur une valeur inventée.
 */
describe('Zones de vent Batsirai — échantillonnage', () => {
  it('échantillonne plus finement que la trajectoire, dans l’ordre chronologique', () => {
    const samples = buildWindSamples();
    expect(samples.length).toBeGreaterThan(BATSIRAI_TRACK.length);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].t).toBeGreaterThanOrEqual(samples[i - 1].t);
    }
    expect(samples[0].t).toBe(Date.parse(BATSIRAI_TRACK[0].time));
  });

  it('ne publie aucun rayon avant que la RSMC ne l’ait documenté (jamais 0)', () => {
    const samples = buildWindSamples();
    expect(samples[0].r34).toBeNull();
    expect(samples[0].r50).toBeNull();
    expect(samples[0].r64).toBeNull();
    expect(samples[0].coreKm).toBeNull();
  });

  it('retrouve les rayons documentés au passage sur Madagascar', () => {
    const samples = buildWindSamples();
    const landfall = samples.find((s) => s.t === Date.parse('2022-02-05T12:00:00Z'));
    expect(landfall?.r34).toBe(368.5);
    expect(landfall?.r50).toBe(164.8);
    expect(landfall?.coreKm).toBe(164.8);
  });

  it('prolonge le dernier R50 publié quand la RSMC cesse de le publier', () => {
    const samples = buildWindSamples();
    const lastPublished = samples.find((s) => s.t === Date.parse('2022-02-06T00:00:00Z'));
    expect(lastPublished?.r50).toBe(98.2);

    // Après cette date, le R50 n'est plus publié mais le cœur reste prolongé.
    const after = samples.find((s) => s.t === Date.parse('2022-02-06T06:00:00Z'));
    expect(after?.r50).toBeNull();
    expect(after?.coreKm).toBe(98.2);

    const later = samples.find((s) => s.t === Date.parse('2022-02-07T00:00:00Z'));
    expect(later?.r50).toBeNull();
    expect(later?.coreKm).toBe(98.2);
  });
});

describe('Zones de vent Batsirai — classification', () => {
  const sample = (overrides: Partial<WindSample>): WindSample => ({
    t: Date.parse('2022-02-05T12:00:00Z'),
    lon: 48,
    lat: -20,
    r34: 200,
    r50: 100,
    r64: null,
    coreKm: 100,
    ...overrides,
  });

  it('classe ROUGE dans le cœur (rayon ≥ 50 kt)', () => {
    expect(classifyWind(48, -20, sample({ lon: 48, lat: -20 }), 'VERT')).toBe('ROUGE');
  });

  it('classe ROUGE via le cœur prolongé, même sans R50 publié', () => {
    // ≈ 100 km du centre : hors R50 (non publié) mais dans le cœur prolongé (120 km).
    expect(
      classifyWind(
        48,
        -20.9,
        { t: 0, lon: 48, lat: -20, r34: 300, r50: null, r64: null, coreKm: 120 },
        'VERT',
      ),
    ).toBe('ROUGE');
  });

  it('classe JAUNE dans le rayon ≥ 34 kt mais hors du cœur', () => {
    // ≈ 111 km au sud du centre : > 100 km (cœur) mais ≤ 200 km (R34).
    expect(
      classifyWind(
        48,
        -21,
        { t: 0, lon: 48, lat: -20, r34: 200, r50: null, r64: null, coreKm: 100 },
        'VERT',
      ),
    ).toBe('JAUNE');
  });

  it('classe VERT hors du champ de vent', () => {
    // ≈ 550 km au sud : au-delà de R34.
    expect(
      classifyWind(
        48,
        -25,
        { t: 0, lon: 48, lat: -20, r34: 200, r50: null, r64: null, coreKm: 100 },
        'VERT',
      ),
    ).toBe('VERT');
  });

  it('conserve le niveau précédent quand rien n’est documenté', () => {
    const noRadii: WindSample = {
      t: 0,
      lon: 0,
      lat: 0,
      r34: null,
      r50: null,
      r64: null,
      coreKm: null,
    };
    expect(classifyWind(0, 0, noRadii, 'JAUNE')).toBe('JAUNE');
    expect(classifyWind(0, 0, noRadii, 'VERT')).toBe('VERT');
  });
});

describe('Zones de vent Batsirai — intervalles par commune', () => {
  const times = [
    '2022-02-05T00:00:00Z',
    '2022-02-05T06:00:00Z',
    '2022-02-05T12:00:00Z',
    '2022-02-05T18:00:00Z',
    '2022-02-06T00:00:00Z',
    '2022-02-06T06:00:00Z',
  ].map((t) => Date.parse(t));

  /**
   * Commune à l'origine : le centre s'éloigne progressivement. Cœur prolongé à
   * 20 km après l'arrêt de la publication du R50.
   */
  const movingCenter: WindSample[] = [
    { t: times[0], lon: 0, lat: 0, r34: 50, r50: null, r64: null, coreKm: null },
    { t: times[1], lon: 0, lat: 0, r34: 50, r50: 20, r64: null, coreKm: 20 },
    { t: times[2], lon: 0.5, lat: 0, r34: 200, r50: null, r64: null, coreKm: 20 },
    { t: times[3], lon: 1, lat: 0, r34: 200, r50: null, r64: null, coreKm: 20 },
    { t: times[4], lon: 5, lat: 0, r34: 200, r50: null, r64: null, coreKm: 20 },
    { t: times[5], lon: 5, lat: 0, r34: 200, r50: null, r64: null, coreKm: 20 },
  ];

  it('enchaîne JAUNE → ROUGE → JAUNE → BLEU sans recouvrement', () => {
    const eventEnd = times[5] + 3 * 3600 * 1000;
    const intervals = windIntervalsForCommune('c1', 0, 0, movingCenter, eventEnd);

    expect(intervals.map((i) => i.level)).toEqual(['JAUNE', 'ROUGE', 'JAUNE', 'BLEU']);
    expect(intervals.map((i) => [i.from, i.to])).toEqual([
      [times[0], times[1]],
      [times[1], times[2]],
      [times[2], times[4]],
      [times[4], eventEnd],
    ]);

    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i].from).toBe(intervals[i - 1].to);
      expect(intervals[i].from).toBeGreaterThanOrEqual(intervals[i - 1].from);
    }
  });

  it('ne crée aucune ligne dynamique pour une commune hors du champ de vent', () => {
    const far = movingCenter.map((s) => ({ ...s, r34: 10, coreKm: null }));
    const intervals = windIntervalsForCommune('c2', 40, 40, far, times[5] + 3600_000);
    expect(intervals).toEqual([]);
  });
});
