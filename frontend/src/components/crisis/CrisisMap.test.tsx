import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { CrisisMap } from './CrisisMap';
import type { EventListItem, TrackStatePoint } from '@/types';
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
    Marker: ({
      children,
      position,
      title,
      icon,
      interactive,
    }: {
      children?: React.ReactNode;
      position?: [number, number];
      title?: string;
      icon?: { options?: { html?: string } };
      interactive?: boolean;
    }) => {
      const html = typeof icon?.options?.html === 'string' ? icon.options.html : '';
      // L'étiquette du rayon est le second marqueur (non interactif) du cyclone :
      // elle est rendue à part pour que les deux marqueurs restent distincts.
      if (interactive === false) {
        return React.createElement('div', {
          'data-testid': 'cyclone-radius-label',
          dangerouslySetInnerHTML: { __html: html },
        });
      }
      return React.createElement(
        'div',
        {
          'data-testid': 'cyclone-marker',
          'data-lat': position ? String(position[0]) : '',
          'data-lng': position ? String(position[1]) : '',
          'data-title': title ?? '',
        },
        children,
      );
    },
    Circle: ({
      pathOptions,
    }: {
      pathOptions?: { fillOpacity?: number; dashArray?: string; className?: string };
    }) => {
      // Deux familles de cercles : l'anneau de la lecture animée (contour
      // pointillé) et les cercles de l'emprise documentée (sans contour).
      if (pathOptions?.className === 'madarisk-wind-swath') {
        return React.createElement('div', { 'data-testid': 'wind-swath-circle' });
      }
      return React.createElement('div', {
        'data-testid': 'cyclone-radius',
        'data-fill-opacity': String(pathOptions?.fillOpacity ?? ''),
        'data-dash-array': pathOptions?.dashArray ?? '',
      });
    },
    Popup: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popup' }, children),
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
  riskLayer: null as FeatureCollection | null,
  communeLayer: null as FeatureCollection | null,
  districtLayer: null as FeatureCollection | null,
  communesAreExposed: false,
  weatherLayer: null as FeatureCollection | null,
  trackLayer: null,
  trackPoints: [] as TrackStatePoint[],
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

/** Point de trajectoire complet (tous les champs requis par TrackStatePoint). */
function makeTrackPoint(
  id: string,
  trackType: 'OBSERVEE' | 'PREVUE',
  observedAt: string,
  latitude: number,
  longitude: number,
  radius: Partial<Pick<TrackStatePoint, 'radius34ktKm' | 'radius50ktKm' | 'radiusMeasureType'>> = {},
): TrackStatePoint {
  return {
    id,
    eventId: 'evt-1',
    observedAt,
    forecastFor: null,
    trackType,
    latitude,
    longitude,
    windSpeedKmh: 140,
    gustSpeedKmh: null,
    pressureHpa: 950,
    precipitationMm: null,
    movementDirection: '220°',
    movementSpeedKmh: 20,
    createdAt: '2026-04-01T00:00:00.000Z',
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusMaxKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    radiusQuality: null,
    dataQuality: null,
    confidence: null,
    ...radius,
  };
}

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

  it('nomme la couche « Communes exposées » quand l’exposition est calculée', () => {
    renderMap({ ...defaultProps, communesAreExposed: true });
    const label = screen.getByText('Communes exposées');
    const checkbox = label.closest('label')?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeChecked();
  });

  it('retombe sur « Limites communales » sans exposition calculée', () => {
    renderMap(defaultProps);
    const label = screen.getByText('Limites communales');
    const checkbox = label.closest('label')?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeChecked();
  });

  it('dessine les limites communales administratives fournies en repli', () => {
    const limits: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { communeId: 'c1', commune: 'Mananjary' },
          geometry: { type: 'Point', coordinates: [48.0, -20.0] },
        },
      ],
    };
    renderMap({ ...defaultProps, communeLayer: limits, communesAreExposed: false });

    expect(screen.getByTestId('geojson')).toHaveAttribute('data-features', '1');
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

describe('marqueur cyclonique animé (trajectoire observée)', () => {
  beforeEach(() => {
    // Lecture visuelle désactivée en test : pas de rAF, positions déterministes.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  it('ancre le marqueur sur le premier point observé', () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
    });

    const marker = screen.getByTestId('cyclone-marker');
    expect(marker).toHaveAttribute('data-lat', '-20.5');
    expect(marker).toHaveAttribute('data-lng', '49.2');
    expect(marker.getAttribute('data-title')).toContain('Cyclone Batsirai');
  });

  it("n'affiche aucun centre animé sans point observé", () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'PREVUE', '2026-04-02T00:00:00.000Z', -20.5, 49.2),
      ],
    });

    expect(screen.queryByTestId('cyclone-marker')).toBeNull();
  });

  it('dessine la zone d\'influence quand un rayon de vent est documenté', () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
          radius50ktKm: 164.8,
          radiusMeasureType: 'Rayon maximal des 4 quadrants',
        }),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
    });

    const circle = screen.getByTestId('cyclone-radius');
    // La zone d'influence doit rester lisible : anneau rempli + contour pointillé.
    expect(Number(circle.getAttribute('data-fill-opacity'))).toBeGreaterThanOrEqual(0.1);
    expect(circle.getAttribute('data-dash-array')).not.toBe('');
  });

  it('ne dessine aucune zone d\'influence sans rayon documenté', () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
    });

    expect(screen.queryByTestId('cyclone-radius')).toBeNull();
  });

  it("dessine l'emprise des vents avec les seuls points qui publient un rayon", () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
        // Point muet : aucune emprise inventée pour lui.
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
        makeTrackPoint('p3', 'OBSERVEE', '2026-04-01T12:00:00.000Z', -21.4, 47.6, {
          radius50ktKm: 164.8,
        }),
      ],
    });

    // Une emprise d'ensemble (2 cercles documentés) + l'anneau de la lecture animée.
    expect(screen.getAllByTestId('wind-swath-circle')).toHaveLength(2);
    expect(screen.getAllByTestId('cyclone-radius')).toHaveLength(1);
  });

  it("masque l'emprise des vents et la retire de la légende", async () => {
    const user = userEvent.setup();
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
      ],
    });

    expect(screen.getByText(/Emprise documentée des vents/)).toBeTruthy();
    expect(screen.getAllByTestId('wind-swath-circle')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    await user.click(
      screen.getByRole('checkbox', { name: /Emprise des vents/ }) as HTMLInputElement,
    );

    expect(screen.queryAllByTestId('wind-swath-circle')).toHaveLength(0);
    expect(screen.queryByText(/Emprise documentée des vents/)).toBeNull();
    // L'anneau de la lecture animée reste affiché : seule l'emprise d'ensemble part.
    expect(screen.getByTestId('cyclone-radius')).toBeTruthy();
  });

  it("désactive la couche d'emprise quand aucune source ne publie de rayon", async () => {
    const user = userEvent.setup();
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    expect(
      screen.getByRole('checkbox', { name: /Emprise des vents/ }) as HTMLInputElement,
    ).toBeDisabled();
    expect(screen.queryAllByTestId('wind-swath-circle')).toHaveLength(0);
  });

  it('n\'annonce la zone d\'influence en légende que si un rayon est documenté', () => {
    const { unmount } = renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
      ],
    });
    expect(screen.getByText(/rayon de vent documenté/i)).toBeInTheDocument();
    unmount();

    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
      ],
    });
    expect(screen.queryByText(/rayon de vent documenté/i)).toBeNull();
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