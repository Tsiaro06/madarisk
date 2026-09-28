import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { RightPanel } from './RightPanel';
import type { CommuneDetail, ExposedCommuneInfo } from '@/types';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

const api = vi.hoisted(() => ({
  risksCommune: vi.fn(),
  risksRecalc: vi.fn(),
  weatherLatest: vi.fn(),
  weatherForecast: vi.fn(),
  weatherHistory: vi.fn(),
  weatherRefresh: vi.fn(),
  reportsCsv: vi.fn(),
}));

vi.mock('@/api', () => ({
  risksApi: { commune: api.risksCommune, recalculate: api.risksRecalc },
  weatherApi: {
    latest: api.weatherLatest,
    forecast: api.weatherForecast,
    history: api.weatherHistory,
    refresh: api.weatherRefresh,
  },
  reportsApi: { exportCsv: api.reportsCsv },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const communeDetail = {
  commune: {
    id: 'c1',
    adminCode: '101',
    name: 'Antananarivo',
    normalizedName: 'tanana',
    postalCode: null,
    population: 100_000,
    vulnerabilityScore: 75,
    centroid: { type: 'Point', coordinates: [47.53, -18.91] },
  },
  district: { id: 'd1', adminCode: 'A01', name: 'Analamanga', normalizedName: 'a' },
  geometry: null,
  weather: null,
  risk: null,
  events: [
    {
      id: 'evt-1',
      eventCode: 'EVT-001',
      name: 'Cyclone',
      type: 'CYCLONE',
      status: 'ACTIF',
      startedAt: '2026-04-01T00:00:00.000Z',
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ],
} as unknown as CommuneDetail;

const exposure: ExposedCommuneInfo = {
  communeId: 'c1',
  communeCode: '101',
  communeName: 'Antananarivo',
  districtName: 'Analamanga',
  population: 100_000,
  exposedPopulation: 30_000,
  overlapPercent: 62.5,
  distanceToTrackKm: 12.3,
  isInsideInfluenceArea: true,
  sourceType: 'TRAJECTOIRE',
  dataType: 'REEL',
  riskLevel: 'ELEVE',
  riskScore: 78,
  updatedAt: '2026-04-03T12:00:00.000Z',
};

function renderPanel() {
  return render(
    <RightPanel
      communeId="c1"
      detail={communeDetail}
      detailLoading={false}
      hasEvent={true}
      exposure={exposure}
      onClose={vi.fn()}
      onSelectEvent={vi.fn()}
    />,
    { wrapper },
  );
}

async function expandAllInterventionPanels(user: ReturnType<typeof userEvent.setup>) {
  let guard = 0;
  while (guard < 10) {
    const collapsed = screen
      .getAllByRole('button', { name: 'Intervention administrative' })
      .find((el) => el.getAttribute('aria-expanded') === 'false');
    if (!collapsed) return;
    await user.click(collapsed);
    guard += 1;
  }
}

beforeEach(() => {
  roleState.role = 'ADMIN';
  api.risksCommune.mockResolvedValue({
    riskLevel: 'ELEVE',
    riskScore: 78,
    phase: 'PENDANT',
    assessedAt: '2026-04-02T00:00:00.000Z',
    modelVersion: 'v1',
    factors: {
      rainScore: 80,
      windScore: 50,
      proximityScore: 70,
      vulnerabilityScore: 65,
      exposureScore: 90,
    },
    explanation: [],
  });
  api.weatherLatest.mockResolvedValue({
    temperatureC: 24,
    precipitationMm: 0,
    windSpeedKmh: 15,
    humidityPercent: 70,
    observedAt: '2026-04-03T11:45:00.000Z',
  });
  api.weatherForecast.mockResolvedValue({
    timezone: 'Indian/Antananarivo',
    hourly: { time: [], temperatureC: [], precipitationMm: [] },
  });
  api.weatherHistory.mockResolvedValue({ data: [], meta: {} });
});

describe('RightPanel — interventions administratives', () => {
  it("CLIENT et ANALYSTE_SIG ne voient jamais l'intervention administrative", async () => {
    for (const role of ['CLIENT', 'ANALYSTE_SIG'] as const) {
      roleState.role = role;
      const { unmount } = renderPanel();
      await screen.findByText('Antananarivo');
      expect(screen.queryByText('Intervention administrative')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("ADMIN voit la connexe synchronisation et le recalcul des risques", async () => {
    const user = userEvent.setup();
    roleState.role = 'ADMIN';
    renderPanel();
    await screen.findByText('Antananarivo');
    await expandAllInterventionPanels(user);
    expect(
      screen.getByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relancer le calcul des risques/ })).toBeInTheDocument();
  });

  it("la modale s'ouvre au clic sur une action administrative et affiche l'avertissement", async () => {
    const user = userEvent.setup();
    renderPanel();
    await expandAllInterventionPanels(user);
    await user.click(
      screen.getByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Cette action exceptionnelle peut modifier des données générées automatiquement\. Vérifiez la source avant de continuer\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Cette intervention est soumise à la traçabilité disponible côté système\./),
    ).toBeInTheDocument();
  });

  it("annuler ne déclenche aucun appel API", async () => {
    const user = userEvent.setup();
    renderPanel();
    await expandAllInterventionPanels(user);
    await user.click(
      screen.getByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.weatherRefresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("confirmer déclenche exactement un appel API", async () => {
    const user = userEvent.setup();
    api.weatherRefresh.mockResolvedValue({ success: true, message: 'OK' });
    renderPanel();
    await expandAllInterventionPanels(user);
    await user.click(
      screen.getByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmer la synchronisation' }),
    );
    await waitFor(() => expect(api.weatherRefresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("le bouton est désactivé et affiche « Traitement en cours… » pendant la mutation", async () => {
    const user = userEvent.setup();
    api.weatherRefresh.mockImplementation(() => new Promise(() => {}));
    renderPanel();
    await expandAllInterventionPanels(user);
    await user.click(
      screen.getByRole('button', { name: /Relancer la synchronisation de cette commune/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmer la synchronisation' }),
    );
    const confirmButton = within(dialog).getByRole('button', { name: 'Traitement en cours…' });
    expect(confirmButton).toBeDisabled();
    expect(api.weatherRefresh).toHaveBeenCalledTimes(1);
  });

  it("confirmer le recalcul des risques déclenche exactement un appel risksApi.recalculate", async () => {
    const user = userEvent.setup();
    api.risksRecalc.mockResolvedValue({ success: true, message: 'OK' });
    renderPanel();
    await expandAllInterventionPanels(user);
    await user.click(screen.getByRole('button', { name: /Relancer le calcul des risques/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmer le recalcul' }),
    );
    await waitFor(() => expect(api.risksRecalc).toHaveBeenCalledTimes(1));
  });
});