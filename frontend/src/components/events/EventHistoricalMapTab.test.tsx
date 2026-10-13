import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { EventHistoricalMapTab } from './EventHistoricalMapTab';
import type { CommuneImpactsResult, TrackState, TrackStatePoint } from '@/types';

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
    Polyline: () => React.createElement('div', { 'data-testid': 'polyline' }),
    Circle: () => React.createElement('div', { 'data-testid': 'radius-circle' }),
    Marker: ({
      position,
      children,
    }: {
      position: [number, number];
      children?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'cyclone-marker',
          'data-lat': String(position[0]),
          'data-lng': String(position[1]),
        },
        children,
      ),
    Popup: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popup' }, children),
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'tooltip' }, children),
    ZoomControl: () => null,
    useMap: () => ({
      on: () => undefined,
      off: () => undefined,
      getZoom: () => 6,
      fitBounds: () => undefined,
    }),
  };
});

const api = vi.hoisted(() => ({
  tracks: vi.fn(),
  trackState: vi.fn(),
  communeImpacts: vi.fn(),
  areas: vi.fn(),
  mapCommunes: vi.fn(),
}));

vi.mock('@/api', () => ({
  eventsApi: {
    tracks: api.tracks,
    trackState: api.trackState,
    communeImpacts: api.communeImpacts,
    areas: api.areas,
  },
  territoriesApi: { mapCommunes: api.mapCommunes },
}));

const point = (p: Partial<TrackStatePoint> & { id: string; observedAt: string }): TrackStatePoint => ({
  eventId: 'evt-batsirai',
  forecastFor: null,
  trackType: 'OBSERVEE',
  latitude: -21.3,
  longitude: 48.3,
  windSpeedKmh: null,
  gustSpeedKmh: null,
  pressureHpa: null,
  precipitationMm: null,
  movementDirection: null,
  movementSpeedKmh: null,
  createdAt: p.observedAt,
  radius34ktKm: null,
  radius50ktKm: null,
  radius64ktKm: null,
  radiusMaxKm: null,
  radiusSource: null,
  radiusMeasureType: null,
  radiusQuality: null,
  dataQuality: null,
  confidence: null,
  ...p,
});

const communeLayer: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'c1',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [48, -21],
            [49, -21],
            [49, -22],
            [48, -22],
            [48, -21],
          ],
        ],
      },
      properties: { communeId: 'c1', commune: 'Mananjary', district: 'Mananjary' },
    },
    {
      type: 'Feature',
      id: 'c2',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [47, -20],
            [48, -20],
            [48, -21],
            [47, -21],
            [47, -20],
          ],
        ],
      },
      properties: { communeId: 'c2', commune: 'Ifanadiana', district: 'Ifanadiana' },
    },
  ],
};

const vigilanceLayer: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'z1',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [47, -19],
              [48, -19],
              [48, -20],
              [47, -20],
              [47, -19],
            ],
          ],
        ],
      },
      properties: {
        areaId: 'z1',
        phase: 'AVANT',
        riskLevel: 'EXTREME',
        radiusKm: null,
        validFrom: '2022-02-03T21:00:00.000Z',
        validTo: '2022-02-06T21:00:00.000Z',
        source: 'Bulletin Météo Madagascar du 4 février 2022',
        sourceType: 'OFFICIEL',
        isEstimate: false,
        description:
          'Alerte rouge — région Analamanga — zone placée en vigilance selon le bulletin Météo Madagascar du 4 février 2022.',
      },
    },
    {
      type: 'Feature',
      id: 'z2',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [43, -21],
              [44, -21],
              [44, -22],
              [43, -22],
              [43, -21],
            ],
          ],
        ],
      },
      properties: {
        areaId: 'z2',
        phase: 'AVANT',
        riskLevel: 'ELEVE',
        radiusKm: null,
        validFrom: '2022-02-03T21:00:00.000Z',
        validTo: '2022-02-06T21:00:00.000Z',
        source: 'Bulletin Météo Madagascar du 4 février 2022',
        sourceType: 'OFFICIEL',
        isEstimate: false,
        description: 'Alerte jaune — région Menabe — zone placée en vigilance.',
      },
    },
  ],
};

