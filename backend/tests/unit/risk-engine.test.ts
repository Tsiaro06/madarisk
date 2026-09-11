import { describe, it, expect } from 'vitest';
import {
  scoreRain,
  scoreWind,
  scoreProximity,
  scoreVulnerability,
  scoreExposure,
  presentationFor,
  computeRiskAssessment,
} from '../../src/services/risk.service';
import { RiskContext } from '../../src/types/risk.types';

const DEFAULT_CFG = {
  weights: {
    rainWeight: 0.3,
    windWeight: 0.25,
    proximityWeight: 0.2,
    vulnerabilityWeight: 0.15,
    exposureWeight: 0.1,
  },
  thresholds: {
    lowThreshold: 20,
    moderateThreshold: 40,
    highThreshold: 60,
    extremeThreshold: 80,
  },
};

function context(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    communeId: '10000000-0000-0000-0000-000000000001',
    vulnerabilityScore: null,
    population: null,
    rainfall24hMm: null,
    precipitationMm: null,
    windSpeedKmh: null,
    insideArea: false,
    distanceKm: null,
    severity: null,
    areaRadiusKm: null,
    ...overrides,
  };
}

describe('scoreRain', () => {
  it('est neutre sans données', () => {
    expect(scoreRain(null, null)).toBe(50);
  });

  it('retourne 10 sous 20 mm', () => {
    expect(scoreRain(10, 5)).toBe(10);
  });

  it('retourne 35 entre 20 et 50 mm', () => {
    expect(scoreRain(35, 30)).toBe(35);
  });

  it('retourne 65 entre 50 et 100 mm', () => {
    expect(scoreRain(70, 60)).toBe(65);
  });

  it('retourne 100 au-delà de 100 mm', () => {
    expect(scoreRain(150, 120)).toBe(100);
  });

  it('prend la pluie 24h si disponible en priorité', () => {
    expect(scoreRain(null, 150)).toBe(100);
  });
});

describe('scoreWind', () => {
  it('est neutre sans données', () => {
    expect(scoreWind(null)).toBe(50);
  });

  it('retourne 10 sous 30 km/h', () => {
    expect(scoreWind(20)).toBe(10);
  });

  it('retourne 35 entre 30 et 60 km/h', () => {
    expect(scoreWind(45)).toBe(35);
  });

  it('retourne 65 entre 60 et 100 km/h', () => {
    expect(scoreWind(80)).toBe(65);
  });

  it('retourne 100 au-delà de 100 km/h', () => {
    expect(scoreWind(120)).toBe(100);
  });
});

describe('scoreProximity', () => {
  it('est neutre sans événement hôte', () => {
    expect(scoreProximity({ hasEvent: false, insideArea: true, distanceKm: 0, areaRadiusKm: null })).toBe(50);
  });

  it('retourne 100 dans la zone d influence', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: true, distanceKm: 5, areaRadiusKm: 50 })).toBe(100);
  });

  it('retourne 90 à moins de 30% du rayon (très proche)', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 10, areaRadiusKm: 100 })).toBe(90);
  });

  it('retourne 75 entre 30% et 60% du rayon', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 40, areaRadiusKm: 100 })).toBe(75);
  });

  it('retourne 55 entre 60% et 100% du rayon', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 75, areaRadiusKm: 100 })).toBe(55);
  });

  it('retourne 35 entre 100% et 150% du rayon (bord extérieur)', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 120, areaRadiusKm: 100 })).toBe(35);
  });

  it('retourne 20 entre 150% et 200% du rayon', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 170, areaRadiusKm: 100 })).toBe(20);
  });

  it('retourne 10 au-delà de 200% du rayon ou sans distance', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 250, areaRadiusKm: 100 })).toBe(10);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: null, areaRadiusKm: 100 })).toBe(10);
  });

  it('utilise les seuils fixes sans rayon', () => {
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 25, areaRadiusKm: null })).toBe(90);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 50, areaRadiusKm: null })).toBe(75);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 80, areaRadiusKm: null })).toBe(55);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 120, areaRadiusKm: null })).toBe(35);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 180, areaRadiusKm: null })).toBe(20);
    expect(scoreProximity({ hasEvent: true, insideArea: false, distanceKm: 250, areaRadiusKm: null })).toBe(10);
  });
});

describe('scoreVulnerability et scoreExposure', () => {
  it('vulnérabilité neutre sans données, bornée à 100', () => {
    expect(scoreVulnerability(null)).toBe(50);
    expect(scoreVulnerability(120)).toBe(100);
    expect(scoreVulnerability(45.6)).toBe(46);
  });

  it('exposition neutre sans population, proportionnelle à 200 000', () => {
    expect(scoreExposure(null)).toBe(50);
    expect(scoreExposure(200_000)).toBe(100);
    expect(scoreExposure(100_000)).toBe(50);
    expect(scoreExposure(50_000)).toBe(25);
  });
});

