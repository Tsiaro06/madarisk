import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import type { AiStreamHandlers } from '@/api/ai-stream';
import { AiChatBubble } from './AiChatBubble';

const api = vi.hoisted(() => ({ chatStream: vi.fn() }));

vi.mock('@/api', () => ({ aiApi: { chatStream: api.chatStream } }));

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
  // jsdom n'implémente pas le défilement des éléments ; le composant recale la
  // liste sur le dernier message à chaque rendu.
  Element.prototype.scrollTo = () => {};
});

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
