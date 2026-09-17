import type { DemoStep } from '@/types/demo';

/** Mode démonstration activé par VITE_DEMO_MODE=true (fichier .env.demo). */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export const DEMO_EVENT_CODE = 'DEMO-CYC-ANKARATRA';
export const DEMO_EVENT_NAME = 'SCÉNARIO DE DÉMONSTRATION — Cyclone Ankaratra';
export const SIMULATED_SOURCE_NAME = 'SCÉNARIO SOUTENANCE — SIMULÉ';
export const SIMULATED_SOURCE_URL = 'simulation://soutenance';

export const DEMO_STEP_LABELS: Record<DemoStep, string> = {
  PREVISION: 'Étape 1 — Prévision',
  ACTIF: 'Étape 2 — Événement actif',
  SUIVI: 'Étape 3 — Suivi',
  CLOTURE: 'Étape 4 — Bilan et clôture',
};

export const DEMO_STEP_ORDER: DemoStep[] = ['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'];

/** Une valeur de source indique-t-elle une donnée simulée pour la soutenance ? */
export function isSimulatedSource(value?: string | null): boolean {
  if (!value) return false;
  if (value.startsWith('simulation://')) return true;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return normalized.includes('SIMUL');
}

export function isSimulatedEvent(event: {
  eventCode?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
}): boolean {
  if (event.eventCode === DEMO_EVENT_CODE) return true;
  return isSimulatedSource(event.sourceName) || isSimulatedSource(event.sourceUrl);
}
