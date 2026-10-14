import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { CrisisMap, type MapPlayback } from './CrisisMap';
import type {
  EventCommuneAlertRow,
  EventCommuneAlertsSummary,
  EventListItem,
  TrackStatePoint,
} from '@/types';
import {
  trackStyle,
  trackPointStyle,
  riskStyle,
  communeStyle,
  districtStyle,
} from '@/lib/crisisStyles';
import { RISK_COLORS } from '@/types';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'map' }, children),
    TileLayer: () => null,
    GeoJSON: ({
      data,
      interactive,
      style,
    }: {
      data: unknown;
      interactive?: boolean;
      style?: { dashArray?: string };
    }) => {
      // La zone probable est un `Feature` unique : elle est identifiée à part
      // pour que les autres couches GeoJSON restent comptées par `data-features`.
      const payload = data as { type?: string; properties?: Record<string, unknown> } | null;
      if (payload?.type === 'Feature' && payload.properties?.pointCount != null) {
        return React.createElement('div', {
          'data-testid': 'forecast-cone',
          'data-interactive': String(interactive),
        });
      }
      // L'emprise documentée des vents est elle aussi fusionnée en un `Feature`
      // unique (union des disques publiés et de leurs liaisons).
      if (payload?.type === 'Feature' && payload.properties?.documentedPoints != null) {
        return React.createElement('div', {
          'data-testid': 'wind-swath-surface',
          'data-dash': style?.dashArray ?? '',
          'data-interactive': String(interactive),
        });
      }
      return React.createElement('div', {
        'data-testid': 'geojson',
        'data-features':
          data && typeof data === 'object' && 'features' in data
            ? (data as FeatureCollection).features.length
            : 0,
      });
    },
    CircleMarker: ({
      eventHandlers,
      pathOptions,
    }: {
      eventHandlers?: { click?: () => void };
      pathOptions?: { radius?: number };
    }) =>
      React.createElement('div', {
        'data-testid': 'track-point',
        'data-radius': String(pathOptions?.radius ?? ''),
        onClick: eventHandlers?.click,
      }),
    Polygon: () => React.createElement('div', { 'data-testid': 'polygon' }),
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
      // Seul cercle de la salle de crise : l'anneau de la lecture animée. L'emprise
      // documentée des vents est désormais une surface GeoJSON unique.
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
  communeAlerts: null as ReadonlyMap<string, EventCommuneAlertRow> | null,
  alertSummary: null as EventCommuneAlertsSummary | null,
  alertAt: null as string | null,
  playback: null as MapPlayback | null,
  onSeekTrackPoint: vi.fn(),
};

/** Ligne d'alerte communale complète (tous les champs requis par le type). */
function makeAlertRow(
  overrides: Partial<EventCommuneAlertRow> = {},
): EventCommuneAlertRow {
  return {
    communeId: 'cm-1',
    communeName: 'Mananjary',
    communeCode: 'MG-123',
    districtId: 'd-1',
    districtName: 'Mananjary',
    alertLevel: 'ROUGE',
    validFrom: '2022-02-04T00:00:00.000Z',
    validTo: '2022-02-08T00:00:00.000Z',
    infoType: 'OFFICIELLE',
    territoryScope: 'COMMUNE',
    sourceName: 'Bulletin Météo Madagascar du 4 février 2022',
    sourceUrl: null,
    comment: null,
    confidence: null,
    ...overrides,
  };
}

