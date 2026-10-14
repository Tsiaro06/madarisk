import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { RightPanel } from './RightPanel';
import type { CommuneDetail, ExposedCommuneInfo } from '@/types';

const api = vi.hoisted(() => ({
  risksCommune: vi.fn(),
  risksRecalc: vi.fn(),
  weatherLatest: vi.fn(),
  weatherForecast: vi.fn(),
  weatherHistory: vi.fn(),
  weatherRefresh: vi.fn(),
  reportsCsv: vi.fn(),
  communeAlertHistory: vi.fn(),
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
  eventsApi: { communeAlertHistory: api.communeAlertHistory },
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

beforeEach(() => {
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
  api.communeAlertHistory.mockResolvedValue({
    eventId: 'evt-1',
    communeId: 'c1',
    communeName: 'Antananarivo',
    count: 0,
    method: '',
    rows: [],
  });
});

describe('RightPanel', () => {
  it('affiche les données d\'exposition pour une commune exposée', async () => {
    render(
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
    expect(await screen.findByText('Antananarivo')).toBeInTheDocument();
    expect(screen.getByText('Exposition à l\'événement')).toBeInTheDocument();
    expect(screen.getByText('30 000')).toBeInTheDocument();
    expect(screen.getByText(/12,3/)).toBeInTheDocument();
    expect(screen.getByText(/62,5/)).toBeInTheDocument();
    expect(screen.getByText('Distance trajectoire')).toBeInTheDocument();
    expect(screen.getByText('Dans la zone d\'influence')).toBeInTheDocument();
  });

  it('indique que la commune n\'est pas exposée si aucune donnée d\'exposition', async () => {
    render(
      <RightPanel
        communeId="c1"
        detail={communeDetail}
        detailLoading={false}
        hasEvent={true}
        exposure={null}
        onClose={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
      { wrapper },
    );
    expect(await screen.findByText('Antananarivo')).toBeInTheDocument();
    expect(screen.getByText(/n'est pas exposée/)).toBeInTheDocument();
  });

  it("retrace l'historique des alertes cycloniques avec sources et niveaux", async () => {
    const base = {
      communeId: 'c1',
      communeName: 'Antananarivo',
      communeCode: '101',
      districtId: 'd1',
      districtName: 'Analamanga',
      sourceUrl: null,
      confidence: null,
    };
    api.communeAlertHistory.mockResolvedValue({
      eventId: 'evt-1',
      communeId: 'c1',
      communeName: 'Antananarivo',
      count: 2,
      method: '',
      rows: [
        {
          ...base,
          alertLevel: 'ROUGE',
          validFrom: '2022-02-04T00:00:00.000Z',
          validTo: '2022-02-08T00:00:00.000Z',
          infoType: 'ESTIMATION',
          territoryScope: 'REGION',
          sourceName: 'Bulletin Météo Madagascar du 4 février 2022',
          comment: 'Niveau hérité de la région.',
          activeAt: true,
        },
        {
          ...base,
          alertLevel: 'BLEU',
          validFrom: '2022-02-08T00:00:00.000Z',
          validTo: '2022-02-11T00:00:00.000Z',
          infoType: 'ESTIMATION',
          territoryScope: 'COMMUNE',
          sourceName: 'Bulletin Météo Madagascar du 4 février 2022',
          comment: null,
          activeAt: false,
        },
      ],
    });

    render(
      <RightPanel
        communeId="c1"
        detail={communeDetail}
        detailLoading={false}
        hasEvent
        exposure={null}
        onClose={vi.fn()}
        onSelectEvent={vi.fn()}
        activeEventId="evt-1"
        alertAt="2022-02-05T12:00:00.000Z"
      />,
      { wrapper },
    );

    expect(await screen.findByText('Historique des alertes cycloniques')).toBeInTheDocument();
    expect(screen.getByText('Rouge')).toBeInTheDocument();
    expect(screen.getByText('Bleu')).toBeInTheDocument();
    // La ligne active est mise en évidence, l'autre non.
    expect(screen.getByText("Active à l'instant consulté")).toBeInTheDocument();
    // Nature + échelle, source et commentaire affichés pour la traçabilité.
    expect(screen.getByText(/Estimation spatiale · échelle Région/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Bulletin Météo Madagascar du 4 février 2022/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Niveau hérité de la région.')).toBeInTheDocument();
    // Les deux lignes sont des estimations spatiales : signalées comme telles.
    expect(screen.getAllByText(/Niveau estimé \(hérité/)).toHaveLength(2);
  });

  it("n'affiche pas d'historique d'alerte sans données documentées", async () => {
    render(
      <RightPanel
        communeId="c1"
        detail={communeDetail}
        detailLoading={false}
        hasEvent
        exposure={null}
        onClose={vi.fn()}
        onSelectEvent={vi.fn()}
        activeEventId="evt-1"
        alertAt="2022-02-05T12:00:00.000Z"
      />,
      { wrapper },
    );

    expect(await screen.findByText('Antananarivo')).toBeInTheDocument();
    expect(screen.queryByText('Historique des alertes cycloniques')).toBeNull();
  });
});