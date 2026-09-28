import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const config = vi.hoisted(() => ({ DEMO_MODE: false }));

vi.mock('@/config/demo', () => ({
  get DEMO_MODE() {
    return config.DEMO_MODE;
  },
}));

import { DemoBanner } from './DemoBanner';

beforeEach(() => {
  config.DEMO_MODE = false;
});

describe('DemoBanner', () => {
  it('n’affiche rien hors mode démonstration', () => {
    render(<DemoBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche une bannière non opérationnelle en mode démonstration', () => {
    config.DEMO_MODE = true;
    render(<DemoBanner />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/MODE DÉMONSTRATION/);
    expect(banner).toHaveTextContent(/Données simulées pour la soutenance/);
  });
});
