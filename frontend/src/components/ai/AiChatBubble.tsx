import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Send, User, X, MessageCircle } from 'lucide-react';
import { aiApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = window.setInterval(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [retryAfter]);

  const chatM = useMutation({
    mutationFn: (message: string) => aiApi.chat(message, conversationId),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
      setUnavailable(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.status === 503) {
          setUnavailable(true);
          toast('Assistant non disponible', 'error');
          return;
        }
        if (err.status === 429) {
          const wait = err.retryAfter && err.retryAfter > 0 ? err.retryAfter : 60;
          setRetryAfter(wait);
          toast(`Limite atteinte. Réessayez dans ${wait}s.`, 'error');
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
                <p className="text-[11px] text-teal-100">Aide salle de crise</p>
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

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f4fafb] p-3">
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
                      : 'border border-brand/10 bg-white text-ink shadow-sm',
                  )}
                >
                  {m.content}
                </div>
                {m.role === 'user' ? (
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                    <User className="size-3.5" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {unavailable ? (
            <div className="border-t border-brand/10 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Assistant non disponible pour le moment.
            </div>
          ) : retryAfter > 0 ? (
            <div className="border-t border-brand/10 bg-orange-50 px-3 py-2 text-xs text-orange-900">
              Trop de requêtes — réessayez dans {retryAfter}s.
            </div>
          ) : null}

          {!unavailable ? (
            <form onSubmit={onSubmit} className="flex gap-2 border-t border-brand/10 bg-white p-3">
              <input
                className="h-10 flex-1 rounded-xl border border-brand/20 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder={retryAfter > 0 ? `Attendre ${retryAfter}s…` : 'Votre question…'}
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
