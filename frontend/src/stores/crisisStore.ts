import { create } from 'zustand';

interface CrisisState {
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
}

export const useCrisisStore = create<CrisisState>((set) => ({
  activeEventId: null,
  setActiveEventId: (id) => set({ activeEventId: id }),
}));
