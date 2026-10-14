import { describe, it, expect } from 'vitest';
import { BATSIRAI_TRACK } from '../../database/seeds/batsirai-2022';
import {
  buildWindSamples,
  classifyWind,
  type WindSample,
  windIntervalsForCommune,
} from '../../database/scripts/seed-batsirai-alerts';

/**
 * Coloration communale de Batsirai : la commune est ROUGE dans le rayon de vent
 * ≥ 50 kt, JAUNE dans le rayon ≥ 34 kt, VERT hors du champ de vent, puis BLEU dès
 * qu'elle sort du rayon — la transition doit rester progressive, commune par
 * commune, et ne jamais reposer sur une valeur inventée.
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
  });

  it('retrouve les rayons documentés au passage sur Madagascar', () => {
    const samples = buildWindSamples();
    const landfall = samples.find((s) => s.t === Date.parse('2022-02-05T12:00:00Z'));
    expect(landfall?.r34).toBe(368.5);
    expect(landfall?.r50).toBe(164.8);
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
    ...overrides,
  });

  it('classe ROUGE dans le rayon ≥ 50 kt', () => {
    expect(classifyWind(48, -20, sample({ lon: 48, lat: -20 }), 'VERT')).toBe('ROUGE');
  });

  it('classe JAUNE dans le rayon ≥ 34 kt mais hors du rayon ≥ 50 kt', () => {
    // ≈ 111 km au sud du centre : > 100 km (R50) mais ≤ 200 km (R34).
    expect(classifyWind(48, -21, sample({ lon: 48, lat: -20 }), 'VERT')).toBe('JAUNE');
  });

  it('classe VERT hors du champ de vent', () => {
    // ≈ 550 km au sud : au-delà de R34.
    expect(classifyWind(48, -25, sample({}), 'VERT')).toBe('VERT');
  });

  it('conserve le niveau précédent quand aucun seuil n’est publié', () => {
    const noRadii: WindSample = { t: 0, lon: 0, lat: 0, r34: null, r50: null, r64: null };
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

  /** Commune à l'origine : le centre reste dessus et les rayons évoluent. */
  const centerOnCommune: WindSample[] = [
    { t: times[0], lon: 0, lat: 0, r34: 50, r50: null, r64: null },
    { t: times[1], lon: 0, lat: 0, r34: 50, r50: 20, r64: null },
    { t: times[2], lon: 0, lat: 0, r34: 50, r50: 20, r64: null },
    { t: times[3], lon: 0, lat: 0, r34: 100, r50: null, r64: null },
    { t: times[4], lon: 0, lat: 0, r34: null, r50: null, r64: null },
    { t: times[5], lon: 0, lat: 0, r34: null, r50: null, r64: null },
  ];

  it('enchaîne JAUNE → ROUGE → JAUNE → BLEU sans recouvrement', () => {
    const eventEnd = times[5] + 3 * 3600 * 1000;
    const intervals = windIntervalsForCommune('c1', 0, 0, centerOnCommune, eventEnd);

    expect(intervals.map((i) => i.level)).toEqual(['JAUNE', 'ROUGE', 'JAUNE', 'BLEU']);
    expect(intervals.map((i) => [i.from, i.to])).toEqual([
      [times[0], times[1]],
      [times[1], times[3]],
      [times[3], times[5]],
      [times[5], eventEnd],
    ]);

    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i].from).toBe(intervals[i - 1].to);
      expect(intervals[i].from).toBeGreaterThanOrEqual(intervals[i - 1].from);
    }
  });

  it('ne crée aucune ligne dynamique pour une commune hors du champ de vent', () => {
    const far = centerOnCommune.map((s) => ({ ...s, r34: 10, r50: null, r64: null }));
    const intervals = windIntervalsForCommune('c2', 40, 40, far, times[5] + 3600_000);
    expect(intervals).toEqual([]);
  });
});
