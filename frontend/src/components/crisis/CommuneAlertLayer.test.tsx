import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';

const { styleStack } = vi.hoisted(() => ({ styleStack: [] as unknown[] }));

vi.mock('react-leaflet', () => ({
  GeoJSON: (props: { style?: unknown }) => {
    styleStack.push(props.style);
    return null;
  },
}));

import { CommuneAlertLayer } from './CommuneAlertLayer';

const data: FeatureCollection = { type: 'FeatureCollection', features: [] };

function renderLayer() {
  return render(
    <CommuneAlertLayer
      data={data}
      alerts={new Map()}
      selectedId={null}
      onCommuneClick={() => undefined}
    />,
  );
}

describe('CommuneAlertLayer', () => {
  it('conserve une référence de style stable entre deux rendus', () => {
    // Une référence recréée à chaque rendu ferait rejouer `setStyle` par
    // react-leaflet et effacerait les niveaux d'alerte (clignotement).
    styleStack.length = 0;
    const { rerender } = renderLayer();
    rerender(
      <CommuneAlertLayer
        data={data}
        alerts={new Map()}
        selectedId={null}
        onCommuneClick={() => undefined}
      />,
    );

    expect(styleStack).toHaveLength(2);
    expect(styleStack[0]).toBe(styleStack[1]);
  });
});
