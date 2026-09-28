import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdministrativeInterventionPanel } from './AdministrativeInterventionPanel';

const roleState = vi.hoisted(() => ({ role: 'CLIENT' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

describe('AdministrativeInterventionPanel — garde par rôle', () => {
  it.each(['CLIENT', 'ANALYSTE_SIG'] as const)(
    'est invisible pour %s',
    (role) => {
      roleState.role = role;
      const { container } = render(
        <AdministrativeInterventionPanel>
          <button type="button">Relancer la synchronisation</button>
        </AdministrativeInterventionPanel>,
      );
      expect(screen.queryByText('Intervention administrative')).not.toBeInTheDocument();
      expect(container.querySelector('button')).toBeNull();
    },
  );

  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    'affiche les actions administratives pour %s',
    async (role) => {
      const user = userEvent.setup();
      roleState.role = role;
      render(
        <AdministrativeInterventionPanel>
          <button type="button">Relancer la synchronisation</button>
        </AdministrativeInterventionPanel>,
      );
      expect(screen.getByText('Intervention administrative')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Intervention administrative/ }));
      expect(
        screen.getByRole('button', { name: 'Relancer la synchronisation' }),
      ).toBeInTheDocument();
    },
  );

  it("affiche l'avertissement et la traçabilité lorsque le panneau est ouvert pour ADMIN", async () => {
    const user = userEvent.setup();
    roleState.role = 'ADMIN';
    render(
      <AdministrativeInterventionPanel>
        <button type="button">Publier</button>
      </AdministrativeInterventionPanel>,
    );
    await user.click(screen.getByRole('button', { name: /Intervention administrative/ }));
    expect(
      screen.getByText(
        /Cette action exceptionnelle peut modifier les données générées automatiquement\. Vérifiez la source et justifiez votre intervention\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cette intervention est soumise à la traçabilité disponible côté système\./),
    ).toBeInTheDocument();
  });
});