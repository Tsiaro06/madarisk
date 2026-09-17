import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import type { EventListItem } from '@/types';
import { EvenementDetailPage } from './EvenementDetailPage';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

vi.mock('@/stores/activeEvent', () => ({
  useActiveEvent: () => ({
    activeEventId: 'e1',
    setActiveEventId: vi.fn(),
    activeEvent: null,
    activeEventLoading: false,
  }),
}));

vi.mock('@/components/maps/GeoJsonMap', () => ({
  GeoJsonMap: () => null,
}));

vi.mock('@/components/maps/PolygonDrawMap', () => ({
  PolygonDrawMap: ({
    points,
    onChange,
  }: {
    points: [number, number][];
    onChange: (updater: (prev: [number, number][]) => [number, number][]) => void;
  }) => (
    <button type="button" onClick={() => onChange((prev) => [...prev, [-18.9, 47.5]])}>
      {`dessiner-${points.length}`}
    </button>
  ),
}));

const api = vi.hoisted(() => ({
  get: vi.fn(),
  trackGeoJson: vi.fn(),
  areas: vi.fn(),
  exposedCommunes: vi.fn(),
  mapLayer: vi.fn(),
  addTrack: vi.fn(),
  calculateArea: vi.fn(),
  createPolygonArea: vi.fn(),
  updateStatus: vi.fn(),
  calculateExposure: vi.fn(),
  recalculateRisks: vi.fn(),
  deleteArea: vi.fn(),
  removeExposedCommune: vi.fn(),
  reportEvent: vi.fn(),
  reportDashboard: vi.fn(),
  reportCsv: vi.fn(),
  reportPdf: vi.fn(),
}));

vi.mock('@/api', () => ({
  eventsApi: {
    get: api.get,
    trackGeoJson: api.trackGeoJson,
    areas: api.areas,
    exposedCommunes: api.exposedCommunes,
    addTrack: api.addTrack,
    calculateArea: api.calculateArea,
    createPolygonArea: api.createPolygonArea,
    updateStatus: api.updateStatus,
    calculateExposure: api.calculateExposure,
    recalculateRisks: api.recalculateRisks,
    deleteArea: api.deleteArea,
    removeExposedCommune: api.removeExposedCommune,
  },
  risksApi: { mapLayer: api.mapLayer },
  reportsApi: {
    event: api.reportEvent,
    dashboard: api.reportDashboard,
    exportCsv: api.reportCsv,
    exportPdf: api.reportPdf,
  },
}));

const event: EventListItem = {
  id: 'e1',
  eventCode: 'CY-2026-001',
  name: 'Cyclone test',
  type: 'CYCLONE',
  status: 'ACTIF',
  severity: 'ELEVEE',
  description: null,
  sourceName: null,
  sourceUrl: null,
  startedAt: null,
  expectedEndAt: null,
  endedAt: null,
  createdBy: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

const tracks: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [47.5, -18.9] },
      properties: { trackType: 'OBSERVEE' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [47.6, -18.8] },
      properties: { trackType: 'PREVUE' },
    },
  ],
};

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/evenements/e1']}>
          <Routes>
            <Route path="/evenements/:id" element={<EvenementDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openAdminPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Intervention administrative/ }));
}

beforeEach(() => {
  roleState.role = 'ADMIN';
  api.get.mockResolvedValue(event);
  api.trackGeoJson.mockResolvedValue(tracks);
  api.areas.mockResolvedValue(empty);
  api.mapLayer.mockResolvedValue(empty);
  api.exposedCommunes.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  api.addTrack.mockResolvedValue(undefined);
  api.calculateArea.mockResolvedValue(undefined);
  api.createPolygonArea.mockResolvedValue(undefined);
});