/** Point de trajectoire complet (tous les champs requis par TrackStatePoint). */
function makeTrackPoint(
  id: string,
  trackType: 'OBSERVEE' | 'PREVUE',
  observedAt: string,
  latitude: number,
  longitude: number,
  radius: Partial<Pick<TrackStatePoint, 'radius34ktKm' | 'radius50ktKm' | 'radiusMeasureType'>> = {},
  extra: Partial<TrackStatePoint> = {},
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
    ...extra,
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

describe('marqueur cyclonique (lecture de la trajectoire)', () => {
  beforeEach(() => {
    // Lecture visuelle neutralisée : la position reste sur le premier point.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  it('suit la position de lecture fournie par la page', () => {
    const point = makeTrackPoint(
      'p2',
      'OBSERVEE',
      '2026-04-01T06:00:00.000Z',
      -20.9,
      48.4,
    );
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        point,
      ],
      playback: { position: [-20.9, 48.4], point, nextPoint: null, interpolated: false },
    });

    const marker = screen.getByTestId('cyclone-marker');
    expect(marker).toHaveAttribute('data-lat', '-20.9');
    expect(marker).toHaveAttribute('data-lng', '48.4');
    expect(marker.getAttribute('data-title')).toContain('Cyclone Batsirai');
  });

  it('anime lui-même la trajectoire depuis le premier point observé', () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
    });

    const marker = screen.getByTestId('cyclone-marker');
    expect(marker).toHaveAttribute('data-lat', '-20.5');
    expect(marker).toHaveAttribute('data-lng', '49.2');
  });

  it("n'affiche aucun centre sans point observé", () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'PREVUE', '2026-04-02T00:00:00.000Z', -20.5, 49.2),
      ],
    });

    expect(screen.queryByTestId('cyclone-marker')).toBeNull();
  });

  it('remonte le point cliqué pour déplacer la lecture', () => {
    const onSeekTrackPoint = vi.fn();
    renderMap({
      onSeekTrackPoint,
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
    });

    fireEvent.click(screen.getAllByTestId('track-point')[1]);
    expect(onSeekTrackPoint).toHaveBeenCalledTimes(1);
    expect(onSeekTrackPoint.mock.calls[0][0]).toMatchObject({ id: 'p2' });
  });

  it('met en évidence le point de référence courant', () => {
    const point = makeTrackPoint(
      'p2',
      'OBSERVEE',
      '2026-04-01T06:00:00.000Z',
      -20.9,
      48.4,
    );
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
        point,
      ],
      playback: { position: [-20.9, 48.4], point, nextPoint: null, interpolated: false },
    });

    const points = screen.getAllByTestId('track-point');
    expect(points[1]).toHaveAttribute('data-radius', '8');
    expect(points[0]).toHaveAttribute('data-radius', '5');
  });

  it('dessine la zone d\'influence quand un rayon de vent est documenté', () => {
    const point = makeTrackPoint(
      'p1',
      'OBSERVEE',
      '2026-04-01T00:00:00.000Z',
      -20.5,
      49.2,
      {
        radius34ktKm: 368.5,
        radius50ktKm: 164.8,
        radiusMeasureType: 'Rayon maximal des 4 quadrants',
      },
    );
    renderMap({
      trackPoints: [
        point,
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
      playback: { position: [-20.5, 49.2], point, nextPoint: null, interpolated: false },
    });

    const circle = screen.getByTestId('cyclone-radius');
    // La zone d'influence doit rester lisible : anneau rempli + contour pointillé.
    expect(Number(circle.getAttribute('data-fill-opacity'))).toBeGreaterThanOrEqual(0.1);
    expect(circle.getAttribute('data-dash-array')).not.toBe('');
  });

  it('ne dessine aucune zone d\'influence sans rayon documenté', () => {
    const point = makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2);
    renderMap({
      trackPoints: [
        point,
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -20.9, 48.4),
      ],
      playback: { position: [-20.5, 49.2], point, nextPoint: null, interpolated: false },
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
          radius50ktKm: 250,
        }),
      ],
      playback: {
        position: [-20.5, 49.2],
        point: makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
        nextPoint: null,
        interpolated: false,
      },
    });

    // Une seule surface documentée (2 mesures reliées) + l'anneau du point consulté.
    expect(screen.getAllByTestId('wind-swath-surface')).toHaveLength(1);
    expect(screen.getAllByTestId('cyclone-radius')).toHaveLength(1);
  });

  it("masque l'emprise des vents et la retire de la légende", async () => {
    const user = userEvent.setup();
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
        makeTrackPoint('p2', 'OBSERVEE', '2026-04-01T06:00:00.000Z', -21.0, 48.6, {
          radius34ktKm: 300,
        }),
      ],
      playback: {
        position: [-20.5, 49.2],
        point: makeTrackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2, {
          radius34ktKm: 368.5,
        }),
        nextPoint: null,
        interpolated: false,
      },
    });

    expect(screen.getByText(/Emprise documentée des vents/)).toBeTruthy();
    expect(screen.getAllByTestId('wind-swath-surface')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    await user.click(
      screen.getByRole('checkbox', { name: /Emprise des vents/ }) as HTMLInputElement,
    );

    expect(screen.queryAllByTestId('wind-swath-surface')).toHaveLength(0);
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
    expect(screen.queryAllByTestId('wind-swath-surface')).toHaveLength(0);
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

  it('applique des pointillés rose pour PREVUE', () => {
    const style = trackStyle({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      properties: { trackType: 'PREVUE', pointCount: 2, startedAt: '', endedAt: '' },
    });
    expect(style.color).toBe('#d6336c');
    expect(style.dashArray).toBe('8 6');
  });
});