const impactsAfter: CommuneImpactsResult = {
  eventId: 'evt-batsirai',
  at: '2022-02-05T18:00:00.000Z',
  count: 2,
  hasRadiusData: false,
  radiusKm: null,
  radiusSource: null,
  method: 'Corridor de 15 km autour du centre observé',
  communes: [
    {
      communeId: 'c1',
      communeName: 'Mananjary',
      communeCode: '51.322',
      districtId: 'd1',
      districtName: 'Mananjary',
      firstAffectedAt: '2022-02-05T16:00:00.000Z',
      lastAffectedAt: '2022-02-05T16:00:00.000Z',
      impactState: 'CENTER_CROSSED',
      observedRiskLevel: 'TRES_ELEVE',
      forecastRiskLevel: null,
      sourceName: 'Météo-France / WMO — atterrissage',
      sourceUrl: 'https://example.com/mananjary',
      confidence: 0.99,
      method: 'Signalement WMO explicite de l’atterrissage à Mananjary.',
      notes: null,
    },
    {
      communeId: 'c2',
      communeName: 'Ifanadiana',
      communeCode: '51.102',
      districtId: 'd2',
      districtName: 'Ifanadiana',
      firstAffectedAt: '2022-02-05T18:00:00.000Z',
      lastAffectedAt: '2022-02-05T18:00:00.000Z',
      impactState: 'WIND_IMPACT',
      observedRiskLevel: 'ELEVE',
      forecastRiskLevel: 'ELEVE',
      sourceName: 'Corridor best track (IBTrACS)',
      sourceUrl: null,
      confidence: 0.8,
      method: 'Polygone communal intersecté par le corridor de 15 km.',
      notes: null,
    },
  ],
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventHistoricalMapTab eventId="evt-batsirai" />
    </QueryClientProvider>,
  );
}

