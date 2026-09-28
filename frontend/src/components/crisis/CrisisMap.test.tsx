import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
};

function renderMap(props: typeof defaultProps) {
  return render(
    <MemoryRouter>
      <CrisisMap {...props} />
    </MemoryRouter>,
  );
}

describe('CrisisMap', () => {
  it('affiche la légende avec les couches attendues', () => {
    renderMap(defaultProps);
    expect(screen.getByText('Légende')).toBeInTheDocument();
    expect(screen.getByText('Commune exposée à l\'événement sélectionné')).toBeInTheDocument();
    expect(screen.getByText('Trajectoire observée')).toBeInTheDocument();
    expect(screen.getByText('Trajectoire prévue')).toBeInTheDocument();
  });

  it('affiche les contrôles de couches incluant Districts', () => {
    renderMap(defaultProps);
    expect(screen.getByText('Couches')).toBeInTheDocument();
    expect(screen.getByText('Districts')).toBeInTheDocument();
    expect(screen.getByText('Météo')).toBeInTheDocument();
    expect(screen.getByText('Événement actif')).toBeInTheDocument();
  });

  it('active le toggle communes exposées par défaut quand il y a un événement', () => {
    renderMap(defaultProps);
    const label = screen.getByText('Communes exposées');
    const checkbox = label.closest('label')?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeChecked();
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
    expect(style.fillOpacity).toBe(0.55);
    expect(style.weight).toBe(2.5);
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