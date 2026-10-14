import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycloneWindSwath } from './CycloneWindSwath';
import { CYCLONE_VIOLET, CYCLONE_VIOLET_DEEP } from '@/lib/historical';
import type { TrackStatePoint } from '@/types';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    GeoJSON: ({
      data,
      style,
      interactive,
    }: {
      data?: { geometry?: { type?: string }; properties?: { documentedPoints?: number } };
      style?: {
        className?: string;
        color?: string;
        dashArray?: string;
        fillColor?: string;
        fillOpacity?: number;
      };
      interactive?: boolean;
    }) =>
      React.createElement('div', {
        'data-testid': 'wind-swath',
        'data-geometry': data?.geometry?.type ?? '',
        'data-points':
          data?.properties?.documentedPoints != null
            ? String(data.properties.documentedPoints)
            : '',
        'data-class': style?.className ?? '',
        'data-edge': style?.color ?? '',
        'data-dash': style?.dashArray ?? '',
        'data-fill': style?.fillColor ?? '',
        'data-fill-opacity': style?.fillOpacity != null ? String(style.fillOpacity) : '',
        'data-interactive': String(interactive),
      }),
  };
});

function makePoint(overrides: Partial<TrackStatePoint> = {}): TrackStatePoint {
  return {
    id: 'p1',
    eventId: 'evt-1',
    observedAt: '2022-02-05T12:00:00.000Z',
    forecastFor: null,
    trackType: 'OBSERVEE',
    latitude: -21.0,
    longitude: 48.0,
    windSpeedKmh: 200,
    gustSpeedKmh: null,
    pressureHpa: 934,
    precipitationMm: null,
    movementDirection: '250°',
    movementSpeedKmh: 20,
    createdAt: '2026-04-01T00:00:00.000Z',
    radius34ktKm: 368.5,
    radius50ktKm: 164.8,
    radius64ktKm: null,
    radiusMaxKm: null,
    radiusSource: 'RSMC La Réunion (Météo-France) — IBTrACS v04r01 (2022024S09090)',
    radiusMeasureType: 'Rayon maximal des 4 quadrants',
    radiusQuality: null,
    dataQuality: null,
    confidence: null,
    ...overrides,
  };
}

describe('CycloneWindSwath', () => {
  it('réunit les mesures publiées en une seule surface, sans forme pour un point muet', () => {
    render(
      <CycloneWindSwath
        points={[
          makePoint({ id: 'p1', radius34ktKm: 368.5, latitude: -21.0, longitude: 48.0 }),
          // Point muet : aucune forme inventée pour lui.
          makePoint({ id: 'p2', radius34ktKm: null, radius50ktKm: null }),
          makePoint({
            id: 'p3',
            radius34ktKm: null,
            radius50ktKm: 250,
            latitude: -22.2,
            longitude: 46.5,
          }),
        ]}
      />,
    );

    // Une seule géométrie pour tout l'événement (les mesures reliées entre elles),
    // jamais une forme par point.
    const surfaces = screen.getAllByTestId('wind-swath');
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toHaveAttribute('data-geometry', 'Polygon');
    expect(surfaces[0]).toHaveAttribute('data-points', '2');
  });

  it('trace un contour pointillé autour d’une surface translucide et passive', () => {
    render(
      <CycloneWindSwath
        points={[
          makePoint({ id: 'p1', latitude: -21.0, longitude: 48.0 }),
          makePoint({ id: 'p2', latitude: -22.0, longitude: 47.0 }),
        ]}
      />,
    );

    const surface = screen.getByTestId('wind-swath');
    expect(surface).toHaveAttribute('data-class', 'madarisk-wind-swath');
    expect(surface).toHaveAttribute('data-dash', '6 6');
    expect(surface).toHaveAttribute('data-edge', CYCLONE_VIOLET_DEEP);
    expect(surface).toHaveAttribute('data-fill', CYCLONE_VIOLET);
    expect(surface).toHaveAttribute('data-fill-opacity', '0.18');
    // Couche passive : ni clic ni survol capturés.
    expect(surface).toHaveAttribute('data-interactive', 'false');
  });

  it('garde une surface unique avec une seule mesure publiée', () => {
    render(<CycloneWindSwath points={[makePoint({ id: 'p1' })]} />);

    const surfaces = screen.getAllByTestId('wind-swath');
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toHaveAttribute('data-geometry', 'Polygon');
    expect(surfaces[0]).toHaveAttribute('data-points', '1');
  });

  it("n'affiche rien quand aucun point ne documente de rayon", () => {
    render(
      <CycloneWindSwath
        points={[
          makePoint({ id: 'p1', radius34ktKm: null, radius50ktKm: null }),
          makePoint({ id: 'p2', radius34ktKm: null, radius50ktKm: null }),
        ]}
      />,
    );

    expect(screen.queryAllByTestId('wind-swath')).toHaveLength(0);
  });
});
