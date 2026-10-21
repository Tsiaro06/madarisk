import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { RisquesPage } from './RisquesPage';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

const api = vi.hoisted(() => ({
  priorityDetailed: vi.fn(),
  mapLayer: vi.fn(),
  recalculate: vi.fn(),
  listEvents: vi.fn(),
  listDistricts: vi.fn(),
}));

vi.mock('@/api', () => ({
  risksApi: {
    priorityDetailed: api.priorityDetailed,
    mapLayer: api.mapLayer,
    recalculate: api.recalculate,
  },
  eventsApi: { list: api.listEvents },
  territoriesApi: { districts: api.listDistricts },
}));

// La carte Leaflet n'est pas l'objet du test : on la remplace par un témoin qui
// expose le nombre de communes reçues.
vi.mock('@/components/maps/GeoJsonMap', () => ({
  GeoJsonMap: ({ data }: { data?: { features: unknown[] } | null }) => (
    <div data-testid="map">{data?.features.length ?? 0}</div>
  ),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <RisquesPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  roleState.role = 'ADMIN';
  api.listEvents.mockResolvedValue({ data: [], meta: undefined });
  api.listDistricts.mockResolvedValue({ data: [], meta: undefined });
  api.priorityDetailed.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  api.mapLayer.mockResolvedValue({ type: 'FeatureCollection', features: [] });
  api.recalculate.mockResolvedValue({ phase: 'PENDANT', totalCommunes: 0 });
});

describe('RisquesPage — couverture et états vides', () => {
  it('affiche un état vide explicite quand aucune commune n est évaluée', async () => {
    renderPage();
    expect(
      await screen.findByText(/Aucune évaluation de risque enregistrée/i),
    ).toBeInTheDocument();
  });

  it('affiche la couverture réelle et la liste des communes prioritaires', async () => {
    api.priorityDetailed.mockResolvedValue({
      data: [
        {
          communeId: 'c1',
          communeCode: 'C1',
          communeName: 'Ambanizana',
          districtId: 'd1',
          districtName: 'Maroantsetra',
          riskScore: 82,
          riskLevel: 'EXTREME',
          displayLevel: 'EXTRÊME',
          color: '#DC2626',
          population: 12000,
          assessedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1579, totalPages: 79 },
    });
    api.mapLayer.mockResolvedValue({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: null }],
    });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Ambanizana' })).toBeInTheDocument();
    // La couverture provient du meta.total, pas seulement des 20 lignes affichées.
    expect(await screen.findByText(/1\s?579 commune\(s\) évaluée\(s\)/i)).toBeInTheDocument();
  });

  it('distingue « aucun résultat pour ces filtres » d une absence de données', async () => {
    api.priorityDetailed.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 1579, totalPages: 79 },
    });

    const user = userEvent.setup();
    renderPage();

    // Aucun filtre : pas de message « filtré ».
    await waitFor(() =>
      expect(screen.queryByText(/Aucun résultat pour ces filtres/i)).not.toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText('Niveau'), 'EXTREME');

    expect(
      await screen.findByText(/Aucun résultat pour ces filtres/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Aucune évaluation de risque enregistrée/i)).not.toBeInTheDocument();
  });
});

describe('RisquesPage — recalcul', () => {
  it('recalcule en périmètre global quand aucun événement ni district n est choisi', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Actions exceptionnelles/ }));
    await user.click(await screen.findByRole('button', { name: /Relancer le calcul/i }));

    await waitFor(() => expect(api.recalculate).toHaveBeenCalledTimes(1));
    expect(api.recalculate).toHaveBeenCalledWith({
      eventId: undefined,
      districtId: undefined,
      phase: 'PENDANT',
    });
  });
});
