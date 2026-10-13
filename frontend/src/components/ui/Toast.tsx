import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Set<number>());

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastSeq;
    setItems((prev) => [...prev, { id, message, tone }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
    timers.current.add(timer);
  }, []);

  // Les minuteurs d'auto-fermeture sont purgés au démontage : sinon le rappel
  // peut s'exécuter après la disparition du provider (mise à jour d'un composant
  // démonté, et `window` déjà détruit en fin d'environnement de test).
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-[min(100vw-2rem,22rem)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur',
              item.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-950',
              item.tone === 'error' && 'border-red-200 bg-red-50 text-red-950',
              item.tone === 'info' && 'border-line bg-surface text-ink',
            )}
            role="status"
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider');
  return ctx;
}
