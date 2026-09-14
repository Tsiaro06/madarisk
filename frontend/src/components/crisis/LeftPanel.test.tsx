import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { LeftPanel } from './LeftPanel';

const api = vi.hoisted(() => ({
  eventsList: vi.fn(),
  districts: vi.fn(),
  monitoring: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/api', () => ({
  eventsApi: { list: api.eventsList },
  territoriesApi: { districts: api.districts, search: api.search },
  weatherApi: { monitoring: api.monitoring },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const activeEvent = {
  id: 'evt-1',
  eventCode: 'EVT-001',
  name: 'Cyclone',
  type: 'CYCLONE',
  status: 'ACTIF',
  severity: 'ELEVEE',
  description: null,
  sourceName: 'Météo',
  sourceUrl: null,
  startedAt: '2026-04-01T00:00:00.000Z',
  expectedEndAt: null,
  endedAt: null,
  createdBy: 'admin',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-03T12:00:00.000Z',
};

const clotureEvent = {
  ...activeEvent,
  id: 'evt-2',
  eventCode: 'EVT-002',
  name: 'Cyclone ancien',
  status: 'CLOTURE',
};

beforeEach(() => {
  api.eventsList.mockResolvedValue({
    data: [activeEvent, clotureEvent],
    meta: { total: 2, page: 1, totalPages: 1, limit: 12 },
  });
  api.districts.mockResolvedValue({
    data: [{ id: 'd1', name: 'Analamanga', adminCode: 'A01', population: 3_000_000 }],
    meta: {},
  });
  api.monitoring.mockResolvedValue({
    generatedAt: '2026-04-03T12:00:00.000Z',
    sync: {
      observations: { status: 'FRESH', lastDataAt: '2026-04-03T11:45:00.000Z', communesData: 100 },
      forecasts: { status: 'FRESH', lastDataAt: '2026-04-03T11:45:00.000Z', communesData: 100 },
    },
    sources: [],
  });
  api.search.mockResolvedValue([]);
});

describe('LeftPanel', () => {
  it('affiche le filtre zone (district)', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    expect(await screen.findByText('Analamanga')).toBeInTheDocument();
    expect(screen.getByText('Zone')).toBeInTheDocument();
  });

  it('filtre par défaut sur les statuts En cours', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    await screen.findByText('Événements (1)');
    expect(screen.getByText('Cyclone', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Cyclone ancien')).not.toBeInTheDocument();
  });

  it('affiche la dernière mise à jour des événements', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Dernière mise à jour/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Fraîches/)).toBeInTheDocument();
  });
});

const defaultProps = {
  activeEventId: 'evt-1',
  onSelectEvent: vi.fn(),
  onSelectCommune: vi.fn(),
  onClose: vi.fn(),
};