describe('presentationFor', () => {
  const thresholds = DEFAULT_CFG.thresholds;

  it('détermine le niveau selon les seuils', () => {
    expect(presentationFor(10, thresholds).riskLevel).toBe('FAIBLE');
    expect(presentationFor(25, thresholds).riskLevel).toBe('MODERE');
    expect(presentationFor(45, thresholds).riskLevel).toBe('MODERE');
    expect(presentationFor(70, thresholds).riskLevel).toBe('ELEVE');
    expect(presentationFor(90, thresholds).riskLevel).toBe('EXTREME');
  });

  it('expose niveau d affichage et couleur distincts', () => {
    expect(presentationFor(10, thresholds)).toEqual({
      riskLevel: 'FAIBLE',
      displayLevel: 'SUIVI',
      color: '#3B82F6',
    });
    expect(presentationFor(25, thresholds)).toEqual({
      riskLevel: 'MODERE',
      displayLevel: 'FAIBLE',
      color: '#22C55E',
    });
    expect(presentationFor(45, thresholds)).toEqual({
      riskLevel: 'MODERE',
      displayLevel: 'VIGILANCE',
      color: '#EAB308',
    });
    expect(presentationFor(70, thresholds)).toEqual({
      riskLevel: 'ELEVE',
      displayLevel: 'IMPORTANT',
      color: '#F97316',
    });
    expect(presentationFor(90, thresholds)).toEqual({
      riskLevel: 'EXTREME',
      displayLevel: 'EXTRÊME',
      color: '#DC2626',
    });
  });

  it('traite les bornes des seuils', () => {
    expect(presentationFor(19, thresholds).displayLevel).toBe('SUIVI');
    expect(presentationFor(20, thresholds).displayLevel).toBe('FAIBLE');
    expect(presentationFor(40, thresholds).displayLevel).toBe('VIGILANCE');
    expect(presentationFor(60, thresholds).displayLevel).toBe('IMPORTANT');
    expect(presentationFor(80, thresholds).displayLevel).toBe('EXTRÊME');
  });
});

describe('computeRiskAssessment - score total et réponse explicable', () => {
  it('calcule le score total pondéré', () => {
    const result = computeRiskAssessment(
      context({
        rainfall24hMm: 150,
        precipitationMm: 120,
        windSpeedKmh: 120,
        insideArea: true,
        distanceKm: 5,
        vulnerabilityScore: 50,
        population: 100_000,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
    );

    expect(result.riskScore).toBe(88);
    expect(result.riskLevel).toBe('EXTREME');
    expect(result.assessedAt).toBe('2026-09-07T06:00:00.000Z');
    expect(result.factors.rainScore).toBe(100);
    expect(result.factors.windScore).toBe(100);
    expect(result.factors.proximityScore).toBe(100);
    expect(result.factors.vulnerabilityScore).toBe(50);
    expect(result.factors.exposureScore).toBe(50);
  });

  it('produit une explication détaillée et lisible', () => {
    const result = computeRiskAssessment(
      context({
        rainfall24hMm: 150,
        precipitationMm: 120,
        windSpeedKmh: 120,
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 80,
        population: 220_000,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
    );

    expect(Array.isArray(result.explanation)).toBe(true);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation.join(' ')).toContain('seuil critique');
    expect(result.explanation.join(' ')).toContain('trajectoire');
    expect(result.explanation.join(' ')).toContain('vulnérabilité');
    expect(result.explanation.join(' ')).toContain('population');
  });

  it('renvoie un facteur de résilience pour un contexte bénin', () => {
    const result = computeRiskAssessment(context({}), DEFAULT_CFG, '2026-09-07T06:00:00.000Z');
    expect(result.riskScore).toBeLessThan(50);
    expect(result.riskLevel).toBe('MODERE');
    expect(result.explanation.join(' ')).toContain('Aucun facteur');
  });

  it("amplifie le score selon l'intensité de l'événement", () => {
    const base = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
    );

    const extreme = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
        severity: 'EXTREME' as const,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
    );

    const faible = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
        severity: 'FAIBLE' as const,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
    );

    expect(extreme.riskScore).toBe(Math.min(100, Math.round(base.riskScore * 2)));
    expect(faible.riskScore).toBe(base.riskScore);
    expect(extreme.explanation.join(' ')).toContain("L'intensité exceptionnelle");
  });

  it('ajuste le score selon la phase (PENDANT > AVANT > APRES)', () => {
    const pendant = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
        severity: 'EXTREME' as const,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
      true,
      'PENDANT',
    );

    const avant = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
        severity: 'EXTREME' as const,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
      true,
      'AVANT',
    );

    const apres = computeRiskAssessment(
      context({
        insideArea: true,
        distanceKm: 0,
        vulnerabilityScore: 50,
        population: 100_000,
        severity: 'EXTREME' as const,
      }),
      DEFAULT_CFG,
      '2026-09-07T06:00:00.000Z',
      true,
      'APRES',
    );

    expect(pendant.riskScore).toBeGreaterThan(avant.riskScore);
    expect(avant.riskScore).toBeGreaterThan(apres.riskScore);
  });
});