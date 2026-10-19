import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import type { AiStreamHandlers } from '@/api/ai-stream';
import { AiChatBubble } from './AiChatBubble';

const api = vi.hoisted(() => ({
  chatStream: vi.fn(),
  conversations: vi.fn(),
  conversation: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/api', () => ({ aiApi: api }));

type HistoryRow = {
  id: string;
  userId: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

function historyPage(rows: HistoryRow[]) {
  return {
    data: rows,
    meta: { page: 1, limit: 10, total: rows.length, totalPages: 1 },
    message: 'Liste des conversations',
  };
}

function historyRow(overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: 'conv-1',
    userId: 'user-1',
    title: 'Cyclone Batsirai',
    messageCount: 2,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T09:30:00.000Z',
    ...overrides,
  };
}

function renderBubble() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AiChatBubble />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ouvrir l’assistant IA' }));
  await user.type(screen.getByLabelText('Message à l’assistant'), question);
  await user.click(screen.getByRole('button', { name: 'Envoyer' }));
}

beforeEach(() => {
  api.chatStream.mockReset();
  api.conversations.mockReset();
  api.conversation.mockReset();
  api.remove.mockReset();
  // jsdom n'implémente pas le défilement des éléments ; le composant recale la
  // liste sur le dernier message à chaque rendu.
  Element.prototype.scrollTo = () => {};
});

/** Ouvre le panneau puis bascule sur l'historique. */
async function openHistory() {
  renderBubble();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ouvrir l’assistant IA' }));
  await user.click(screen.getByRole('button', { name: 'Historique des conversations' }));
  return user;
}

describe('AiChatBubble — métadonnées de réponse', () => {
  it('affiche sources, date et limites sous la réponse', async () => {
    api.chatStream.mockImplementation(
      async (_token: string | null, _body: unknown, handlers: AiStreamHandlers) => {
        handlers.onMeta?.({
          conversationId: 'conv-1',
          internalSources: ['getPublishedAlerts', 'getLatestWeather'],
          dataTimestamp: '2026-10-14T03:07:26.214Z',
          limitations: ['Aucune observation météo récente pour cette commune.'],
        });
        handlers.onChunk('Deux alertes sont publiées.');
        return { conversationId: 'conv-1' };
      },
    );

    renderBubble();
    await ask('Quelles alertes sont publiées ?');

    expect(await screen.findByText('Deux alertes sont publiées.')).toBeInTheDocument();
    expect(screen.getByText('Données consultées :')).toBeInTheDocument();
    expect(screen.getByText(/alertes publiées, dernières observations météo/)).toBeInTheDocument();
    expect(screen.getByText('Date des données :')).toBeInTheDocument();
    expect(
      screen.getByText('Aucune observation météo récente pour cette commune.'),
    ).toBeInTheDocument();
  });

  it('n’affiche ni source trompeuse ni limite quand le tour n’en a pas', async () => {
    api.chatStream.mockImplementation(
      async (_token: string | null, _body: unknown, handlers: AiStreamHandlers) => {
        handlers.onMeta?.({
          conversationId: 'conv-2',
          internalSources: [],
          dataTimestamp: null,
          limitations: [],
        });
        handlers.onChunk('Aucune donnée disponible dans la plateforme pour cette demande.');
        return { conversationId: 'conv-2' };
      },
    );

    renderBubble();
    await ask('Question sans données.');

    expect(
      await screen.findByText('Aucune donnée disponible dans la plateforme pour cette demande.'),
    ).toBeInTheDocument();
    expect(screen.getByText('aucune')).toBeInTheDocument();
    expect(screen.getByText('inconnue')).toBeInTheDocument();
  });
});

describe('AiChatBubble — délai d’attente', () => {
  it('humanise un quota de fournisseur exprimé en heures', async () => {
    api.chatStream.mockRejectedValue(
      new ApiClientError('Quota du fournisseur IA dépassé ; réessayez plus tard', 429, undefined, 62084),
    );

    const view = renderBubble();
    await ask('Quelles alertes sont publiées ?');

    expect(await screen.findByText('Limite atteinte. Réessayez dans 17 h 15.')).toBeInTheDocument();
    expect(screen.getByText('Trop de requêtes — réessayez dans 17 h 15.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message à l’assistant')).toHaveAttribute(
      'placeholder',
      'Attendre 17 h 15…',
    );

    // Le compte à rebours est un intervalle : on démonte pour le purger.
    view.unmount();
  });

  it('garde les secondes pour la limite de débit de l’API', async () => {
    api.chatStream.mockRejectedValue(
      new ApiClientError("Trop de requêtes vers l'assistant.", 429, undefined, 39),
    );

    const view = renderBubble();
    await ask('Quelles alertes sont publiées ?');

    expect(await screen.findByText('Limite atteinte. Réessayez dans 39 s.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message à l’assistant')).toHaveAttribute(
      'placeholder',
      'Attendre 39 s…',
    );

    view.unmount();
  });
});

describe('AiChatBubble — historique', () => {
  it('recharge une conversation passée avec ses sources, sa date et ses limites', async () => {
    api.conversations.mockResolvedValue(historyPage([historyRow()]));
    api.conversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Cyclone Batsirai',
      createdAt: '2026-10-14T08:00:00.000Z',
      updatedAt: '2026-10-14T09:30:00.000Z',
      messages: [
        {
          id: 'm-1',
          conversationId: 'conv-1',
          role: 'UTILISATEUR',
          content: 'Où est passé le cyclone ?',
          tokenCount: 8,
          metadata: null,
          createdAt: '2026-10-14T08:00:00.000Z',
        },
        {
          id: 'm-2',
          conversationId: 'conv-1',
          role: 'OUTIL',
          content: '{"tool":"getActiveEvents"}',
          tokenCount: 12,
          metadata: { tool: 'getActiveEvents' },
          createdAt: '2026-10-14T08:00:01.000Z',
        },
        {
          id: 'm-3',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          content: 'Le cyclone est clos depuis 2022.',
          tokenCount: 10,
          metadata: {
            internalSources: ['getActiveEvents', 'getEventSummary'],
            dataTimestamp: '2022-02-05T06:00:00.000Z',
            limitations: ['Aucun impact de commune n’est renseigné.'],
          },
          createdAt: '2026-10-14T08:00:02.000Z',
        },
      ],
    });

    const user = await openHistory();
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir la conversation « Cyclone Batsirai »' }),
    );

    expect(await screen.findByText('Le cyclone est clos depuis 2022.')).toBeInTheDocument();
    // Le tour d'outil n'est pas affiché dans le fil : seuls l'échange visible compte.
    expect(screen.queryByText('{"tool":"getActiveEvents"}')).not.toBeInTheDocument();
    expect(screen.getByText('Données consultées :')).toBeInTheDocument();
    expect(screen.getByText('Aucun impact de commune n’est renseigné.')).toBeInTheDocument();
  });

  it('poursuit la conversation rechargée au lieu d’en créer une nouvelle', async () => {
    api.conversations.mockResolvedValue(historyPage([historyRow()]));
    api.conversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Cyclone Batsirai',
      createdAt: '2026-10-14T08:00:00.000Z',
      updatedAt: '2026-10-14T09:30:00.000Z',
      messages: [
        {
          id: 'm-3',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          content: 'Le cyclone est clos depuis 2022.',
          tokenCount: 10,
          metadata: { internalSources: [], dataTimestamp: null, limitations: [] },
          createdAt: '2026-10-14T08:00:02.000Z',
        },
      ],
    });
    api.chatStream.mockImplementation(async () => ({ conversationId: 'conv-1' }));

    const user = await openHistory();
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir la conversation « Cyclone Batsirai »' }),
    );
    await screen.findByText('Le cyclone est clos depuis 2022.');

    await user.type(screen.getByLabelText('Message à l’assistant'), 'Et les communes exposées ?');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    // La question suivante doit rester dans la conversation rouverte.
    expect(api.chatStream).toHaveBeenCalledTimes(1);
    expect(api.chatStream.mock.calls[0][1]).toEqual({
      message: 'Et les communes exposées ?',
      conversationId: 'conv-1',
    });
  });

  it('repart d’un fil vierge quand la conversation ouverte est supprimée', async () => {
    api.conversations.mockResolvedValue(historyPage([historyRow()]));
    api.conversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Cyclone Batsirai',
      createdAt: '2026-10-14T08:00:00.000Z',
      updatedAt: '2026-10-14T09:30:00.000Z',
      messages: [
        {
          id: 'm-3',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          content: 'Le cyclone est clos depuis 2022.',
          tokenCount: 10,
          metadata: { internalSources: [], dataTimestamp: null, limitations: [] },
          createdAt: '2026-10-14T08:00:02.000Z',
        },
      ],
    });
    api.remove.mockResolvedValue(undefined);

    const user = await openHistory();
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir la conversation « Cyclone Batsirai »' }),
    );
    await screen.findByText('Le cyclone est clos depuis 2022.');

    await user.click(screen.getByRole('button', { name: 'Historique des conversations' }));
    await user.click(
      await screen.findByRole('button', { name: 'Supprimer la conversation « Cyclone Batsirai »' }),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    // Le fil ne doit plus afficher un échange que le serveur ne connaît plus.
    await waitFor(() =>
      expect(screen.queryByText('Le cyclone est clos depuis 2022.')).not.toBeInTheDocument(),
    );
    expect(api.remove).toHaveBeenCalledWith('conv-1');
  });

  it('n’invente pas de sources pour un message antérieur à leur persistance', async () => {
    api.conversations.mockResolvedValue(historyPage([historyRow()]));
    api.conversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Cyclone Batsirai',
      createdAt: '2026-10-14T08:00:00.000Z',
      updatedAt: '2026-10-14T09:30:00.000Z',
      messages: [
        {
          id: 'm-3',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          content: 'Réponse ancienne, sans métadonnées.',
          tokenCount: 10,
          metadata: null,
          createdAt: '2026-10-14T08:00:02.000Z',
        },
      ],
    });

    const user = await openHistory();
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir la conversation « Cyclone Batsirai »' }),
    );

    expect(await screen.findByText('Réponse ancienne, sans métadonnées.')).toBeInTheDocument();
    // « aucune » serait un mensonge par omission : on ne sait pas quelles données
    // ont servi. Mieux vaut ne rien afficher.
    expect(screen.queryByText('Données consultées :')).not.toBeInTheDocument();
    expect(screen.queryByText('aucune')).not.toBeInTheDocument();
  });
});

describe('AiChatBubble — arrêt de la génération', () => {
  it('interrompt la génération au clic sur Stop, sans message d’erreur', async () => {
    // Flux qui n'émet qu'un premier morceau puis reste ouvert : il ne se
    // termine que si on l'interrompt (comme une longue génération réelle).
    api.chatStream.mockImplementation(
      (_token: string | null, _body: unknown, handlers: AiStreamHandlers) => {
        handlers.onChunk('Début de réponse…');
        return new Promise((_resolve, reject) => {
          handlers.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      },
    );

    renderBubble();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ouvrir l’assistant IA' }));
    await user.type(screen.getByLabelText('Message à l’assistant'), 'Quelles alertes ?');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    // La réponse partielle s'affiche pendant le flux, et Stop remplace Envoyer.
    await screen.findByText('Début de réponse…');
    const stop = await screen.findByRole('button', { name: 'Arrêter la génération' });
    await user.click(stop);

    // L'abort rejette sans erreur affichée : la réponse partielle est effacée et
    // l'entrée redevient utilisable pour poser une autre question.
    await waitFor(() => expect(screen.queryByText('Début de réponse…')).not.toBeInTheDocument());
    expect(screen.queryByText('Erreur assistant')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message à l’assistant')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });
});
