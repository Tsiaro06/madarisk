import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import { AlertesPage } from './AlertesPage';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('@/api', () => ({
  alertsApi: {
    list: api.list,
    create: api.create,
    publish: api.publish,
    archive: api.archive,
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AlertesPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function openAdminPanel(user: ReturnType<typeof userEvent.setup>) {
  // Le panneau porte un titre contextuel (« Alertes ») : on cible le sous-titre
  // commun à tous les panneaux plutôt que le titre.
  await user.click(screen.getByRole('button', { name: /Actions exceptionnelles/ }));
}

async function fillAndSubmitCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Créer une alerte exceptionnelle/ }));
  await user.type(screen.getByLabelText('Titre'), 'Alerte exceptionnelle');
  await user.type(screen.getByLabelText('Message'), 'Message de test');
  await user.type(
    screen.getByLabelText('eventId (UUID)'),
    '11111111-1111-1111-1111-111111111111',
  );
  await user.click(screen.getByRole('button', { name: 'Créer' }));
  const heading = await screen.findByRole('heading', {
    name: /Créer une alerte exceptionnelle\s*\?/,
  });
  return heading.closest('[role="dialog"]') as HTMLElement;
}

beforeEach(() => {
  roleState.role = 'ADMIN';
  api.list.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
  });
  api.create.mockResolvedValue({ id: 'alert-new' });
  api.publish.mockResolvedValue(undefined);
  api.archive.mockResolvedValue(undefined);
});

describe('AlertesPage — métadonnées automatiques', () => {
  it('affiche le badge « Automatique · Prévision » sur une alerte générée', async () => {
    api.list.mockResolvedValue({
      data: [
        {
          id: 'a1',
          eventId: null,
          districtId: null,
          communeId: null,
          type: 'CYCLONE',
          severity: 'ELEVEE',
          status: 'PUBLIEE',
          title: 'Vigilance cyclone Test',
          message: 'Message de vigilance',
          basis: 'PREVISION',
          isAutomatic: true,
          createdBy: null,
          publishedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: null,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          eventName: null,
          districtName: null,
          communeName: null,
        },
      ],
      meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
    renderPage();
    expect(await screen.findByText('Automatique · Prévision')).toBeInTheDocument();
    expect(screen.getByText('Vigilance cyclone Test')).toBeInTheDocument();
  });

  it('affiche le badge « Manuelle » sur une alerte créée à la main', async () => {
    api.list.mockResolvedValue({
      data: [
        {
          id: 'a2',
          eventId: null,
          districtId: null,
          communeId: null,
          type: 'INFORMATION',
          severity: 'FAIBLE',
          status: 'BROUILLON',
          title: 'Alerte manuelle',
          message: 'Message',
          createdBy: null,
          publishedAt: null,
          expiresAt: null,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          eventName: null,
          districtName: null,
          communeName: null,
        },
      ],
      meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
    renderPage();
    expect(await screen.findByText('Manuelle')).toBeInTheDocument();
  });
});

describe('AlertesPage — création d’une alerte exceptionnelle', () => {
  it.each(['CLIENT', 'ANALYSTE_SIG'] as const)(
    'rend l’action invisible pour %s',
    (role) => {
      roleState.role = role;
      renderPage();
      expect(
        screen.queryByRole('button', { name: /Actions exceptionnelles/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Créer une alerte exceptionnelle/ }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    'affiche l’action autorisée pour %s',
    async (role) => {
      const user = userEvent.setup();
      roleState.role = role;
      renderPage();
      await openAdminPanel(user);
      expect(
        screen.getByRole('button', { name: /Créer une alerte exceptionnelle/ }),
      ).toBeInTheDocument();
    },
  );

  it('ouvre la modale de confirmation avec le résumé sans appeler l’API', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    expect(within(dialog).getByText(/Titre : Alerte exceptionnelle/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Cette action exceptionnelle peut modifier des données générées automatiquement\. Vérifiez la source avant de continuer\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Cette intervention est soumise à la traçabilité disponible côté système\./,
      ),
    ).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('annuler ferme la modale sans aucun appel API', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.create).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Créer une alerte exceptionnelle\s*\?/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it('confirmer déclenche exactement un appel API et ferme la modale', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alerte exceptionnelle', message: 'Message de test' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('désactive le bouton et affiche « Traitement en cours… » pendant la mutation', async () => {
    const user = userEvent.setup();
    api.create.mockImplementation(() => new Promise(() => {}));
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    const confirmButton = within(dialog).getByRole('button', { name: 'Traitement en cours…' });
    expect(confirmButton).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('conserve le formulaire utilisable après une erreur', async () => {
    const user = userEvent.setup();
    api.create.mockRejectedValue(new ApiClientError('Cible invalide', 422));
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    await waitFor(() => expect(screen.getByText('Cible invalide')).toBeInTheDocument());
    expect(
      await within(dialog).findByRole('button', { name: 'Confirmer la création' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Titre')).toHaveValue('Alerte exceptionnelle');
  });

  it('remet le formulaire dans un état cohérent après une réussite', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Alerte créée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Créer une alerte exceptionnelle/ }));
    expect(screen.getByLabelText('Titre')).toHaveValue('');
  });
});
