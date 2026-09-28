import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import { EvenementsPage } from './EvenementsPage';

const roleState = vi.hoisted(() => ({ role: 'ADMIN' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } | null }) => unknown) =>
    selector({ user: roleState.role ? { role: roleState.role } : null }),
}));

vi.mock('@/components/maps/PolygonDrawMap', () => ({
  PolygonDrawMap: () => null,
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  addTrack: vi.fn(),
  createPolygonArea: vi.fn(),
}));

vi.mock('@/api', () => ({
  eventsApi: {
    list: api.list,
    create: api.create,
    addTrack: api.addTrack,
    createPolygonArea: api.createPolygonArea,
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <EvenementsPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function openAdminPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Intervention administrative/ }));
}

async function fillAndSubmitCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Créer un événement exceptionnel/ }));
  await user.type(screen.getByLabelText('Code'), 'CY-2026-001');
  await user.type(screen.getByLabelText('Nom'), 'Cyclone exceptionnel');
  await user.click(screen.getByRole('button', { name: 'Créer' }));
  const heading = await screen.findByRole('heading', {
    name: /Créer un événement exceptionnel\s*\?/,
  });
  return heading.closest('[role="dialog"]') as HTMLElement;
}

beforeEach(() => {
  roleState.role = 'ADMIN';
  api.list.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
  });
  api.create.mockResolvedValue({ id: 'evt-new' });
  api.addTrack.mockResolvedValue(undefined);
  api.createPolygonArea.mockResolvedValue(undefined);
});

describe('EvenementsPage — création d’un événement exceptionnel', () => {
  it.each(['CLIENT', 'ANALYSTE_SIG'] as const)(
    'rend l’action invisible pour %s',
    (role) => {
      roleState.role = role;
      renderPage();
      expect(screen.queryByText('Intervention administrative')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Créer un événement exceptionnel/ }),
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
        screen.getByRole('button', { name: /Créer un événement exceptionnel/ }),
      ).toBeInTheDocument();
    },
  );

  it('ouvre la modale de confirmation avec le résumé sans appeler l’API', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    expect(within(dialog).getByText(/Code : CY-2026-001/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nom : Cyclone exceptionnel/)).toBeInTheDocument();
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
        screen.queryByRole('heading', { name: /Créer un événement exceptionnel\s*\?/ }),
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
      expect.objectContaining({ eventCode: 'CY-2026-001', name: 'Cyclone exceptionnel' }),
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
    api.create.mockRejectedValue(
      new ApiClientError('Code déjà utilisé', 422, [
        { field: 'eventCode', message: 'Code déjà utilisé' },
      ]),
    );
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    expect((await screen.findAllByText('Code déjà utilisé')).length).toBeGreaterThan(0);
    expect(
      await within(dialog).findByRole('button', { name: 'Confirmer la création' }),
    ).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByLabelText(/^Code/)).toHaveValue('CY-2026-001');
  });

  it('remet le formulaire dans un état cohérent après une réussite', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdminPanel(user);
    const dialog = await fillAndSubmitCreateForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la création' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Événement créé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Créer un événement exceptionnel/ }));
    expect(screen.getByLabelText('Code')).toHaveValue('');
    expect(screen.getByLabelText('Nom')).toHaveValue('');
  });
});
