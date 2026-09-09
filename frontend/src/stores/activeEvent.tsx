import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '@/api';
import type { EventListItem } from '@/types';
import { useCrisisStore } from '@/stores/crisisStore';

interface ActiveEventValue {
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  activeEvent: EventListItem | null;
  activeEventLoading: boolean;
}

const ActiveEventContext = createContext<ActiveEventValue | null>(null);

export function ActiveEventProvider({ children }: { children: ReactNode }) {
  const activeEventId = useCrisisStore((s) => s.activeEventId);
  const setActiveEventId = useCrisisStore((s) => s.setActiveEventId);

  const activeEventQ = useQuery({
    queryKey: ['active-event', activeEventId],
    queryFn: () => eventsApi.get(activeEventId ?? '') as Promise<EventListItem>,
    enabled: Boolean(activeEventId),
    staleTime: 30_000,
  });

  const value = useMemo<ActiveEventValue>(
    () => ({
      activeEventId,
      setActiveEventId,
      activeEvent: activeEventId ? (activeEventQ.data ?? null) : null,
      activeEventLoading: activeEventQ.isLoading,
    }),
    [activeEventId, setActiveEventId, activeEventQ.data, activeEventQ.isLoading],
  );

  return <ActiveEventContext.Provider value={value}>{children}</ActiveEventContext.Provider>;
}

export function useActiveEvent() {
  const ctx = useContext(ActiveEventContext);
  if (!ctx) throw new Error('useActiveEvent doit être utilisé dans ActiveEventProvider');
  return ctx;
}