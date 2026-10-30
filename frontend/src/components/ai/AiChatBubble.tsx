import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CloudSun,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Plus,
  Send,
  Square,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { aiApi } from '@/api';
import { ApiClientError } from '@/api/client';
import type { AiStreamMeta } from '@/api/ai-stream';
import type { AiMessage } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/Toast';
import { AiAnswerMeta } from '@/components/ai/AiAnswerMeta';
import { AiChatHistory } from '@/components/ai/AiChatHistory';
import { AiMarkdown } from '@/components/ai/AiMarkdown';
import { cn, formatRetryDelay } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Sources, date et limites du tour : présentes sur les réponses de l'assistant. */
  meta?: AiStreamMeta;
}

/**
 * Questions proposées au premier écran. Volontairement choisies parmi celles
 * que le socle d'outils déterministes sait servir sans paramètre : la première
 * question de l'utilisateur donne une réponse utile, pas une démonstration.
 */
const SUGGESTIONS: { icon: LucideIcon; question: string }[] = [
  { icon: TriangleAlert, question: 'Quelles sont les alertes en cours ?' },
  { icon: MapPin, question: 'Quelles communes sont prioritaires ?' },
  { icon: Activity, question: 'Quels événements sont en cours ?' },
  { icon: CloudSun, question: 'Quelle est la météo à Mananjary ?' },
];

/** Un message relu est affichable s'il fait partie de l'échange visible. */
function isVisibleMessage(message: AiMessage): boolean {
  return message.role === 'UTILISATEUR' || message.role === 'ASSISTANT';
}

/**
 * Une interruption volontaire (bouton Stop) fait rejeter la lecture du flux par
 * l'`AbortController` avec une erreur `AbortError`. Ce n'est pas une défaillance
 * à signaler à l'utilisateur : le serveur n'a rien persisté pour ce tour, le fil
 * reste simplement sans réponse.
 */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError'
  );
}

/**
 * Traduit un message persisté en message du fil.
 *
 * Les tours d'outil (`OUTIL`) sont écartés : ils portent des résultats bruts en
 * JSON, utiles à l'audit mais illisibles dans une conversation. Un message
 * antérieur à la persistance des métadonnées n'en a aucune : on n'affiche alors
 * aucun bloc de sources, plutôt que d'annoncer « aucune source » sur une réponse
 * dont on ne sait rien.
 */
function toChatMessage(message: AiMessage): ChatMessage {
  if (message.role !== 'ASSISTANT') return { role: 'user', content: message.content };

  const metadata = message.metadata;
  return {
    role: 'assistant',
    content: message.content,
    meta: metadata
      ? {
          conversationId: message.conversationId,
          internalSources: metadata.internalSources ?? [],
          dataTimestamp: metadata.dataTimestamp ?? null,
          limitations: metadata.limitations ?? [],
        }
      : undefined,
  };
}

/** Pastille de l'assistant, partagée par le fil, l'attente et l'écran d'accueil. */
function AssistantAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#12405f] to-[#062a47] text-white shadow-sm ring-1 ring-white/25',
        className,
      )}
    >
      <Bot className="size-3.5" />
    </span>
  );
}

/** Trois points animés : la réponse n'a pas encore commencé à s'écrire. */
function ThinkingDots() {
  return (
    <span aria-hidden className="flex items-end gap-1">
      <span className="ai-dot size-1.5 rounded-full bg-brand" />
      <span className="ai-dot size-1.5 rounded-full bg-brand [animation-delay:150ms]" />
      <span className="ai-dot size-1.5 rounded-full bg-brand [animation-delay:300ms]" />
    </span>
  );
}

