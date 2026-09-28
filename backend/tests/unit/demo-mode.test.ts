import { describe, it, expect, vi } from 'vitest';
import {
  demoEnvironmentIssues,
  isDemoDatabaseName,
  resolveDatabaseName,
  type DemoEnvironmentCheck,
} from '../../src/config/env';
import {
  DemoDatabaseSecurityError,
  assertDemoDatabase,
  isAllowedDemoDatabase,
} from '../../database/scripts/demo/assert-demo-db';
import { requireDemoMode } from '../../src/middlewares/demo-mode.middleware';
import { DEMO_STEPS } from '../../src/services/demo-scenario.service';
import type { Request, Response, NextFunction } from 'express';

function baseCheck(overrides: Partial<DemoEnvironmentCheck> = {}): DemoEnvironmentCheck {
  return {
    DEMO_MODE: true,
    NODE_ENV: 'demo',
    ENABLE_SCHEDULED_JOBS: false,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/mada_risk_demo',
    DB_NAME: 'mada_risk_demo',
    ...overrides,
  };
}

describe('resolveDatabaseName', () => {
  it('extrait le nom depuis DATABASE_URL', () => {
    expect(
      resolveDatabaseName({ databaseUrl: 'postgresql://u:p@localhost:5432/mada_risk_demo' }),
    ).toBe('mada_risk_demo');
  });

  it('retombe sur DB_NAME si URL illisible', () => {
    expect(resolveDatabaseName({ databaseUrl: 'not a url', dbName: 'custom_demo' })).toBe('custom_demo');
  });
});

describe('isDemoDatabaseName', () => {
  it('accepte une base suffixée _demo', () => {
    expect(isDemoDatabaseName('mada_risk_demo')).toBe(true);
    expect(isDemoDatabaseName('autre_demo')).toBe(true);
  });

  it('refuse la base normale et les suffixes partiels', () => {
    expect(isDemoDatabaseName('mada_risk')).toBe(false);
    expect(isDemoDatabaseName('mada_risk_demo_extra')).toBe(false);
    expect(isDemoDatabaseName('')).toBe(false);
  });
});

describe('demoEnvironmentIssues', () => {
  it('ne retourne rien hors mode démonstration', () => {
    expect(demoEnvironmentIssues(baseCheck({ DEMO_MODE: false, NODE_ENV: 'development' }))).toEqual([]);
  });

  it('accepte une configuration démo cohérente', () => {
    expect(demoEnvironmentIssues(baseCheck())).toEqual([]);
  });

  it('refuse la base mada_risk', () => {
    const issues = demoEnvironmentIssues(
      baseCheck({ DATABASE_URL: 'postgresql://u:p@localhost:5432/mada_risk', DB_NAME: 'mada_risk' }),
    );
    expect(issues.some((i) => i.includes('_demo'))).toBe(true);
  });

  it('refuse un NODE_ENV non demo', () => {
    const issues = demoEnvironmentIssues(baseCheck({ NODE_ENV: 'development' }));
    expect(issues.some((i) => i.includes('NODE_ENV'))).toBe(true);
  });

  it('refuse les jobs planifiés actifs', () => {
    const issues = demoEnvironmentIssues(baseCheck({ ENABLE_SCHEDULED_JOBS: true }));
    expect(issues.some((i) => i.includes('ENABLE_SCHEDULED_JOBS'))).toBe(true);
  });
});

describe('assertDemoDatabase', () => {
  it('accepte mada_risk_demo', () => {
    expect(assertDemoDatabase({ dbName: 'mada_risk_demo' })).toBe('mada_risk_demo');
  });

  it('accepte toute base suffixée _demo', () => {
    expect(assertDemoDatabase({ dbName: 'soutenance_demo' })).toBe('soutenance_demo');
    expect(isAllowedDemoDatabase('soutenance_demo')).toBe(true);
  });

  it('refuse mada_risk', () => {
    expect(() => assertDemoDatabase({ dbName: 'mada_risk' })).toThrow(DemoDatabaseSecurityError);
  });

  it('refuse une base absente', () => {
    expect(() => assertDemoDatabase({ dbName: '' })).toThrow(DemoDatabaseSecurityError);
  });

  it('n’expose jamais les identifiants', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    assertDemoDatabase({ databaseUrl: 'postgresql://secret_user:secret_pass@localhost:5432/mada_risk_demo' });
    const output = spy.mock.calls.flat().join(' ');
    spy.mockRestore();
    expect(output).toContain('mada_risk_demo');
    expect(output).not.toContain('secret_pass');
    expect(output).not.toContain('secret_user');
  });
});

describe('requireDemoMode', () => {
  it('répond 404 (route inexistante) hors mode démonstration', () => {
    const next = vi.fn();
    requireDemoMode({} as Request, {} as Response, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(404);
  });
});

describe('scénario de démonstration', () => {
  it('expose les quatre étapes dans l’ordre attendu', () => {
    expect(DEMO_STEPS.map((s) => s.key)).toEqual(['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE']);
    expect(DEMO_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4]);
  });

  it('utilise les libellés officiels de soutenance', () => {
    expect(DEMO_STEPS[0].label).toBe('Étape 1 — Prévision');
    expect(DEMO_STEPS[1].label).toBe('Étape 2 — Événement actif');
    expect(DEMO_STEPS[2].label).toBe('Étape 3 — Suivi');
    expect(DEMO_STEPS[3].label).toBe('Étape 4 — Bilan et clôture');
  });
});
