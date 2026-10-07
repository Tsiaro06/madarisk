import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { TerritoiresPage } from './TerritoiresPage';

vi.mock('@/components/maps/GeoJsonMap', async () => {
  const React = await import('react');
  return {
    GeoJsonMap: (props: { blinkId?: string | null }) =>
      React.createElement('div', {
        'data-testid': 'map',
        'data-blink-id': props.blinkId ?? '',
      }),
  };
});

const api = vi.hoisted(() => ({
  communes: vi.fn(),
  districts: vi.fn(),
  mapCommunes: vi.fn(),
  mapDistricts: vi.fn(),
}));

vi.mock('@/api', () => ({
  territoriesApi: {
    communes: api.communes,
    districts: api.districts,
    mapCommunes: api.mapCommunes,
    mapDistricts: api.mapDistricts,
  },
}));

const communeList = [
  {
    id: 'c1',
    adminCode: '10101',
    name: 'Ambohidratrimo',
    districtName: 'Ambohidratrimo',
    population: 12000,
  },
  {
    id: 'c2',
    adminCode: '10102',
    name: 'Ambatolampy',
    districtName: 'Ambatolampy',
    population: 8000,
  },
];

const districtList = [
  {
    id: 'd1',
    adminCode: '20101',
    name: 'Ambohidratrimo',
    totalCommunes: 23,
    population: 400000,
  },
];

const communeMap: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [47.4, -19.0],
            [47.5, -19.0],
            [47.5, -19.1],
            [47.4, -19.0],
          ],
        ],
      },
      properties: { communeId: 'c1', commune: 'Ambohidratrimo' },
    },
  ],
};

const districtMap: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [47.4, -19.0],
            [47.5, -19.0],
            [47.5, -19.1],
            [47.4, -19.0],
          ],
        ],
      },
      properties: { districtId: 'd1', district: 'Ambohidratrimo' },
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TerritoiresPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  api.communes.mockResolvedValue({
    data: communeList,
    meta: { page: 1, limit: 15, total: communeList.length, totalPages: 1 },
  });
  api.districts.mockResolvedValue({
    data: districtList,
    meta: { page: 1, limit: 15, total: districtList.length, totalPages: 1 },
  });
  api.mapCommunes.mockResolvedValue(communeMap);
  api.mapDistricts.mockResolvedValue(districtMap);
});

describe('TerritoiresPage — révélation d’une recherche sur la carte', () => {
  it('révèle automatiquement le premier résultat, sans Entrée', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('10101');
    await user.type(screen.getByLabelText('Recherche'), 'Ambo');

    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute('data-blink-id', 'c1'),
    );
    // La saisie ne fait pas sauter la page : le scroll est réservé à Entrée.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('Entrée fait défiler jusqu’à la carte sur le résultat', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('10101');
    await user.type(screen.getByLabelText('Recherche'), 'Ambo');
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute('data-blink-id', 'c1'),
    );

    await user.keyboard('{Enter}');

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('Entrée sur l’onglet Districts fait cligner le premier district', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('10101');
    await user.click(screen.getByRole('button', { name: 'Districts' }));
    await screen.findByText('20101');

    await user.type(screen.getByLabelText('Recherche'), 'Ambo');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute('data-blink-id', 'd1'),
    );
  });

  it('Entrée sans résultat ne déclenche aucun clignotement', async () => {
    const user = userEvent.setup();
    api.communes.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 15, total: 0, totalPages: 1 },
    });
    renderPage();

    await screen.findByText('Aucune commune');
    await user.type(screen.getByLabelText('Recherche'), 'zzz');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('map')).toHaveAttribute('data-blink-id', '');
  });
});
