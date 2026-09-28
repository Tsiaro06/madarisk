import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { ActiveEventProvider } from '@/stores/activeEvent';
import { LeftPanel } from './LeftPanel';

const api = vi.hoisted(() => ({
  eventsList: vi.fn(),
  eventsGet: vi.fn(),
  districts: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/api', () => ({
  eventsApi: { list: api.eventsList, get: api.eventsGet },
  territoriesApi: { districts: api.districts, search: api.search },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <ActiveEventProvider>{children}</ActiveEventProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
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
  api.eventsGet.mockResolvedValue(activeEvent);
  api.districts.mockResolvedValue({
    data: [{ id: 'd1', name: 'Analamanga', adminCode: 'A01', population: 3_000_000 }],
    meta: {},
  });
  api.search.mockResolvedValue([]);
});

const defaultProps = {
  activeEventId: 'evt-1',
  onSelectEvent: vi.fn(),
  onSelectCommune: vi.fn(),
  onClose: vi.fn(),
};

describe('LeftPanel', () => {
  it('montre d’abord la liste, filtres repliés', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    expect(await screen.findByText('1 en cours')).toBeInTheDocument();
    expect(screen.getByText('Cyclone', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Cyclone ancien')).not.toBeInTheDocument();
    expect(screen.queryByText('Analamanga')).not.toBeInTheDocument();
  });

  it('ouvre les filtres pour afficher la zone (district)', async () => {
    const user = userEvent.setup();
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    await screen.findByText('1 en cours');
    await user.click(screen.getByRole('button', { name: /Filtres/i }));
    expect(await screen.findByText('Analamanga')).toBeInTheDocument();
  });

  it('filtre par défaut sur les statuts En cours', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    await screen.findByText('1 en cours');
    expect(screen.getByText('Cyclone', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Cyclone ancien')).not.toBeInTheDocument();
  });

  it('affiche le sélecteur pleine largeur et le bouton détails en dessous', async () => {
    render(<LeftPanel districtId="" onDistrictChange={vi.fn()} {...defaultProps} />, { wrapper });
    expect(await screen.findByText('Événement à suivre')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Détails de l’événement/i })).toHaveAttribute(
      'href',
      '/evenements/evt-1',
    );
  });
});
