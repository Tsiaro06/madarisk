import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { CrisisMap } from './CrisisMap';
import type { EventListItem, EventTrack } from '@/types';
import { trackStyle, riskStyle, communeStyle } from '@/lib/crisisStyles';
import { RISK_COLORS } from '@/types';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'map' }, children),
    TileLayer: () => null,
    GeoJSON: ({ data }: { data: unknown }) =>
      React.createElement('div', {
        'data-testid': 'geojson',
        'data-features':
          data && typeof data === 'object' && 'features' in data
            ? (data as FeatureCollection).features.length
            : 0,
      }),
    CircleMarker: () => React.createElement('div', { 'data-testid': 'track-point' }),
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', null, children),
    ZoomControl: ({ position }: { position?: string }) =>
      React.createElement('div', { 'data-testid': 'zoom-control', 'data-position': position }),
    useMap: () => ({}),
  };
});

const activeEvent = {
  id: 'evt-1',
  eventCode: 'EVT-001',
  name: 'Cyclone Batsirai',
  type: 'CYCLONE',
  status: 'ACTIF',
  severity: 'ELEVEE',
  description: null,
  sourceName: 'Météo-France',
  sourceUrl: null,
  startedAt: '2026-04-01T00:00:00.000Z',
  expectedEndAt: '2026-04-05T00:00:00.000Z',
  endedAt: null,
  createdBy: 'admin',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-03T12:00:00.000Z',
} satisfies EventListItem;

const defaultProps = {
  riskLayer: null,
  communeLayer: null,
  districtLayer: null,
  weatherLayer: null,
  trackLayer: null,
  trackPoints: [] as EventTrack[],
  areasLayer: null,
  exposedCommuneIds: new Set<string>(),
  activeEvent,
  selectedCommuneId: null,
  onCommuneClick: vi.fn(),
  focusTarget: null,
  mapPhase: '',
  onMapPhaseChange: vi.fn(),
  onRefresh: undefined as (() => void) | undefined,
  refreshing: false,
};

function renderMap(props: Partial<typeof defaultProps> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <CrisisMap {...defaultProps} {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CrisisMap', () => {
  it('replie la légende derrière un bouton et la déplie au clic', async () => {
    const user = userEvent.setup();
    renderMap(defaultProps);

    const toggle = screen.getByRole('button', { name: 'Afficher la légende' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Masquer la légende' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText("Commune exposée à l'événement sélectionné")).toBeInTheDocument();
    expect(screen.getByText('Trajectoire observée')).toBeInTheDocument();
    expect(screen.getByText('Trajectoire prévue')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Masquer la légende' }));

    expect(screen.getByRole('button', { name: 'Afficher la légende' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('replie les couches derrière un bouton et les déplie au clic', async () => {
    const user = userEvent.setup();
    renderMap(defaultProps);

    const toggle = screen.getByRole('button', { name: 'Afficher les couches' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Masquer les couches' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Districts')).toBeInTheDocument();
    expect(screen.getByText('Météo')).toBeInTheDocument();
    expect(screen.getByText('Événement actif')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Masquer les couches' }));

    expect(screen.getByRole('button', { name: 'Afficher les couches' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('ferme les couches au clic extérieur', async () => {
    const user = userEvent.setup();
    renderMap(defaultProps);

    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    expect(screen.getByRole('button', { name: 'Masquer les couches' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByTestId('map'));

    expect(screen.getByRole('button', { name: 'Afficher les couches' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('active le toggle communes exposées par défaut quand il y a un événement', () => {
    renderMap(defaultProps);
    const label = screen.getByText('Communes exposées');
    const checkbox = label.closest('label')?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeChecked();
  });

  it('place le zoom en bas à droite et les actions en haut à droite', () => {
    const { container } = renderMap({
      ...defaultProps,
      onRefresh: vi.fn(),
      refreshing: true,
    });

    // Le zoom est le contrôle natif Leaflet : on vérifie sa position demandée.
    expect(screen.getByTestId('zoom-control')).toHaveAttribute('data-position', 'bottomright');

    // Actualiser et Recentrer partagent le coin haut-droit, avec les couches.
    const refresh = screen.getByRole('button', { name: /Actualiser/ });
    const topRight = refresh.closest('.absolute');
    expect(topRight).toHaveClass('right-3', 'top-3');
    expect(topRight).toContainElement(screen.getByRole('button', { name: 'Afficher les couches' }));

    // Plus rien en bas à droite : ce coin est au zoom.
    expect(container.querySelector('.bottom-3.right-3')).toBeNull();
  });
});

describe('trackStyle', () => {
  it('applique une ligne pleine pour OBSERVEE', () => {
    const style = trackStyle({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      properties: { trackType: 'OBSERVEE', pointCount: 2, startedAt: '', endedAt: '' },
    });
    expect(style.color).toBe('#5a7d90');
    expect(style.dashArray).toBeUndefined();
  });

  it('applique des pointillés pour PREVUE', () => {
    const style = trackStyle({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      properties: { trackType: 'PREVUE', pointCount: 2, startedAt: '', endedAt: '' },
    });
    expect(style.color).toBe('#c47d4a');
    expect(style.dashArray).toBe('8 6');
  });
});

describe('riskStyle', () => {
  it('colore une commune exposée avec une bordure foncée épaisse', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { communeId: 'cm-1', riskLevel: 'ELEVE', riskScore: 72 },
    };
    const style = riskStyle(feature, null, new Set(['cm-1']));
    expect(style.color).toBe('#475569');
    expect(style.weight).toBe(2);
    expect(style.fillColor).toBe(RISK_COLORS['ELEVE']);
    expect(style.fillOpacity).toBe(0.48);
  });

  it('utilise gris pour les communes sans niveau de risque', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { communeId: 'cm-2' },
    };
    const style = riskStyle(feature, null, new Set());
    expect(style.fillColor).toBe('#94a3b8');
  });

  it('met en surbrillance la commune sélectionnée', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { communeId: 'cm-3', riskLevel: 'FAIBLE' },
    };
    const style = riskStyle(feature, 'cm-3', new Set(['cm-3']));
    expect(style.fillOpacity).toBe(0.72);
    expect(style.weight).toBe(3.5);
  });
});

describe('communeStyle', () => {
  it('applique faible opacité sans événement actif', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { communeId: 'cm-4' },
    };
    const style = communeStyle(feature, null, false);
    expect(style.fillOpacity).toBe(0.04);
    expect(style.color).toBe('#94a3b8');
  });
});