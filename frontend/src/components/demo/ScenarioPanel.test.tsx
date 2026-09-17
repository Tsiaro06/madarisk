import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

const demo = vi.hoisted(() => ({
  scenario: vi.fn(),
  setStep: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/api', () => ({
  demoApi: {
    scenario: demo.scenario,
    setStep: demo.setStep,
    reset: demo.reset,
  },
}));

const config = vi.hoisted(() => ({ DEMO_MODE: true }));

vi.mock('@/config/demo', () => ({
  get DEMO_MODE() {
    return config.DEMO_MODE;
  },
  DEMO_STEP_LABELS: {
    PREVISION: 'Étape 1 — Prévision',
    ACTIF: 'Étape 2 — Événement actif',
    SUIVI: 'Étape 3 — Suivi',
    CLOTURE: 'Étape 4 — Bilan et clôture',
  },
  DEMO_STEP_ORDER: ['PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'],
}));

import { ScenarioPanel } from './ScenarioPanel';

const scenarioState = {
  demoMode: true,
  event: {
    id: 'event-1',
    eventCode: 'DEMO-CYC-ANKARATRA',
    name: 'SCÉNARIO DE DÉMONSTRATION — Cyclone Ankaratra',
    status: 'PREVISION' as const,
    severity: 'ELEVE' as const,
    sourceName: 'SCÉNARIO SOUTENANCE — SIMULÉ',
    sourceUrl: 'simulation://soutenance',
    startedAt: null,
    endedAt: null,
  },
  step: 'PREVISION' as const,
  steps: [],
  counts: { tracks: 3, areas: 2, exposedCommunes: 4, risks: 4, alerts: 1 },
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <ScenarioPanel />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  config.DEMO_MODE = true;
  roleState.role = 'ADMIN';
  demo.scenario.mockResolvedValue(scenarioState);
  demo.setStep.mockResolvedValue({ ...scenarioState, step: 'ACTIF' });
  demo.reset.mockResolvedValue(scenarioState);
});

describe('ScenarioPanel', () => {
  it.each(['CLIENT', 'ANALYSTE_SIG'] as const)(
    'reste invisible pour %s',
    (role) => {
      roleState.role = role;
      renderPanel();
      expect(screen.queryByLabelText('Scénario de soutenance')).not.toBeInTheDocument();
    },
  );

  it('reste invisible hors mode démonstration', () => {
    config.DEMO_MODE = false;
    renderPanel();
    expect(screen.queryByLabelText('Scénario de soutenance')).not.toBeInTheDocument();
    expect(demo.scenario).not.toHaveBeenCalled();
  });

  it('affiche l’étape courante et les compteurs simulés', async () => {
    renderPanel();
    expect(await screen.findByText(/3 points · 2 zones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Étape 2 — Événement actif' })).toBeInTheDocument();
  });

  it('ouvre la modale de confirmation sans appeler l’API', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(/Étape courante/);

    await user.click(screen.getByRole('button', { name: 'Étape 2 — Événement actif' }));

    expect(
      await screen.findByRole('heading', { name: /Afficher : Étape 2 — Événement actif/ }),
    ).toBeInTheDocument();
    expect(demo.setStep).not.toHaveBeenCalled();
    expect(demo.reset).not.toHaveBeenCalled();
  });

  it('annuler ne déclenche aucune requête', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(/Étape courante/);
    await user.click(screen.getByRole('button', { name: 'Étape 2 — Événement actif' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(demo.setStep).not.toHaveBeenCalled();
    expect(demo.reset).not.toHaveBeenCalled();
  });

  it('confirmer une étape déclenche une seule requête', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(/Étape courante/);
    await user.click(screen.getByRole('button', { name: 'Étape 2 — Événement actif' }));
    await user.click(screen.getByRole('button', { name: 'Afficher cette étape' }));

    await waitFor(() => expect(demo.setStep).toHaveBeenCalledTimes(1));
    expect(demo.setStep).toHaveBeenCalledWith('ACTIF');
    expect(demo.reset).not.toHaveBeenCalled();
  });

  it('réinitialise via une confirmation destructive', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(/Étape courante/);
    await user.click(screen.getByRole('button', { name: /Réinitialiser la démonstration/ }));
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));

    await waitFor(() => expect(demo.reset).toHaveBeenCalledTimes(1));
    expect(demo.setStep).not.toHaveBeenCalled();
  });
});
