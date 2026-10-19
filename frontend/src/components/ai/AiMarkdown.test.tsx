import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiMarkdown } from './AiMarkdown';

describe('AiMarkdown', () => {
  it('met en forme le gras, les titres et les listes', () => {
    const { container } = render(
      <AiMarkdown>{'## Alertes\n\n- **Batsirai** : rouge\n- Inondation : orange'}</AiMarkdown>,
    );

    expect(screen.getByRole('heading', { name: 'Alertes' })).toBeInTheDocument();
    expect(screen.getByText('Batsirai').tagName.toLowerCase()).toBe('strong');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('ul')).toBeInTheDocument();
  });

  it('affiche les tableaux du Markdown enrichi', () => {
    render(<AiMarkdown>{'| Commune | Niveau |\n| --- | --- |\n| Antananarivo | Rouge |'}</AiMarkdown>);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Commune' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Antananarivo' })).toBeInTheDocument();
  });

  it('neutralise le HTML brut et les liens dangereux', () => {
    const { container } = render(
      <AiMarkdown>{'<script>alert("xss")</script>\n\n[piège](javascript:alert(1))'}</AiMarkdown>,
    );

    // Le HTML brut n'est jamais interprété (échappé puis sanitisé).
    expect(container.querySelector('script')).toBeNull();
    // Un lien `javascript:` perd son href : il n'est plus activable ni exposé
    // comme lien accessible.
    const anchor = container.querySelector('a');
    expect(anchor?.textContent).toContain('piège');
    expect(anchor?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });
});
