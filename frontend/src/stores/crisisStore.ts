import { create } from 'zustand';

const ACTIVE_EVENT_KEY = 'madarisk_active_event';

interface CrisisState {
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
}

function readActiveEventId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACTIVE_EVENT_KEY);
}

export const useCrisisStore = create<CrisisState>((set) => ({
  activeEventId: readActiveEventId(),
  setActiveEventId: (id) => {
    if (id) {
      localStorage.setItem(ACTIVE_EVENT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_EVENT_KEY);
    }
    set({ activeEventId: id });
  },
}));