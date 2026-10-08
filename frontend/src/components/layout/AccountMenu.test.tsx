import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';

function renderMenu(onLogout = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <AccountMenu
        name="Rakoto Nomena"
        email="rakoto@madarisk.mg"
        role="ANALYSTE_SIG"
        initials="RN"
        onLogout={onLogout}
      />
    </MemoryRouter>,
  );
  return { ...view, onLogout };
}

describe('AccountMenu — déclencheur', () => {
  it('affiche les initiales, le nom et le rôle, et n’est pas ouvert par défaut', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Menu compte' });
    expect(trigger).toHaveTextContent('RN');
    expect(trigger).toHaveTextContent('Rakoto Nomena');
    expect(trigger).toHaveTextContent('Analyste SIG');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('ouvre le menu au clic avec l’identité en en-tête et les actions', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));

    expect(screen.getByRole('button', { name: 'Menu compte' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('menu', { name: 'Menu compte' })).toBeInTheDocument();
    expect(screen.getByText('rakoto@madarisk.mg')).toBeInTheDocument();
    const profile = screen.getByRole('menuitem', { name: 'Mon profil' });
    expect(profile).toHaveAttribute('href', '/profil');
    expect(screen.getByRole('menuitem', { name: 'Se déconnecter' })).toBeInTheDocument();
  });

  it('appelle onLogout au clic sur « Se déconnecter »', async () => {
    const user = userEvent.setup();
    const { onLogout } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));
    await user.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Menu compte' })).not.toBeInTheDocument();
  });
});

describe('AccountMenu — clavier et fermeture', () => {
  it('place le focus sur le premier item à l’ouverture et navigue aux flèches', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Menu compte' });
    await user.click(trigger);

    const profile = screen.getByRole('menuitem', { name: 'Mon profil' });
    expect(profile).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Se déconnecter' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(profile).toHaveFocus();
  });

  it('referme au clic extérieur', async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));
    expect(screen.getByRole('menu', { name: 'Menu compte' })).toBeInTheDocument();

    await user.click(container);
    expect(screen.queryByRole('menu', { name: 'Menu compte' })).not.toBeInTheDocument();
  });

  it('referme avec Échap et rend le focus au déclencheur', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Menu compte' });
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: 'Menu compte' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Menu compte' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});