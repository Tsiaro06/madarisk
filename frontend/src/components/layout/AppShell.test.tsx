import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('démarre sur le rail d’icônes, puis se masque et réapparaît au clic sur desktop', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');

    // Par défaut : rail d'icônes visible (72px), colonne hors écran non appliquée.
    expect(aside).toHaveClass('translate-x-0');
    expect(aside).toHaveClass('w-[72px]');
    expect(aside).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Masquer le menu latéral' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Masquer le menu latéral' }));

    // Masqué : colonne hors écran, liens neutralisés.
    expect(aside).toHaveClass('-translate-x-full');
    expect(aside).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Afficher le menu latéral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Afficher le menu latéral' }));

    expect(aside).toHaveClass('translate-x-0');
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

  it('démarre sur le rail réduit puis bascule vers la carte étendue', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');

    expect(aside).toHaveClass('w-[72px]');

    await user.click(screen.getByRole('button', { name: 'Agrandir le menu' }));

    expect(aside).toHaveClass('w-[336px]');
    expect(aside).not.toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Réduire le menu' }));

    expect(aside).toHaveClass('w-[72px]');
  });
});

describe('AppShell — menu du sidebar', () => {
  it('déplie le sous-menu Données à la demande', async () => {
    const user = userEvent.setup();
    renderShell();

    // Depuis le rail, cliquer un sous-menu agrandit le sidebar et le déplie.
    await user.click(screen.getByRole('button', { name: 'Données' }));

    const trigger = screen.getByRole('button', { name: 'Données' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Territoires' })).toBeInTheDocument();
  });

  it('filtre les entrées par rôle', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Agrandir le menu' }));

    expect(screen.getByRole('link', { name: 'Carte de crise' })).toBeInTheDocument();
    // Rôle ADMIN : l'entrée SUPER_ADMIN reste masquée.
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('bascule le thème clair / sombre', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const aside = container.querySelector('aside');

    await user.click(screen.getByRole('button', { name: 'Agrandir le menu' }));

    expect(aside).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('switch', { name: 'Passer en mode sombre' }));

    expect(aside).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('switch', { name: 'Passer en mode clair' })).toBeInTheDocument();
  });
});
