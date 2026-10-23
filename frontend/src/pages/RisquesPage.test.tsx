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
    meta: { page: 1, limit: 20, total: 0, totalPages: 0, coverageTotal: 0 },
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
      meta: { page: 1, limit: 20, total: 1579, totalPages: 79, coverageTotal: 1579 },
    });
    api.mapLayer.mockResolvedValue({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: null }],
    });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Ambanizana' })).toBeInTheDocument();
    // La couverture provient du meta (globale), pas seulement des 20 lignes affichées.
    expect(await screen.findByText(/1\s?579 commune\(s\) évaluée\(s\)/i)).toBeInTheDocument();
  });

  it('distingue « aucune évaluation pour ces filtres » d une absence de données', async () => {
    // Le backend compte désormais les communes filtrées dans `total` et laisse
    // la couverture globale dans `coverageTotal`.
    api.priorityDetailed.mockImplementation(async (params?: { riskLevel?: string }) => ({
      data: [],
      meta:
        params?.riskLevel === 'EXTREME'
          ? { page: 1, limit: 20, total: 0, totalPages: 0, coverageTotal: 1577 }
          : { page: 1, limit: 20, total: 1577, totalPages: 79, coverageTotal: 1577 },
    }));

    const user = userEvent.setup();
    renderPage();

    // Aucun filtre : pas de message « filtré ».
    await waitFor(() =>
      expect(screen.queryByText(/Aucune évaluation pour ces filtres/i)).not.toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText('Niveau'), 'EXTREME');

    expect(
      await screen.findByText(/Aucune évaluation pour ces filtres/i),
    ).toBeInTheDocument();
    // La couverture globale reste annoncée, mais sans prétendre qu'elle est filtrée.
    expect(
      screen.getByText(/1\s?577 commune\(s\) sont évaluées pour d'autres événements ou phases/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pourtant évaluées/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucune évaluation de risque enregistrée/i)).not.toBeInTheDocument();
  });

  it('explique qu un événement clôturé n a aucune évaluation', async () => {
    api.listEvents.mockResolvedValue({
      data: [
        {
          id: 'ev-closed',
          eventCode: 'CY-2022',
          name: 'Cyclone Batsirai — février 2022',
          status: 'CLOTURE',
        },
      ],
      meta: undefined,
    });
    api.priorityDetailed.mockImplementation(async (params?: { eventId?: string }) => ({
      data: [],
      meta: params?.eventId
        ? { page: 1, limit: 20, total: 0, totalPages: 0, coverageTotal: 1577 }
        : { page: 1, limit: 20, total: 1577, totalPages: 79, coverageTotal: 1577 },
    }));

    const user = userEvent.setup();
    renderPage();

    // Attendre que la liste d'événements soit chargée avant de sélectionner.
    await screen.findByRole('option', { name: /Cyclone Batsirai/ });
    await user.selectOptions(screen.getByLabelText('Événement'), 'ev-closed');

    expect(await screen.findByText(/événement est clôturé/i)).toBeInTheDocument();
    expect(screen.queryByText(/pourtant évaluées/i)).not.toBeInTheDocument();
  });

  it('transmet la phase au backend pour garder liste et carte alignées', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Phase'), 'AVANT');

    await waitFor(() =>
      expect(api.priorityDetailed).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'AVANT' }),
      ),
    );
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
