/**
 * useDiveCompareStore — up to 3 individual dives selected for overlay on
 * the /compare/dives view.
 *
 * In-memory only (matches the analyzer's privacy promise). Each slot keeps
 * a stable colour assigned on add, so a dive keeps its colour as long as
 * it stays selected.
 */
import { create } from 'zustand';

/** Slot colours, in assignment order. Distinct on the dark surface. */
export const DIVE_COMPARE_COLORS = ['#4fc3f7', '#ff5f9e', '#66bb6a'];
export const MAX_COMPARE_DIVES = 3;

export interface DiveSlot {
  sessionId: number;
  diveIdx: number;
  color: string;
}

interface DiveCompareState {
  slots: DiveSlot[];
  /** Add the dive if absent and there's room; remove it if already picked. */
  toggleDive: (sessionId: number, diveIdx: number) => void;
  removeDive: (sessionId: number, diveIdx: number) => void;
  clear: () => void;
}

const sameDive = (s: DiveSlot, sessionId: number, diveIdx: number) =>
  s.sessionId === sessionId && s.diveIdx === diveIdx;

export const useDiveCompareStore = create<DiveCompareState>((set) => ({
  slots: [],
  toggleDive: (sessionId, diveIdx) =>
    set((s) => {
      if (s.slots.some((d) => sameDive(d, sessionId, diveIdx))) {
        return { slots: s.slots.filter((d) => !sameDive(d, sessionId, diveIdx)) };
      }
      if (s.slots.length >= MAX_COMPARE_DIVES) return s;
      const used = new Set(s.slots.map((d) => d.color));
      const color = DIVE_COMPARE_COLORS.find((c) => !used.has(c)) ?? DIVE_COMPARE_COLORS[0];
      return { slots: [...s.slots, { sessionId, diveIdx, color }] };
    }),
  removeDive: (sessionId, diveIdx) =>
    set((s) => ({ slots: s.slots.filter((d) => !sameDive(d, sessionId, diveIdx)) })),
  clear: () => set({ slots: [] }),
}));
