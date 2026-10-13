import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastConeLayer } from './ForecastConeLayer';
import { buildCone } from '@/lib/forecastCone';
import type { ForecastCone } from '@/lib/forecastCone';

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    GeoJSON: ({
      data,
      style,
      interactive,
    }: {
      data: ForecastCone;
      style?: () => Record<string, unknown>;
      interactive?: boolean;
    }) => {
      const options = typeof style === 'function' ? style() : {};
      return React.createElement('div', {
        'data-testid': 'forecast-cone',
        'data-type': data.geometry.type,
        'data-interactive': String(interactive),
        'data-fill': String(options.fillColor ?? ''),
        'data-fill-opacity': String(options.fillOpacity ?? ''),
        'data-dash': String(options.dashArray ?? ''),
      });
    },
  };
});

const cone = buildCone([
  { latitude: -20, longitude: 49, hours: 12 },
  { latitude: -20.6, longitude: 48.2, hours: 24 },
]);

describe('ForecastConeLayer', () => {
  it("n'affiche rien sans zone probable", () => {
    render(<ForecastConeLayer cone={null} />);
    expect(screen.queryByTestId('forecast-cone')).toBeNull();
  });

  it('affiche une forme unique, violette, translucide, en contour pointillé', () => {
    render(<ForecastConeLayer cone={cone} />);

    const shape = screen.getByTestId('forecast-cone');
    expect(['Polygon', 'MultiPolygon']).toContain(shape.getAttribute('data-type'));
    expect(shape).toHaveAttribute('data-fill', '#8b7cf6');
    expect(shape).toHaveAttribute('data-fill-opacity', '0.25');
    expect(shape).toHaveAttribute('data-dash', '6 6');
    // Couche passive : elle ne capte ni clic ni survol.
    expect(shape).toHaveAttribute('data-interactive', 'false');
  });
});
