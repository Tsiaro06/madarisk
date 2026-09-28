import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'u1', role: 'ADMIN' }, logout: vi.fn() }),
}));

vi.mock('@/api', () => ({
  alertsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('@/components/ai/AiChatBubble', () => ({
  AiChatBubble: () => null,
}));

const DESKTOP = '(min-width: 1024px)';

/** jsdom n'évalue pas les media queries : on impose la largeur de référence. */
function mockViewport(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === DESKTOP ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AppShell />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  mockViewport(true);
});

describe('AppShell — icône du navbar', () => {
  it('affiche le sidebar puis le masque au second clic sur desktop', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');
    const toggle = screen.getByRole('button', { name: 'Masquer le menu latéral' });

    expect(container.firstElementChild).toHaveClass('lg:grid-cols-[272px_1fr]', { exact: false });
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(aside).not.toHaveAttribute('inert');

    await user.click(toggle);

    // Masqué : colonne à 0px, tiroir neutralisé, liens hors tabulation.
    expect(container.firstElementChild).toHaveClass('lg:grid-cols-[0px_1fr]', { exact: false });
    expect(aside).toHaveClass('lg:w-0');
    expect(aside).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Afficher le menu latéral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Afficher le menu latéral' }));

    expect(aside).toHaveClass('lg:w-[272px]');
    expect(aside).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Masquer le menu latéral' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('ouvre le tiroir du sidebar en dessous de lg', async () => {
    mockViewport(false);
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');

    const toggle = screen.getByRole('button', { name: 'Ouvrir le menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(aside).toHaveClass('-translate-x-full');
    expect(aside).toHaveAttribute('inert');

    await user.click(toggle);

    expect(aside).toHaveClass('translate-x-0');
    expect(aside).not.toHaveClass('-translate-x-full');
    expect(aside).not.toHaveAttribute('inert');

    // Le voile de fermeture referme le tiroir.
    await user.click(screen.getAllByRole('button', { name: 'Fermer le menu' })[0]);
    expect(aside).toHaveClass('-translate-x-full');
  });

  it('conserve le mode rail (72px) indépendant de l’affichage du sidebar', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');

    await user.click(screen.getByRole('button', { name: 'Réduire le menu' }));

    expect(container.firstElementChild).toHaveClass('lg:grid-cols-[72px_1fr]', { exact: false });
    expect(aside).toHaveClass('lg:w-[72px]');
    expect(aside).not.toHaveAttribute('inert');
  });
});
