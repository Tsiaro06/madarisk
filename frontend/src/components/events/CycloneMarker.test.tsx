import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycloneMarker } from './CycloneMarker';
import type { TrackStatePoint } from '@/types';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    Circle: ({ center, radius }: { center?: [number, number]; radius?: number }) =>
      React.createElement('div', {
        'data-testid': 'cyclone-radius',
        'data-lat': center ? String(center[0]) : '',
        'data-lng': center ? String(center[1]) : '',
        'data-radius': radius != null ? String(radius) : '',
      }),
    Marker: ({
      position,
      children,
    }: {
      position?: [number, number];
      children?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'cyclone-marker',
          'data-lat': position ? String(position[0]) : '',
          'data-lng': position ? String(position[1]) : '',
        },
        children,
      ),
    Tooltip: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('span', null, children),
    Popup: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
    useMap: () => ({}),
  };
});

/** Point de trajectoire complet (tous les champs requis par TrackStatePoint). */
function makeTrackPoint(
  overrides: Partial<TrackStatePoint> = {},
): TrackStatePoint {
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

describe('CycloneMarker — zone d\u2019influence', () => {
  it("centre l'anneau sur la position affichée, pas sur le dernier point observé", () => {
    render(
      <CycloneMarker
        position={[-20.5, 49.2]}
        point={makeTrackPoint({ latitude: -21.0, longitude: 48.0 })}
        interpolated
        eventName="Batsirai — février 2022"
      />,
    );

    const ring = screen.getByTestId('cyclone-radius');
    const marker = screen.getByTestId('cyclone-marker');

    // L'anneau glisse avec l'œil : même position que le marqueur affiché...
    expect(ring).toHaveAttribute('data-lat', '-20.5');
    expect(ring).toHaveAttribute('data-lng', '49.2');
    expect(ring).toHaveAttribute('data-lat', marker.getAttribute('data-lat'));
    expect(ring).toHaveAttribute('data-lng', marker.getAttribute('data-lng'));

    // ...et non celle du point observé de référence (-21 / 48), où il restait ancré.
    expect(screen.getByTestId('cyclone-marker')).toHaveAttribute('data-lat', '-20.5');
    expect(screen.getByTestId('cyclone-marker')).toHaveAttribute('data-lng', '49.2');
  });

  it('conserve le rayon documenté du point de référence, jamais interpolé', () => {
    render(
      <CycloneMarker
        position={[-20.5, 49.2]}
        point={makeTrackPoint()}
        interpolated
        eventName="Batsirai — février 2022"
      />,
    );

    // 368,5 km → 368 500 m, valeur publiée pour le point observé de référence.
    expect(screen.getByTestId('cyclone-radius')).toHaveAttribute('data-radius', '368500');
  });

  it("ne dessine aucun anneau lorsque la source ne publie aucun rayon", () => {
    render(
      <CycloneMarker
        position={[-20.5, 49.2]}
        point={makeTrackPoint({
          radius34ktKm: null,
          radius50ktKm: null,
          radius64ktKm: null,
          radiusMaxKm: null,
          radiusMeasureType: null,
          radiusSource: null,
        })}
        interpolated={false}
        eventName="Batsirai — février 2022"
      />,
    );

    expect(screen.queryByTestId('cyclone-radius')).toBeNull();
    expect(screen.getByTestId('cyclone-marker')).toBeInTheDocument();
  });
});
