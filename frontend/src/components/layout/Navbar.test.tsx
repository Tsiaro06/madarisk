import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Navbar, type NavbarNotification, type NavbarProps } from './Navbar';

const ALERTS: NavbarNotification[] = [
  { id: 'a1', title: 'Cyclone imminent', description: 'Villages côtiers', meta: '2 min' },
  { id: 'a2', title: 'Inondation', tone: 'warning', meta: '1 h' },
  { id: 'a3', title: 'Séisme', tone: 'danger', meta: '3 h' },
  { id: 'a4', title: 'Éruption', tone: 'danger', meta: '5 h' },
];

const originalMatchMedia = window.matchMedia;

function mockViewport(widths: { tablet: boolean; desktop: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('768px')
      ? widths.tablet
      : query.includes('1024px')
        ? widths.desktop
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderNavbar(props: Partial<NavbarProps> = {}) {
  return render(
    <MemoryRouter>
      <Navbar
        title="Collections"
        breadcrumb={[
          { label: 'Datasets', to: '/datasets' },
          { label: 'Collections' },
        ]}
        notifications={ALERTS}
        user={{ name: 'Naina Rakoto', email: 'naina@madarisk.mg' }}
        createAction={{ label: 'Nouveau', onSelect: vi.fn() }}
        onToggleSidebar={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  mockViewport({ tablet: true, desktop: true });
});

describe('Navbar — structure', () => {
  it('affiche titre, fil d’Ariane et recherche sur desktop', () => {
    renderNavbar();

    expect(screen.getByRole('heading', { level: 1, name: 'Collections' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Datasets' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rechercher…')).toBeInTheDocument();
  });

  it('marque le dernier segment du fil comme page courante', () => {
    renderNavbar();

    // Le `h1` porte le même libellé : la requête est scoped au fil d'Ariane.
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(within(nav).getByText('Collections')).toHaveAttribute('aria-current', 'page');
  });

  it('affiche le nombre de notifications sur la pastille', () => {
    renderNavbar();

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('4');
  });

  it('propage le clic du toggle à onToggleSidebar', async () => {
    const user = userEvent.setup();
    const onToggleSidebar = vi.fn();
    renderNavbar({ onToggleSidebar });

    await user.click(screen.getByRole('button', { name: 'Réduire le menu' }));

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });
});

describe('Navbar — menus déroulants', () => {
  it('ouvre les notifications et referme au clic extérieur', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    const menu = screen.getByRole('menu', { name: 'Notifications' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Cyclone imminent/ })).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole('menu', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('ferme le menu au clavier sur Échap', async () => {
    const user = userEvent.setup();
    renderNavbar();

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Notifications' })).not.toBeInTheDocument();
    // Le focus revient sur le déclencheur.
    expect(trigger).toHaveFocus();
  });

  it('parcourt les items du menu avec les flèches', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));
    const first = screen.getByRole('menuitem', { name: 'Profil' });
    const second = screen.getByRole('menuitem', { name: 'Paramètres' });
    const third = screen.getByRole('menuitem', { name: 'Déconnexion' });

    // Ouverture : le premier item reçoit le focus.
    expect(first).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();

    await user.keyboard('{End}');
    expect(third).toHaveFocus();

    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('exécute le handler d’un item de menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderNavbar({
      accountMenu: [{ id: 'logout', label: 'Déconnexion', onSelect }],
    });

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déconnexion' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Menu compte' })).not.toBeInTheDocument();
  });
});

describe('Navbar — recherche', () => {
  it('donne le focus au champ sur Ctrl+K', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await act(async () => {
      await user.keyboard('{Control>}k{/Control}');
    });

    expect(screen.getByPlaceholderText('Rechercher…')).toHaveFocus();
  });

  it('remonte la saisie à onSearch', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderNavbar({ onSearch });

    await user.type(screen.getByPlaceholderText('Rechercher…'), 'anticyclone');

    expect(onSearch).toHaveBeenLastCalledWith('anticyclone');
  });
});

describe('Navbar — thème partagé', () => {
  it('bascule le thème global, sidebar comprise', async () => {
    const user = userEvent.setup();
    const { container } = renderNavbar();

    const bar = container.querySelector('.navbar');
    expect(bar).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('switch', { name: 'Passer en mode sombre' }));

    expect(bar).toHaveAttribute('data-theme', 'dark');
  });
});

describe('Navbar — responsive', () => {
  it('replie la recherche sur son icône en tablette', async () => {
    mockViewport({ tablet: true, desktop: false });
    const user = userEvent.setup();
    renderNavbar();

    expect(screen.queryByPlaceholderText('Rechercher…')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(screen.getByPlaceholderText('Rechercher…')).toBeInTheDocument();
  });

  it('bascule sur le titre de page sous md, sans fil ni création', () => {
    mockViewport({ tablet: false, desktop: false });
    renderNavbar();

    expect(screen.getByRole('heading', { level: 1, name: 'Collections' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Fil d’Ariane' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau' })).not.toBeInTheDocument();
  });

  it('déplace création et thème dans le menu compte sur mobile', async () => {
    mockViewport({ tablet: false, desktop: false });
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderNavbar({ createAction: { label: 'Nouveau', onSelect: onCreate } });

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));

    const menu = screen.getByRole('menu', { name: 'Menu compte' });
    expect(menu).toBeInTheDocument();
    const create = screen.getByRole('menuitem', { name: 'Nouveau' });
    expect(create).toBeInTheDocument();
    // Le fil d’Ariane est également repris dans le menu.
    expect(screen.getByRole('menuitem', { name: 'Datasets' })).toBeInTheDocument();
    // Le switch y est présent, sans son libellé.
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);

    await user.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
