import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  SkeletonGroup,
  SkeletonList,
  SkeletonMap,
  SkeletonStats,
  SkeletonTable,
  SkeletonText,
} from './Skeleton';

describe('Skeleton — primitive', () => {
  it('pose la classe de balayage et masque le bloc aux lecteurs d’écran', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const block = container.firstElementChild as HTMLElement;

    expect(block).toHaveClass('skeleton');
    expect(block).toHaveClass('h-4', 'w-20');
    expect(block).toHaveAttribute('aria-hidden', 'true');
  });

  it('rend un disque pour la forme « circle »', () => {
    const { container } = render(<Skeleton shape="circle" className="size-10" />);
    expect(container.firstElementChild).toHaveClass('rounded-full');
  });
});

describe('SkeletonGroup — accessibilité', () => {
  it('expose une région « status » Occupation busy et un libellé lisible', () => {
    render(
      <SkeletonGroup label="Chargement des alertes…">
        <Skeleton className="h-4 w-full" />
      </SkeletonGroup>,
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAccessibleName('Chargement des alertes…');
  });
});

describe('Skeleton — compositions', () => {
  it('SkeletonText dessine le nombre de lignes demandé', () => {
    const { container } = render(<SkeletonText lines={4} />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(4);
  });

  it('SkeletonTable dessine un en-tête et les lignes du corps', () => {
    const { container } = render(<SkeletonTable rows={3} columns={5} />);
    // 5 colonnes d'en-tête + 3 lignes × 5 colonnes.
    expect(container.querySelectorAll('.skeleton')).toHaveLength(5 + 3 * 5);
  });

  it('SkeletonList dessine une carte par élément', () => {
    const { container } = render(<SkeletonList count={3} />);
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('SkeletonStats dessine une tuile par statistique', () => {
    const { container } = render(<SkeletonStats count={4} />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(4);
  });

  it('SkeletonMap occupe la hauteur demandée', () => {
    const { container } = render(<SkeletonMap height={320} />);
    expect(container.firstElementChild).toHaveStyle({ height: '320px' });
  });
});
