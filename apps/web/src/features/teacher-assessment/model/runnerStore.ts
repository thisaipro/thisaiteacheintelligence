/* Runner UI state only (never answers — those live in the React Query cache). */
import { create } from 'zustand';

interface RunnerUI {
  picked: string | null; // label picked for tap-to-place
  noteOpen: boolean;
  announcement: string; // aria-live text
  pick: (label: string | null) => void;
  setNoteOpen: (v: boolean) => void;
  announce: (s: string) => void;
  resetForItem: (noteOpen: boolean) => void;
}

export const useRunnerUI = create<RunnerUI>((set) => ({
  picked: null,
  noteOpen: false,
  announcement: '',
  pick: (picked) => set({ picked }),
  setNoteOpen: (noteOpen) => set({ noteOpen }),
  // Toggle a trailing space so identical consecutive messages are re-announced.
  announce: (s) => set((st) => ({ announcement: st.announcement === s ? s + ' ' : s })),
  resetForItem: (noteOpen) => set({ picked: null, noteOpen }),
}));
