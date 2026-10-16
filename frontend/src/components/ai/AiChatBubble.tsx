import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Send, User, X, MessageCircle } from 'lucide-react';
import { aiApi } from '@/api';
import { ApiClientError } from '@/api/client';
import type { AiStreamMeta } from '@/api/ai-stream';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AiAnswerMeta } from '@/components/ai/AiAnswerMeta';
import { cn, formatRetryDelay } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Sources, date et limites du tour : présentes sur les réponses de l'assistant. */
  meta?: AiStreamMeta;
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'Bonjour. Je suis l’assistant MadaRisk. Posez une question sur les risques, alertes ou territoires.',
};

export function AiChatBubble() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
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
    },
    onError: (err) => {
      setStreamedAnswer(null);
      setStreamedMeta(null);
      streamedMetaRef.current = null;
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatM.isPending || unavailable || retryAfter > 0) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    chatM.mutate(text);
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          className="pointer-events-auto flex h-[min(520px,70vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-brand/15 bg-white shadow-2xl"
          role="dialog"
          aria-label="Assistant IA MadaRisk"
        >
          <header className="flex items-center justify-between gap-2 bg-brand px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-white/15">
                <Bot className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Assistant IA</p>
                <p className="text-[11px] text-emerald-100">Aide salle de crise</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-white/15"
              aria-label="Fermer l’assistant"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' ? (
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                    <Bot className="size-3.5" />
                  </span>
                ) : null}
                <div
                  className={cn(
                    'max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-brand text-white'
                      : 'border border-line bg-surface text-ink shadow-sm',
                  )}
                >
                  {m.content}
                  {m.meta ? <AiAnswerMeta meta={m.meta} /> : null}
                </div>
                {m.role === 'user' ? (
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                    <User className="size-3.5" />
                  </span>
                ) : null}
              </div>
            ))}

            {streamedAnswer !== null ? (
              <div className="flex gap-2 justify-start">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <Bot className="size-3.5" />
                </span>
                <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink shadow-sm">
                  {streamedAnswer}
                  <span
                    className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-brand align-middle"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Réponse en cours de génération…</span>
                  {streamedMeta ? <AiAnswerMeta meta={streamedMeta} /> : null}
                </div>
              </div>
            ) : null}
          </div>

          {unavailable ? (
            <div className="border-t border-brand/10 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Assistant non disponible pour le moment.
            </div>
          ) : retryAfter > 0 ? (
            <div className="border-t border-brand/10 bg-orange-50 px-3 py-2 text-xs text-orange-900">
              Trop de requêtes — réessayez dans {formatRetryDelay(retryAfter)}.
            </div>
          ) : null}

          {!unavailable ? (
            <form onSubmit={onSubmit} className="flex gap-2 border-t border-line bg-surface p-3">
              <input
                className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                placeholder={retryAfter > 0 ? `Attendre ${formatRetryDelay(retryAfter)}…` : 'Votre question…'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={retryAfter > 0 || chatM.isPending}
                maxLength={5000}
                aria-label="Message à l’assistant"
              />
              <Button
                type="submit"
                size="sm"
                loading={chatM.isPending}
                disabled={retryAfter > 0}
                aria-label="Envoyer"
                className="!h-10 !px-3"
              >
                <Send className="size-4" />
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'pointer-events-auto flex size-14 items-center justify-center rounded-full shadow-xl transition',
          'bg-brand text-white hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          open && 'ring-4 ring-brand/25',
        )}
        aria-label={open ? 'Fermer l’assistant IA' : 'Ouvrir l’assistant IA'}
        aria-expanded={open}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
