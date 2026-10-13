import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycloneWindSwath } from './CycloneWindSwath';
import type { TrackStatePoint } from '@/types';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    Circle: ({
      center,
      radius,
      pathOptions,
    }: {
      center?: [number, number];
      radius?: number;
      pathOptions?: { className?: string; stroke?: boolean; interactive?: boolean };
    }) =>
      React.createElement('div', {
        'data-testid': 'wind-swath',
        'data-lat': center ? String(center[0]) : '',
        'data-lng': center ? String(center[1]) : '',
        'data-radius': radius != null ? String(radius) : '',
        'data-class': pathOptions?.className ?? '',
        'data-stroke': String(pathOptions?.stroke),
        'data-interactive': String(pathOptions?.interactive),
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
  it('dessine un cercle par point dont la source publie un rayon', () => {
    render(
      <CycloneWindSwath
        points={[
          makePoint({ id: 'p1', radius34ktKm: 368.5, latitude: -21.0, longitude: 48.0 }),
          makePoint({ id: 'p2', radius34ktKm: null, radius50ktKm: null }),
          makePoint({ id: 'p3', radius34ktKm: null, radius50ktKm: 164.8, latitude: -22.5, longitude: 46.5 }),
        ]}
      />,
    );

    const circles = screen.getAllByTestId('wind-swath');
    // Le point muet (p2) est ignoré : une absence n'est pas un zéro.
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute('data-lat', '-21');
    expect(circles[0]).toHaveAttribute('data-lng', '48');
    // 368,5 km publiés → 368 500 m : la valeur de la source, jamais un recalcul.
    expect(circles[0]).toHaveAttribute('data-radius', '368500');
    expect(circles[1]).toHaveAttribute('data-radius', '164800');
  });

  it('dessine une couche passive : ni contour, ni capture du clic ou du survol', () => {
    render(<CycloneWindSwath points={[makePoint()]} />);

    const circle = screen.getByTestId('wind-swath');
    expect(circle).toHaveAttribute('data-class', 'madarisk-wind-swath');
    expect(circle).toHaveAttribute('data-stroke', 'false');
    expect(circle).toHaveAttribute('data-interactive', 'false');
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

    // Une absence de mesure ne devient jamais un cercle de rayon nul.
    expect(screen.queryAllByTestId('wind-swath')).toHaveLength(0);
  });
});
