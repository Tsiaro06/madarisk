import { describe, it, expect } from 'vitest';
import {
  affectedCommuneIdsAt,
  buildWindSamples,
  classifyWind,
  haversineKm,
  windIntervalsForCommune,
  type WindAnchor,
  type WindSample,
} from '../../src/services/cyclone/cyclone-coloring.logic';

/**
 * Logique de coloration partagée entre le seed Batsirai 2022 et l'ingestion
 * temps réel. Ces tests fixent les invariants dont dépend la carte : aucune
 * valeur inventée, échantillonnage interpolé, cœur prolongé, et intervalles
 * BLEU ouverts pour un événement en cours.
 */

const H = 3_600_000;

function anchor(overrides: Partial<WindAnchor> & { t: number }): WindAnchor {
  return { lon: 0, lat: 0, r34: null, r50: null, r64: null, ...overrides };
}

describe('cyclone-coloring.logic — haversine', () => {
  it('mesure une distance connue (1° de latitude ≈ 111 km)', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 0);
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
  });
});

describe('cyclone-coloring.logic — échantillonnage', () => {
  it('interpole la position et les rayons entre deux ancrages sans inventer', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const samples = buildWindSamples([
      anchor({ t: t0, lon: 0, lat: 0, r34: 100, r50: 50 }),
      anchor({ t: t0 + H, lon: 1, lat: 0, r34: 200, r50: 100 }),
    ]);

    expect(samples.length).toBeGreaterThan(2); // 15 min de pas
    const mid = samples.find((s) => s.t === t0 + H / 2);
    expect(mid?.lon).toBeCloseTo(0.5, 6);
    expect(mid?.r34).toBeCloseTo(150, 6);
    expect(mid?.r50).toBeCloseTo(75, 6);
  });

  it('n’interpole jamais un rayon publié par un seul des deux ancrages', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const samples = buildWindSamples([
      anchor({ t: t0, lon: 0, lat: 0, r34: 100 }),
      anchor({ t: t0 + H, lon: 1, lat: 0, r34: null }),
    ]);
    const mid = samples.find((s) => s.t === t0 + H / 2);
    expect(mid?.r34).toBeNull();
  });

  it('prolonge le dernier R50 publié (cœur) puis le garde quand il disparaît', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const samples = buildWindSamples([
      anchor({ t: t0, r34: 200, r50: 90 }),
      anchor({ t: t0 + H, r34: 200, r50: null }),
      anchor({ t: t0 + 2 * H, r34: 200, r50: null }),
    ]);
    // Tous les échantillons après la dernière publication conservent coreKm = 90.
    const after = samples.filter((s) => s.t > t0 + H / 2);
    expect(after.length).toBeGreaterThan(0);
    for (const s of after) expect(s.coreKm).toBe(90);
  });
});

describe('cyclone-coloring.logic — intervalles', () => {
  const t0 = Date.parse('2026-01-01T00:00:00Z');

  /** Un centre qui s'éloigne : la commune à l'origine entre puis sort du R34. */
  const moving: WindSample[] = [
    { t: t0, lon: 0, lat: 0, r34: 100, r50: null, r64: null, coreKm: null },
    { t: t0 + H, lon: 0, lat: 0, r34: 100, r50: null, r64: null, coreKm: null },
    { t: t0 + 2 * H, lon: 5, lat: 0, r34: 100, r50: null, r64: null, coreKm: null },
  ];

  it('clôt le BLEU à la fin de l’événement quand elle est connue', () => {
    const eventEnd = t0 + 4 * H;
    const intervals = windIntervalsForCommune('c1', 0, 0, moving, eventEnd);
    expect(intervals.map((i) => i.level)).toEqual(['JAUNE', 'BLEU']);
    expect(intervals[intervals.length - 1].to).toBe(eventEnd);
  });

  it('laisse le BLEU ouvert pour un événement en cours (to = null)', () => {
    const intervals = windIntervalsForCommune('c1', 0, 0, moving, null);
    const bleu = intervals.find((i) => i.level === 'BLEU');
    expect(bleu).toBeDefined();
    expect(bleu?.to).toBeNull();
  });

  it('ne crée aucun intervalle pour une commune jamais dans le champ de vent', () => {
    expect(windIntervalsForCommune('c2', 40, 40, moving, null)).toEqual([]);
  });

  it('ne chevauche jamais deux intervalles', () => {
    const intervals = windIntervalsForCommune('c1', 0, 0, moving, t0 + 4 * H);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i].from).toBeGreaterThanOrEqual(intervals[i - 1].to ?? Infinity);
    }
  });

  it('n’a jamais de ROUGE sans R50/R64 documenté', () => {
    const intervals = windIntervalsForCommune('c1', 0, 0, moving, null);
    expect(intervals.some((i) => i.level === 'ROUGE')).toBe(false);
  });

  it('classe ROUGE dans le cœur plafonné par le R34', () => {
    const sample: WindSample = { t: 0, lon: 0, lat: 0, r34: 80, r50: 200, r64: null, coreKm: 200 };
    // À 150 km : hors R34 plafonné (80) → VERT, malgré un coreKm non plafonné.
    expect(classifyWind(0, 1.35, sample, 'VERT')).toBe('VERT');
    // À 50 km : dans le cœur plafonné → ROUGE.
    expect(classifyWind(0, 0.45, sample, 'VERT')).toBe('ROUGE');
  });
});

describe('cyclone-coloring.logic — communes affectées', () => {
  it('sélectionne les communes JAUNE/ROUGE actives, jamais le BLEU', () => {
    const intervals = [
      { communeId: 'c1', level: 'JAUNE' as const, from: 10, to: 20 },
      { communeId: 'c1', level: 'BLEU' as const, from: 20, to: null },
      { communeId: 'c2', level: 'ROUGE' as const, from: 0, to: null },
      { communeId: 'c3', level: 'JAUNE' as const, from: 0, to: 5 },
    ];
    expect(affectedCommuneIdsAt(intervals, 10).sort()).toEqual(['c1', 'c2']);
    // Après la sortie de c1 (BLEU) et l'expiration de c3 : seule c2 reste.
    expect(affectedCommuneIdsAt(intervals, 25)).toEqual(['c2']);
    // Aucune commune affectée hors période documentée.
    expect(affectedCommuneIdsAt(intervals, 1)).toEqual(['c2', 'c3']);
  });
});
