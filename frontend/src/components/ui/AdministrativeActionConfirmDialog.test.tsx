import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdministrativeActionConfirmDialog } from './AdministrativeActionConfirmDialog';

type DialogOverrides = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
  variant?: 'warning' | 'destructive' | 'primary';
  isPending?: boolean;
  onConfirm?: () => void;
  contextLabel?: string;
  contextValue?: string;
};

function setup(overrides: DialogOverrides = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <AdministrativeActionConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Confirmer l’intervention"
      actionLabel="Confirmer"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe('AdministrativeActionConfirmDialog', () => {
  it("n'affiche rien quand elle est fermée", () => {
    render(
      <AdministrativeActionConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Titre"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("affiche un vrai dialogue avec le titre, la description et le texte d'avertissement", () => {
    setup({
      title: 'Publier cette alerte ?',
      description: 'Alerte active pour la publication',
      contextLabel: 'Alerte',
      contextValue: 'CY-2026-0214',
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: /Publier cette alerte/ })).toBeInTheDocument();
    expect(screen.getByText('Alerte active pour la publication')).toBeInTheDocument();
    expect(screen.getByText('CY-2026-0214')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Cette action exceptionnelle peut modifier des données générées automatiquement\. Vérifiez la source avant de continuer\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cette intervention est soumise à la traçabilité disponible côté système\./),
    ).toBeInTheDocument();
  });

  it("annuler ferme la modale et ne déclenche aucun appel", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('confirmer déclenche exactement un appel onConfirm', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ actionLabel: 'Confirmer la publication' });
    await user.click(screen.getByRole('button', { name: 'Confirmer la publication' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("désactive le bouton de confirmation et affiche « Traitement en cours… » pendant la mutation", () => {
    setup({ actionLabel: 'Confirmer', isPending: true });
    const confirmButton = screen.getByRole('button', { name: 'Traitement en cours…' });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });

  it("ne déclenche pas onConfirm quand le bouton est désactivé (isPending)", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ actionLabel: 'Confirmer la publication', isPending: true });
    await user.click(screen.getByRole('button', { name: 'Traitement en cours…' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('se ferme avec la touche Échap', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ne se ferme pas avec Échap pendant une mutation', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup({ isPending: true });
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("place le focus sur le bouton Annuler à l'ouverture", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
  });

  it('piège le focus : Tab depuis le dernier bouton revient au premier', async () => {
    const user = userEvent.setup();
    setup({ actionLabel: 'Confirmer la publication' });
    const cancelButton = screen.getByRole('button', { name: 'Annuler' });
    const confirmButton = screen.getByRole('button', { name: 'Confirmer la publication' });
    await waitFor(() => expect(cancelButton).toHaveFocus());
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
  });

  it('utilise une variante destructive pour les suppressions', () => {
    setup({ variant: 'destructive', actionLabel: 'Confirmer la suppression' });
    const confirmButton = screen.getByRole('button', { name: 'Confirmer la suppression' });
    expect(confirmButton.className).toContain('bg-risk-extreme');
  });

  it('utilise une variante warning (ambre) pour les relances et publications', () => {
    setup({ variant: 'warning', actionLabel: 'Confirmer la publication' });
    const confirmButton = screen.getByRole('button', { name: 'Confirmer la publication' });
    expect(confirmButton.className).toContain('bg-amber-600');
  });

  it('utilise une variante primaire pour les actions non destructives', () => {
    setup({ variant: 'primary', actionLabel: "Confirmer l'action" });
    const confirmButton = screen.getByRole('button', { name: "Confirmer l'action" });
    expect(confirmButton.className).toContain('bg-brand');
  });

  it("utilise les libellés par défaut « Annuler » et « Confirmer l'intervention »", () => {
    const onConfirm = vi.fn();
    render(
      <AdministrativeActionConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Confirmer l’intervention"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmer l’intervention' }),
    ).toBeInTheDocument();
  });
});