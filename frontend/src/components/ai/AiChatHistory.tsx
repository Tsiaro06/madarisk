import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { aiApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

interface AiChatHistoryProps {
  /** Conversation ouverte dans le fil, mise en évidence dans la liste. */
  activeId?: string;
  onSelect: (id: string) => void;
  /** Démarrer une conversation vierge. */
  onNew: () => void;
  /** Revenir au fil de discussion. */
  onBack: () => void;
  /**
   * Appelé après une suppression : la bulle doit oublier la conversation si
   * c'était celle qui est ouverte, sinon le fil continuerait d'afficher une
   * conversation qui n'existe plus et le tour suivant échouerait en 404.
   */
  onDeleted: (id: string) => void;
}

/**
 * Historique des conversations de l'utilisateur connecté.
 *
 * Les conversations sont déjà enregistrées par utilisateur côté serveur ; cette
 * vue les rend consultables et supprimables, sinon l'enregistrement restait
 * invisible et une conversation abandonnée l'était définitivement.
 *
 * La suppression se confirme sur place plutôt que par une modale : la boîte de
 * confirmation du projet est réservée aux interventions administratives, et son
 * texte d'avertissement (« données générées automatiquement ») décrirait mal la
 * suppression d'une conversation personnelle.
 */
export function AiChatHistory({
  activeId,
  onSelect,
  onNew,
  onBack,
  onDeleted,
}: AiChatHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['ai-conversations', page],
    queryFn: () => aiApi.conversations({ page, limit: PAGE_SIZE }),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => aiApi.remove(id),
    onSuccess: (_result, id) => {
      setConfirmId(null);
      toast('Conversation supprimée', 'success');
      onDeleted(id);
      // Page vidée par la suppression : revenir en arrière pour ne pas laisser
      // l'utilisateur devant une liste vide alors que d'autres pages existent.
      if ((listQ.data?.data.length ?? 0) <= 1 && page > 1) {
        setPage(page - 1);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Suppression impossible', 'error');
    },
  });

  const rows = listQ.data?.data ?? [];
  const totalPages = listQ.data?.meta?.totalPages ?? 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-brand/10 bg-brand-soft/40 px-3 py-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-brand-deep hover:bg-white/60"
          aria-label="Revenir à la conversation"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </button>
        <p className="text-xs font-semibold text-brand-deep">Historique des conversations</p>
        <button
          type="button"
          className="rounded-lg p-1.5 text-brand-deep hover:bg-white/60"
          aria-label="Nouvelle conversation"
          onClick={onNew}
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
        {listQ.isError ? (
          <AlertBanner tone="danger" title="Échec du chargement">
            Impossible de charger l’historique. Réessayez plus tard.
          </AlertBanner>
        ) : listQ.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aucune conversation enregistrée"
            description="Vos échanges avec l’assistant apparaîtront ici."
            icon={<MessagesSquare className="size-6" />}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((conversation) => {
              const title = conversation.title ?? 'Conversation sans titre';
              return (
                <li key={conversation.id}>
                  {confirmId === conversation.id ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                      <p className="text-xs text-red-900">
                        Supprimer « {title} » ? Cette action est définitive.
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={removeM.isPending}
                          onClick={() => removeM.mutate(conversation.id)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-xl border bg-surface p-2.5 transition',
                        activeId === conversation.id
                          ? 'border-brand/40 ring-1 ring-brand/20'
                          : 'border-line hover:border-brand/30',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Ouvrir la conversation « ${title} »`}
                        onClick={() => onSelect(conversation.id)}
                      >
                        <p className="truncate text-sm font-medium text-ink">{title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {formatDate(conversation.updatedAt)} · {conversation.messageCount} message
                          {conversation.messageCount > 1 ? 's' : ''}
                        </p>
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Supprimer la conversation « ${title} »`}
                        onClick={() => setConfirmId(conversation.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!listQ.isLoading && !listQ.isError ? (
        <Pagination
          page={listQ.data?.meta?.page ?? page}
          totalPages={totalPages}
          onChange={setPage}
          className="border-t border-line bg-surface px-3 py-2"
        />
      ) : null}
    </div>
  );
}