describe('EvenementDetailPage — actions administratives restantes', () => {
  it.each(['CLIENT', 'ANALYSTE_SIG'] as const)(
    'rend les actions invisibles pour %s',
    async (role) => {
      roleState.role = role;
      renderPage();
      await screen.findByText('Cyclone test');
      expect(screen.queryByText('Intervention administrative')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ajouter le point' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Relancer le calcul de zone' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Définir la zone/ }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    'affiche les actions autorisées pour %s',
    async (role) => {
      const user = userEvent.setup();
      roleState.role = role;
      renderPage();
      await screen.findByText('Cyclone test');
      await openAdminPanel(user);
      expect(screen.getByRole('button', { name: 'Ajouter le point' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Relancer le calcul de zone' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Définir la zone/ })).toBeInTheDocument();
    },
  );

  it('ajoute un point de trajectoire après confirmation, avec un seul appel API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);
    await user.type(screen.getByLabelText('Latitude'), '-18.9');
    await user.type(screen.getByLabelText('Longitude'), '47.5');
    await user.click(screen.getByRole('button', { name: 'Ajouter le point' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /Ajouter un point de trajectoire\s*\?/ }),
    ).toBeInTheDocument();
    expect(api.addTrack).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.addTrack).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Ajouter le point' }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(
      within(confirmDialog).getByRole('button', { name: "Confirmer l'ajout" }),
    );
    await waitFor(() => expect(api.addTrack).toHaveBeenCalledTimes(1));
  });

  it('relance le calcul de zone après confirmation, avec un seul appel API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);
    await user.click(screen.getByRole('button', { name: 'Relancer le calcul de zone' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /Relancer le calcul de zone\s*\?/ }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Bande tampon/)).toBeInTheDocument();
    expect(api.calculateArea).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.calculateArea).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Relancer le calcul de zone' }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Confirmer le recalcul de zone' }),
    );
    await waitFor(() => expect(api.calculateArea).toHaveBeenCalledTimes(1));
  });

  it('bloque la zone polygonale tant que le dessin est incomplet', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);
    const zoneButton = screen.getByRole('button', { name: /Définir la zone \(0 point\)/ });
    expect(zoneButton).toBeDisabled();
    await user.click(zoneButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createPolygonArea).not.toHaveBeenCalled();
  });

  it('définit la zone polygonale après confirmation, avec un seul appel API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);

    await user.click(screen.getByRole('button', { name: 'dessiner-0' }));
    await user.click(screen.getByRole('button', { name: 'dessiner-1' }));
    await user.click(screen.getByRole('button', { name: 'dessiner-2' }));

    await user.click(screen.getByRole('button', { name: /Définir la zone \(3 points\)/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', {
        name: /Définir une zone polygonale manuelle\s*\?/,
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/3 points dessinés/)).toBeInTheDocument();
    expect(api.createPolygonArea).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.createPolygonArea).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Définir la zone \(3 points\)/ }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Confirmer la zone polygonale' }),
    );
    await waitFor(() => expect(api.createPolygonArea).toHaveBeenCalledTimes(1));
  });

  it('désactive le bouton pendant la mutation', async () => {
    const user = userEvent.setup();
    api.addTrack.mockImplementation(() => new Promise(() => {}));
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter le point' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'ajout" }));
    expect(within(dialog).getByRole('button', { name: 'Traitement en cours…' })).toBeDisabled();
    expect(api.addTrack).toHaveBeenCalledTimes(1);
  });

  it('conserve le formulaire utilisable après une erreur', async () => {
    const user = userEvent.setup();
    api.calculateArea.mockRejectedValue(new ApiClientError('Zone invalide', 422));
    renderPage();
    await screen.findByText('Cyclone test');
    await openAdminPanel(user);
    await user.click(screen.getByRole('button', { name: 'Relancer le calcul de zone' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmer le recalcul de zone' }),
    );
    await waitFor(() => expect(screen.getByText('Zone invalide')).toBeInTheDocument());
    expect(
      await within(dialog).findByRole('button', { name: 'Confirmer le recalcul de zone' }),
    ).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(
      screen.getByRole('button', { name: 'Relancer le calcul de zone' }),
    ).toBeEnabled();
  });
});