describe('EventHistoricalMapTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.tracks.mockResolvedValue([
      point({ id: 'p1', observedAt: '2022-02-05T12:00:00.000Z', latitude: -20.5, longitude: 49.2 }),
      point({ id: 'p2', observedAt: '2022-02-05T18:00:00.000Z', latitude: -21.3, longitude: 48.3, windSpeedKmh: 165, gustSpeedKmh: 230, pressureHpa: 955 }),
    ]);
    api.trackState.mockImplementation((_id: string, params?: { at?: string }) => {
      const at = params?.at ?? '';
      if (at.startsWith('2022-02-05T12')) {
        return Promise.resolve({
          eventId: 'evt-batsirai',
          at,
          hasRadiusData: false,
          radiusSource: null,
          radiusMeasureType: null,
          radiusMaxKm: null,
          currentPoint: point({
            id: 'p1',
            observedAt: '2022-02-05T12:00:00.000Z',
            latitude: -20.5,
            longitude: 49.2,
          }),
          previousPoints: [],
          upToAtCount: 1,
          totalPoints: 2,
          method: `Point observé le plus proche (<= ${at}) — rayon non documenté`,
        } satisfies TrackState);
      }
      return Promise.resolve({
        eventId: 'evt-batsirai',
        at,
        hasRadiusData: false,
        radiusSource: null,
        radiusMeasureType: null,
        radiusMaxKm: null,
        currentPoint: point({
          id: 'p2',
          observedAt: '2022-02-05T18:00:00.000Z',
          latitude: -21.3,
          longitude: 48.3,
          windSpeedKmh: 165,
          gustSpeedKmh: 230,
          pressureHpa: 955,
        }),
        previousPoints: [],
        upToAtCount: 2,
        totalPoints: 2,
        method: `Point observé le plus proche (<= ${at}) — rayon non documenté`,
      } satisfies TrackState);
    });
    api.communeImpacts.mockImplementation((_id: string, params?: { at?: string }) => {
      const at = params?.at ?? '';
      if (at.startsWith('2022-02-05T12')) {
        return Promise.resolve({
          ...impactsAfter,
          at,
          count: 0,
          communes: [],
          method: `Aucune commune affectée documentée à ${at}.`,
        });
      }
      return Promise.resolve(impactsAfter);
    });
    api.areas.mockResolvedValue(vigilanceLayer);
    api.mapCommunes.mockResolvedValue(communeLayer);
  });

  it('charge la carte communale et la trajectoire observée', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeTruthy();
    });
    expect(api.tracks).toHaveBeenCalledWith('evt-batsirai');
    expect(api.mapCommunes).toHaveBeenCalled();
    // Le premier état interroge les deux endpoints au temps du 1er point.
    expect(api.trackState).toHaveBeenCalledWith('evt-batsirai', {
      at: '2022-02-05T12:00:00.000Z',
    });
    // 2 points observés → 1 trait (2+) + 2 marqueurs ; couche communale = 2 communes.
    await waitFor(() => {
      expect(screen.getAllByTestId('track-point')).toHaveLength(2);
      expect(screen.getAllByTestId('polyline').length).toBeGreaterThan(0);
      const layerSizes = screen
        .getAllByTestId('geojson')
        .map((el) => el.getAttribute('data-features'));
      expect(layerSizes).toContain('2');
    });
  });

  it('ne colore aucune commune avant le passage observé (12:00Z)', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Aucune commune dont le premier impact/)).toBeTruthy();
    });
    expect(screen.getByText('Communes affectées')).toBeTruthy();
  });

  it('affiche l’atterrissage de Mananjary en avançant d’un pas (16:00Z ≤ first_affected_at)', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(api.trackState).toHaveBeenCalled();
    });
    await user.click(screen.getByTitle('Point observé suivant'));
    await waitFor(() => {
      expect(api.communeImpacts).toHaveBeenCalledWith('evt-batsirai', {
        at: '2022-02-05T18:00:00.000Z',
      });
    });
    await waitFor(() => {
      // 2 communes affectées après le passage (jamais avant).
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('bascule lecture / pause via la barre temporelle', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Lecture automatique')).toBeTruthy();
    });
    await user.click(screen.getByTitle('Lecture automatique'));
    await waitFor(() => {
      expect(screen.getByTitle('Mettre en pause')).toBeTruthy();
    });
    expect(screen.getByRole('slider', { name: /Position temporelle/ })).toHaveProperty('disabled', false);
  });

  it('affiche le marqueur cyclone ancré sur le point observé courant', async () => {
    renderTab();
    const marker = await waitFor(() => screen.getByTestId('cyclone-marker'));
    expect(marker.getAttribute('data-lat')).toBe('-20.5');
    expect(marker.getAttribute('data-lng')).toBe('49.2');
  });

  it('interpole la position du marqueur entre deux points (50 %)', async () => {
    renderTab();
    const marker = await waitFor(() => screen.getByTestId('cyclone-marker'));
    const slider = screen.getByRole('slider', { name: /Position temporelle/ });
    fireEvent.change(slider, { target: { value: '180' } });
    await waitFor(() => {
      expect(marker.getAttribute('data-lat')).toBe('-20.9');
      expect(marker.getAttribute('data-lng')).toBe('48.75');
    });
    // Les requêtes restent cadencées sur le point observé de référence (12:00Z).
    await waitFor(() => {
      expect(api.trackState).toHaveBeenCalledWith('evt-batsirai', {
        at: '2022-02-05T12:00:00.000Z',
      });
    });
    expect(api.communeImpacts).not.toHaveBeenCalledWith('evt-batsirai', {
      at: '2022-02-05T15:00:00.000Z',
    });
  });

  it('affiche les vents du point observé et « non disponible » pour une rafale absente', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByTestId('tooltip').length).toBeGreaterThan(0);
    });
    // p1 n'a ni rafale ni pression : la valeur absente est explicite, jamais zéro.
    expect(screen.getAllByText('Rafales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('non disponible').length).toBeGreaterThan(0);
  });

  it('ne dessine aucun rayon de vent sans donnée source', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('cyclone-marker')).toBeTruthy();
    });
    expect(screen.queryByTestId('radius-circle')).toBeNull();
  });

  it('affiche « non disponible » sans trajectoire observée', async () => {
    api.tracks.mockResolvedValue([]);
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByText(/Trajectoire historique détaillée non disponible/),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('cyclone-marker')).toBeNull();
  });

  it('superpose les zones de vigilance du bulletin (couche documentaire)', async () => {
    renderTab();
    await waitFor(() => {
      expect(api.areas).toHaveBeenCalledWith('evt-batsirai');
    });
    // Deux couches GeoJSON : zones de vigilance + communes.
    await waitFor(() => {
      expect(screen.getAllByTestId('geojson')).toHaveLength(2);
    });
    expect(
      screen.getByText(/Zones de vigilance du bulletin prévisionnel \(2\)/),
    ).toBeTruthy();
    expect(screen.getByText('Zones de vigilance (prévision)')).toBeTruthy();
  });

  it('masque les zones de vigilance via la case à cocher', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByTestId('geojson')).toHaveLength(2);
    });
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getAllByTestId('geojson')).toHaveLength(1);
    });
    expect(screen.queryByText('Zones de vigilance (prévision)')).toBeNull();
  });
});