describe('trackPointStyle', () => {
  it('dessine les points de prévision en pastilles blanches à contour rose', () => {
    const style = trackPointStyle('PREVUE');
    expect(style.color).toBe('#d6336c');
    expect(style.fillColor).toBe('#ffffff');
    expect(style.fillOpacity).toBe(1);
  });

  it('garde les points observés en bleu acier', () => {
    const style = trackPointStyle('OBSERVEE');
    expect(style.fillColor).toBe('#5a7d90');
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

describe('zone de position probable du centre (prévision)', () => {
  const forecastPoints = [
    makeTrackPoint('o1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2),
    makeTrackPoint('f1', 'PREVUE', '2026-04-01T00:00:00.000Z', -21.0, 48.6, {}, {
      forecastFor: '2026-04-01T12:00:00.000Z',
    }),
    makeTrackPoint('f2', 'PREVUE', '2026-04-01T00:00:00.000Z', -21.6, 47.8, {}, {
      forecastFor: '2026-04-02T00:00:00.000Z',
    }),
  ];

  it('dessine une seule zone, passive, à partir des points de prévision', () => {
    renderMap({ trackPoints: forecastPoints });

    expect(screen.getByTestId('forecast-cone')).toHaveAttribute('data-interactive', 'false');
  });

  it("n'affiche ni zone ni entrée de légende sans point de prévision", async () => {
    const user = userEvent.setup();
    renderMap({ trackPoints: [makeTrackPoint('o1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', -20.5, 49.2)] });

    await user.click(screen.getByRole('button', { name: 'Afficher la légende' }));

    expect(screen.queryByTestId('forecast-cone')).toBeNull();
    expect(screen.queryByText('Zone de position probable du centre')).toBeNull();
  });

  it("écarte une prévision dont l'échéance n'est pas datable", () => {
    renderMap({
      trackPoints: [
        makeTrackPoint('f1', 'PREVUE', '2026-04-01T00:00:00.000Z', -21.0, 48.6),
      ],
    });

    expect(screen.queryByTestId('forecast-cone')).toBeNull();
  });

  it('annonce la zone dans la légende et la masque via la couche', async () => {
    const user = userEvent.setup();
    renderMap({ trackPoints: forecastPoints });

    await user.click(screen.getByRole('button', { name: 'Afficher la légende' }));
    expect(screen.getByText('Zone de position probable du centre')).toBeInTheDocument();
    expect(
      screen.getByText('Commune ou district traversé par la zone probable'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    await user.click(screen.getByRole('checkbox', { name: 'Zone probable du centre' }));

    expect(screen.queryByTestId('forecast-cone')).toBeNull();
    expect(screen.queryByText('Zone de position probable du centre')).toBeNull();
  });

  it('colore en jaune la commune traversée, sans écraser la sélection', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { communeId: 'cm-9', riskLevel: 'FAIBLE' },
    };

    const traversed = communeStyle(feature, null, true, new Set(['cm-9']));
    expect(traversed.fillColor).toBe('#f5b942');
    expect(traversed.fillOpacity).toBe(0.7);

    const selected = communeStyle(feature, 'cm-9', true, new Set(['cm-9']));
    expect(selected.fillColor).not.toBe('#f5b942');
  });

  it('colore en jaune le district traversé et laisse les autres intacts', () => {
    const district = {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: { districtId: 'd-1' },
    };

    const traversed = districtStyle(district, new Set(['d-1']));
    expect(traversed.fillColor).toBe('#f5b942');
    expect(traversed.fillOpacity).toBe(0.7);

    const intact = districtStyle(district, new Set(['d-9']));
    expect(intact.fillColor).toBe('#f8fafc');
  });
});

describe('niveaux d’alerte cyclonique (salle de crise)', () => {
  const alertSummary = {
    eventId: 'evt-1',
    at: '2022-02-04T17:00:00.000Z',
    total: 20,
    levels: { VERT: 3, JAUNE: 4, ROUGE: 5, BLEU: 0, GRIS: 8 },
    estimated: 7,
    eventHasAlertData: true,
    sources: ['Bulletin Météo Madagascar du 4 février 2022'],
    method: 'Niveau le plus prioritaire par commune à l’instant consulté.',
  } satisfies EventCommuneAlertsSummary;

  const communeLayer: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { communeId: 'cm-1' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ],
  };

  it('ajoute à la légende les compteurs par niveau, la source et l’instant', async () => {
    const user = userEvent.setup();
    renderMap({
      alertSummary,
      alertAt: alertSummary.at,
      communeLayer,
      communeAlerts: new Map([['cm-1', makeAlertRow()]]),
    });

    await user.click(screen.getByRole('button', { name: 'Afficher la légende' }));

    expect(screen.getByText(/Niveaux d'alerte cyclonique/)).toBeInTheDocument();
    expect(screen.getByText('Vert — menace vague (2 à 5 jours)')).toBeInTheDocument();
    expect(screen.getByText('Jaune — menace précise (24 à 48 h)')).toBeInTheDocument();
    expect(screen.getByText('Rouge — danger imminent ou impact observé')).toBeInTheDocument();
    expect(screen.getByText('Bleu — dangers résiduels après le passage')).toBeInTheDocument();
    expect(screen.getByText('Gris — hors alerte')).toBeInTheDocument();
    // Chaque compteur est rendu à côté de son niveau.
    expect(screen.getByText('Vert — menace vague (2 à 5 jours)').parentElement).toHaveTextContent(
      '3',
    );
    expect(screen.getByText(/Sources : Bulletin Météo Madagascar/)).toBeInTheDocument();
    // Les niveaux hérités sont explicitement signalés comme estimations.
    expect(
      screen.getByText(/7 commune\(s\) colorée\(s\) par estimation spatiale/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Niveaux actifs au/)).toBeInTheDocument();
  });

  it('n’affiche aucune section d’alerte sans données d’alerte', async () => {
    const user = userEvent.setup();
    renderMap({});
    await user.click(screen.getByRole('button', { name: 'Afficher la légende' }));
    expect(screen.queryByText(/Niveaux d'alerte cyclonique/)).toBeNull();
  });

  it('n’active la couche « Alertes cycloniques » que si l’événement en porte', async () => {
    const user = userEvent.setup();
    const { unmount } = renderMap({ alertSummary });
    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    expect(
      screen.getByRole('checkbox', { name: /Alertes cycloniques/ }),
    ).toBeEnabled();
    unmount();

    renderMap({});
    await user.click(screen.getByRole('button', { name: 'Afficher les couches' }));
    expect(
      screen.getByRole('checkbox', { name: /Alertes cycloniques/ }),
    ).toBeDisabled();
  });

  it('positionne le marqueur sur le point de lecture courant', () => {
    const point = makeTrackPoint(
      'p2',
      'OBSERVEE',
      '2022-02-06T12:00:00.000Z',
      -22.5,
      47.1,
    );
    renderMap({
      trackPoints: [
        makeTrackPoint('p1', 'OBSERVEE', '2022-02-05T12:00:00.000Z', -21, 48),
        point,
      ],
      playback: { position: [-22.5, 47.1], point, nextPoint: null, interpolated: false },
    });

    const marker = screen.getByTestId('cyclone-marker');
    expect(marker).toHaveAttribute('data-lat', '-22.5');
    expect(marker).toHaveAttribute('data-lng', '47.1');
  });
});