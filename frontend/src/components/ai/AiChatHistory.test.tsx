import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import { AiChatHistory } from './AiChatHistory';

const api = vi.hoisted(() => ({ conversations: vi.fn(), remove: vi.fn() }));

vi.mock('@/api', () => ({ aiApi: api }));

type Row = {
  id: string;
  userId: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

function page(rows: Row[], totalPages = 1) {
  return {
    data: rows,
    meta: { page: 1, limit: 10, total: rows.length, totalPages },
    message: 'Liste des conversations',
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'conv-1',
    userId: 'user-1',
    title: 'Cyclone Batsirai',
    messageCount: 4,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T09:30:00.000Z',
    ...overrides,
  };
}

function renderHistory(props: Partial<Parameters<typeof AiChatHistory>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handlers = {
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onBack: vi.fn(),
    onDeleted: vi.fn(),
  };
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AiChatHistory activeId={undefined} {...handlers} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return handlers;
}

beforeEach(() => {
  api.conversations.mockReset();
  api.remove.mockReset();
});

describe('AiChatHistory — liste', () => {
  it('liste les conversations avec leur nombre de messages', async () => {
    api.conversations.mockResolvedValue(page([row()]));

    renderHistory();

    expect(await screen.findByText('Cyclone Batsirai')).toBeInTheDocument();
    expect(screen.getByText(/4 messages/)).toBeInTheDocument();
  });

  it('nomme les conversations sans titre plutôt que d’afficher un vide', async () => {
    api.conversations.mockResolvedValue(page([row({ title: null })]));

    renderHistory();

    expect(await screen.findByText('Conversation sans titre')).toBeInTheDocument();
  });

  it('invite à commencer quand aucune conversation n’est enregistrée', async () => {
    api.conversations.mockResolvedValue(page([]));

    renderHistory();

    expect(await screen.findByText('Aucune conversation enregistrée')).toBeInTheDocument();
  });

  it('signale un échec de chargement au lieu d’une liste vide', async () => {
    api.conversations.mockRejectedValue(new ApiClientError('Erreur serveur', 500));

    renderHistory();

    expect(await screen.findByText('Échec du chargement')).toBeInTheDocument();
  });

  it('ouvre la conversation choisie', async () => {
    api.conversations.mockResolvedValue(page([row()]));
    const { onSelect } = renderHistory();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir la conversation « Cyclone Batsirai »' }),
    );

    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });
});

describe('AiChatHistory — suppression', () => {
  it('demande confirmation avant de supprimer, et n’appelle pas l’API sans accord', async () => {
    api.conversations.mockResolvedValue(page([row()]));
    api.remove.mockResolvedValue(undefined);

    renderHistory();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Supprimer la conversation « Cyclone Batsirai »' }),
    );

    expect(screen.getByText(/Cette action est définitive/)).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(api.remove).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Supprimer la conversation « Cyclone Batsirai »' }),
    ).toBeInTheDocument();
  });

  it('supprime la conversation confirmée et signale l’identifiant retiré', async () => {
    api.conversations.mockResolvedValue(page([row()]));
    api.remove.mockResolvedValue(undefined);

    const { onDeleted } = renderHistory();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Supprimer la conversation « Cyclone Batsirai »' }),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('conv-1'));
    expect(onDeleted).toHaveBeenCalledWith('conv-1');
  });

  it('affiche l’erreur du serveur quand la suppression échoue', async () => {
    api.conversations.mockResolvedValue(page([row()]));
    api.remove.mockRejectedValue(new ApiClientError('Conversation introuvable', 404));

    renderHistory();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Supprimer la conversation « Cyclone Batsirai »' }),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText('Conversation introuvable')).toBeInTheDocument();
  });
});