export function AiChatBubble() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Vue affichée : le fil de discussion, ou la liste des conversations passées. */
  const [view, setView] = useState<'chat' | 'history'>('chat');
  // Réponse en cours de génération : affichée aussitôt, puis remplacée par le
  // message définitif. `streamedRef` évite de relire un état périmé au moment
  // où la mutation se termine.
  const [streamedAnswer, setStreamedAnswer] = useState<string | null>(null);
  const streamedRef = useRef('');
  // Métadonnées du tour en cours (outils, date, limites), reçues avant le premier
  // morceau de texte. `streamedMetaRef` joue le même rôle que `streamedRef` : au
  // moment où la mutation se termine, l'état n'est pas relisible de façon fiable.
  const [streamedMeta, setStreamedMeta] = useState<AiStreamMeta | null>(null);
  const streamedMetaRef = useRef<AiStreamMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamedAnswer, open]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = window.setInterval(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [retryAfter]);

  // Échap referme le panneau : c'est un dialogue flottant, il ne doit pas
  // capturer le clavier plus longtemps que nécessaire.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Une requête en vol est interrompue si le composant disparaît : inutile de
  // continuer à lire un flux dont plus personne n'affichera le résultat.
  useEffect(() => () => abortRef.current?.abort(), []);

  const chatM = useMutation({
    mutationFn: (message: string) => {
      streamedRef.current = '';
      streamedMetaRef.current = null;
      setStreamedAnswer('');
      setStreamedMeta(null);
      const controller = new AbortController();
      abortRef.current = controller;
      return aiApi.chatStream(
        useAuthStore.getState().accessToken,
        { message, conversationId },
        {
          onMeta: (meta) => {
            streamedMetaRef.current = meta;
            setStreamedMeta(meta);
          },
          onChunk: (text) => {
            streamedRef.current += text;
            setStreamedAnswer(streamedRef.current);
          },
          signal: controller.signal,
        },
      );
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      const answer = streamedRef.current;
      const meta = streamedMetaRef.current ?? undefined;
      // Repli : si le flux s'est terminé sans morceau exploitable, on n'ajoute
      // pas de bulle vide.
      if (answer) setMessages((prev) => [...prev, { role: 'assistant', content: answer, meta }]);
      setStreamedAnswer(null);
      setStreamedMeta(null);
      streamedMetaRef.current = null;
      setUnavailable(false);
      // Un tour crée la conversation ou la remonte en tête de l'historique : la
      // liste en cache est périmée dès que la réponse est arrivée. Aucune requête
      // n'est déclenchée tant que l'historique n'est pas affiché.
      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
    onError: (err) => {
      setStreamedAnswer(null);
      setStreamedMeta(null);
      streamedMetaRef.current = null;
      // Interruption volontaire : on efface la réponse partielle et on s'arrête
      // là, sans message d'erreur.
      if (isAbortError(err)) return;
      if (err instanceof ApiClientError) {
        if (err.status === 503) {
          setUnavailable(true);
          toast('Assistant non disponible', 'error');
          return;
        }
        if (err.status === 429) {
          const wait = err.retryAfter && err.retryAfter > 0 ? err.retryAfter : 60;
          setRetryAfter(wait);
          toast(`Limite atteinte. Réessayez dans ${formatRetryDelay(wait)}.`, 'error');
          return;
        }
        toast(err.message, 'error');
        return;
      }
      toast('Erreur assistant', 'error');
    },
  });

  /** Envoie une question dans le fil courant (formulaire ou suggestion). */
  const send = (text: string) => {
    const question = text.trim();
    if (!question || chatM.isPending || unavailable || retryAfter > 0) return;
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    chatM.mutate(question);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  /** Coupe la génération en cours : le flux est abandonné côté client. */
  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  /**
   * Ouvre une conversation passée : le fil est remplacé par ses messages et la
   * conversation devient active, donc la réponse suivante s'y ajoute au lieu de
   * créer une nouvelle conversation.
   */
  const openM = useMutation({
    mutationFn: (id: string) => aiApi.conversation(id),
    onSuccess: (conversation) => {
      const turns = conversation.messages.filter(isVisibleMessage).map(toChatMessage);
      setConversationId(conversation.id);
      setMessages(turns);
      setRetryAfter(0);
      setUnavailable(false);
      setView('chat');
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Conversation illisible', 'error');
    },
  });

  const startNewConversation = () => {
    // Un fil neuf n'a pas à recevoir la réponse du fil précédent : la génération
    // en cours est coupée avant de vider l'écran.
    abortRef.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setInput('');
    setRetryAfter(0);
    setUnavailable(false);
    setView('chat');
  };

  const handleDeleted = (id: string) => {
    // La conversation ouverte vient d'être supprimée : repartir d'un fil vierge
    // évite d'afficher un échange que le serveur ne connaît plus (le tour suivant
    // échouerait en 404).
    if (conversationId === id) startNewConversation();
  };

  // Écran d'accueil : aucune question posée, aucune conversation rouverte.
  const showWelcome = view === 'chat' && messages.length === 0 && !streamedAnswer;
  const thinking = chatM.isPending && !streamedAnswer;
  const locked = retryAfter > 0 || chatM.isPending;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          className="ai-panel pointer-events-auto flex h-[min(600px,calc(100dvh-7.5rem))] w-[min(410px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[26px] border border-line bg-surface shadow-[0_30px_70px_-25px_rgba(6,42,71,0.55),0_2px_8px_rgba(15,23,42,0.06)]"
          role="dialog"
          aria-label="Assistant IA MadaRisk"
        >
          <header className="relative overflow-hidden bg-gradient-to-br from-[#062a47] via-[#0e3d5f] to-[#1b5c80] px-4 py-3 text-white">
            {/* Halos décoratifs : profondeur du bandeau, sans image. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-white/10 blur-2xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-14 left-8 size-28 rounded-full bg-turquoise/25 blur-2xl"
            />

            <div className="relative flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="relative grid size-9 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
                  <Bot className="size-[18px]" />
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#0e3d5f] bg-emerald-400"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold leading-tight tracking-tight">
                    Assistant IA
                  </p>
                  <p className="truncate text-[11px] text-white/70">
                    Données MadaRisk · salle de crise
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {view === 'chat' && (messages.length > 0 || conversationId) ? (
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
                    aria-label="Nouvelle conversation"
                    onClick={startNewConversation}
                  >
                    <Plus className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    'grid size-7 place-items-center rounded-lg transition',
                    view === 'history'
                      ? 'bg-white/25 text-white'
                      : 'text-white/80 hover:bg-white/15 hover:text-white',
                  )}
                  aria-label="Historique des conversations"
                  aria-pressed={view === 'history'}
                  onClick={() => setView((current) => (current === 'history' ? 'chat' : 'history'))}
                >
                  <MessagesSquare className="size-4" />
                </button>
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
                  aria-label="Fermer l’assistant"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </header>

          {view === 'history' ? (
            <AiChatHistory
              activeId={conversationId}
              onSelect={(id) => openM.mutate(id)}
              onNew={startNewConversation}
              onBack={() => setView('chat')}
              onDeleted={handleDeleted}
            />
          ) : (
            <>
              <div
                ref={listRef}
                className="ai-scroll flex-1 space-y-3 overflow-y-auto bg-surface-subtle p-3.5"
              >
                {showWelcome ? (
                  <div className="ai-bubble flex flex-col items-center px-1 pb-1 pt-4 text-center">
                    <span className="grid size-14 place-items-center rounded-[20px] bg-gradient-to-br from-[#12405f] to-[#062a47] text-white shadow-lg shadow-[#062a47]/25 ring-1 ring-white/25">
                      <Bot className="size-7" />
                    </span>
                    <p className="mt-3 font-display text-base font-semibold tracking-tight text-ink">
                      Comment puis-je vous aider ?
                    </p>
                    <p className="mt-1 max-w-[17rem] text-xs leading-relaxed text-muted">
                      Interrogez les alertes, les événements et les territoires suivis par la
                      plateforme.
                    </p>

                    <div className="mt-4 grid w-full gap-2">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion.question}
                          type="button"
                          onClick={() => send(suggestion.question)}
                          disabled={locked}
                          className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 text-left text-xs font-medium text-ink transition hover:-translate-y-px hover:border-brand/40 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-deep transition group-hover:bg-brand group-hover:text-white">
                            <suggestion.icon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{suggestion.question}</span>
                          <ArrowUpRight className="size-3.5 shrink-0 text-muted transition group-hover:text-brand-deep" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={cn(
                      'ai-bubble flex gap-2',
                      m.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {m.role === 'assistant' ? <AssistantAvatar className="mt-0.5" /> : null}
                    <div
                      className={cn(
                        'max-w-[84%] px-3.5 py-2.5 text-sm leading-relaxed shadow-soft',
                        m.role === 'user'
                          ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-[#356b87] to-[#1f4a60] text-white'
                          : 'rounded-2xl rounded-bl-md border border-line bg-surface text-ink',
                      )}
                    >
                      {m.role === 'assistant' ? (
                        <AiMarkdown>{m.content}</AiMarkdown>
                      ) : (
                        m.content
                      )}
                      {m.meta ? <AiAnswerMeta meta={m.meta} /> : null}
                    </div>
                    {m.role === 'user' ? (
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-ink text-surface">
                        <User className="size-3.5" />
                      </span>
                    ) : null}
                  </div>
                ))}

                {thinking ? (
                  <div className="ai-bubble flex justify-start gap-2">
                    <AssistantAvatar className="mt-0.5" />
                    <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 shadow-soft">
                      <ThinkingDots />
                      <span className="text-[11.5px] font-medium text-muted">
                        Consultation des données…
                      </span>
                    </div>
                  </div>
                ) : null}

                {streamedAnswer ? (
                  <div className="ai-bubble flex justify-start gap-2">
                    <AssistantAvatar className="mt-0.5" />
                    <div className="max-w-[84%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-soft">
                      <AiMarkdown>{streamedAnswer}</AiMarkdown>
                      <span
                        className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse rounded-full bg-brand align-middle"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Réponse en cours de génération…</span>
                      {streamedMeta ? <AiAnswerMeta meta={streamedMeta} /> : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {unavailable ? (
                <div className="flex items-start gap-2 border-t border-amber-200/60 bg-amber-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <p>Assistant non disponible pour le moment.</p>
                </div>
              ) : retryAfter > 0 ? (
                <div className="flex items-start gap-2 border-t border-orange-200/60 bg-orange-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-orange-900 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <p>Trop de requêtes — réessayez dans {formatRetryDelay(retryAfter)}.</p>
                </div>
              ) : null}

              {!unavailable ? (
                <form
                  onSubmit={onSubmit}
                  className="border-t border-line bg-surface px-3 pb-2.5 pt-3"
                >
                  <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface-subtle px-2 py-1.5 transition focus-within:border-brand/50 focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/10">
                    <input
                      className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-muted/80 disabled:cursor-not-allowed"
                      placeholder={
                        retryAfter > 0
                          ? `Attendre ${formatRetryDelay(retryAfter)}…`
                          : 'Votre question…'
                      }
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={locked}
                      maxLength={5000}
                      aria-label="Message à l’assistant"
                    />
                    {chatM.isPending ? (
                      <button
                        type="button"
                        onClick={stopGeneration}
                        aria-label="Arrêter la génération"
                        className="grid size-8 shrink-0 place-items-center rounded-xl bg-risk-extreme/10 text-risk-extreme transition hover:bg-risk-extreme hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-risk-extreme/40"
                      >
                        <Square className="size-3 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!input.trim() || retryAfter > 0}
                        aria-label="Envoyer"
                        className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#12405f] to-[#062a47] text-white shadow-sm transition hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      >
                        <Send className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted">
                    Réponses construites à partir des données de la plateforme — à vérifier avant
                    décision.
                  </p>
                </form>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'pointer-events-auto relative grid size-14 place-items-center rounded-full',
          'bg-gradient-to-br from-[#12405f] via-[#0e3d5f] to-[#062a47] text-white',
          'shadow-[0_18px_38px_-12px_rgba(6,42,71,0.7)] ring-1 ring-white/20 transition',
          'hover:scale-[1.04] hover:shadow-[0_22px_44px_-12px_rgba(6,42,71,0.8)] active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          open && 'scale-95',
        )}
        aria-label={open ? 'Fermer l’assistant IA' : 'Ouvrir l’assistant IA'}
        aria-expanded={open}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-canvas bg-turquoise"
          />
        ) : null}
      </button>
    </div>
  );
}
