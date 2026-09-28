import { describe, it, expect } from 'vitest';
import {
  createDetectionRuleSchema,
  listDetectionRulesQuerySchema,
  detectionRuleIdParamsSchema,
} from '../../src/validators/detection-rules.validator';

const BASE = {
  hazardType: 'VENT_VIOLENT',
  metric: 'wind_speed_10m',
  operator: 'GE',
  threshold: 60,
};

describe('createDetectionRuleSchema — validation des valeurs', () => {
  it('accepte un payload valide et applique les défauts', () => {
    const result = createDetectionRuleSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.durationMinutes).toBe(0);
      expect(result.data.aggregationWindowMinutes).toBe(0);
      expect(result.data.forecastHorizonHours).toBe(0);
      expect(result.data.severityRules).toEqual([]);
      expect(result.data.thresholdMax).toBeUndefined();
    }
  });

  it('accepte VAGUE_DE_CHALEUR avec un opérateur BETWEEN et thresholdMax', () => {
    const result = createDetectionRuleSchema.safeParse({
      hazardType: 'VAGUE_DE_CHALEUR',
      metric: 'temperature_2m',
      operator: 'BETWEEN',
      threshold: 35,
      thresholdMax: 42,
      forecastHorizonHours: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un opérateur inconnu', () => {
    const result = createDetectionRuleSchema.safeParse({ ...BASE, operator: 'SUP' });
    expect(result.success).toBe(false);
  });

  it('rejette un type d’aléa inconnu', () => {
    const result = createDetectionRuleSchema.safeParse({ ...BASE, hazardType: 'TSUNAMI' });
    expect(result.success).toBe(false);
  });

  it('rejette une valeur de seuil manquante', () => {
    const { threshold, ...rest } = BASE;
    expect(threshold).toBeTypeOf('number');
    const result = createDetectionRuleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejette BETWEEN sans thresholdMax', () => {
    const result = createDetectionRuleSchema.safeParse({ ...BASE, operator: 'BETWEEN' });
    expect(result.success).toBe(false);
  });

  it('rejette thresholdMax inférieur à threshold sur BETWEEN', () => {
    const result = createDetectionRuleSchema.safeParse({
      ...BASE,
      operator: 'BETWEEN',
      threshold: 50,
      thresholdMax: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejette plusieurs portées géographiques à la fois', () => {
    const scopeUuid = '10000000-0000-0000-0000-000000000001';
    const result = createDetectionRuleSchema.safeParse({
      ...BASE,
      regionId: scopeUuid,
      districtId: scopeUuid,
    });
    expect(result.success).toBe(false);
  });

  it('accepte une seule portée géographique', () => {
    const scopeUuid = '10000000-0000-0000-0000-000000000001';
    const result = createDetectionRuleSchema.safeParse({
      ...BASE,
      communeId: scopeUuid,
    });
    expect(result.success).toBe(true);
  });

  it('rejette des severityRules au min hors bornes', () => {
    const result = createDetectionRuleSchema.safeParse({
      ...BASE,
      severityRules: [{ level: 'ELEVEE', min: 150 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepte des severityRules valides', () => {
    const result = createDetectionRuleSchema.safeParse({
      ...BASE,
      severityRules: [
        { level: 'MODEREE', min: 60 },
        { level: 'ELEVEE', min: 80 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('listDetectionRulesQuerySchema — lecture des règles', () => {
  it('transforme isActive=false en false', () => {
    const result = listDetectionRulesQuerySchema.parse({ isActive: 'false' });
    expect(result.isActive).toBe(false);
  });

  it('transforme isActive absent en true (règles actives par défaut)', () => {
    const result = listDetectionRulesQuerySchema.parse({});
    expect(result.isActive).toBe(true);
  });

  it('rejette un hazardType inconnu', () => {
    const result = listDetectionRulesQuerySchema.safeParse({ hazardType: 'TSUNAMI' });
    expect(result.success).toBe(false);
  });
});

describe('detectionRuleIdParamsSchema — identifiants', () => {
  it('rejette un id non-uuid', () => {
    const result = detectionRuleIdParamsSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepte un id uuid', () => {
    const result = detectionRuleIdParamsSchema.safeParse({
      id: '10000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });
});