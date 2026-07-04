/**
 * useDiveCompareStore — selections for the /compare/dives view.
 *
 * Three independent modes (depth dives, breath holds, pool dives), each
 * with its own selection list so switching modes doesn't lose a pick.
 * In-memory only (matches the analyzer's privacy promise).
 *
 * A slot's `idx` means diveIdx for depth/pool and holdIdx for holds.
 * Colours are assigned on add and stay stable while the slot is selected.
 */
import { create } from 'zustand';

export type CompareMode = 'depth' | 'holds' | 'pool';

/** Slot colours, in assignment order. A slot's colour is assigned once and
 *  stays stable while selected, so these are intentionally theme-agnostic:
 *  Open Water mid-tones picked to stay distinct on both the white Caribbean
 *  cards and the Chalk Dark panels. */
export const COMPARE_COLORS = [
  '#1bafe0', // sky cyan (Chalk Dark accent)
  '#f2764f', // coral (Caribbean accent)
  '#1fb894', // teal green
  '#e8a93a', // golden sand
  '#8a5fd6', // violet
  '#e84393', // pink
  '#e24b3c', // red
  '#5e828a', // slate
];

/** Per-mode cap. Depth curves are dense (3 reads cleanly); holds mirror
 *  the mobile app's 8; pool sits in between. */
export const MAX_BY_MODE: Record<CompareMode, number> = {
  depth: 3,
  holds: 8,
  pool: 6,
};

export interface CompareSlot {
  sessionId: number;
  idx: number;
  color: string;
}

interface DiveCompareState {
  selections: Record<CompareMode, CompareSlot[]>;
  /** Add the item if absent and there's room; remove it if already picked. */
  toggle: (mode: CompareMode, sessionId: number, idx: number) => void;
  remove: (mode: CompareMode, sessionId: number, idx: number) => void;
  clear: (mode: CompareMode) => void;
}

const same = (s: CompareSlot, sessionId: number, idx: number) =>
  s.sessionId === sessionId && s.idx === idx;

export const useDiveCompareStore = create<DiveCompareState>((set) => ({
  selections: { depth: [], holds: [], pool: [] },
  toggle: (mode, sessionId, idx) =>
    set((st) => {
      const list = st.selections[mode];
      if (list.some((s) => same(s, sessionId, idx))) {
        return {
          selections: {
            ...st.selections,
            [mode]: list.filter((s) => !same(s, sessionId, idx)),
          },
        };
      }
      if (list.length >= MAX_BY_MODE[mode]) return st;
      const used = new Set(list.map((s) => s.color));
      const color = COMPARE_COLORS.find((c) => !used.has(c)) ?? COMPARE_COLORS[0];
      return {
        selections: {
          ...st.selections,
          [mode]: [...list, { sessionId, idx, color }],
        },
      };
    }),
  remove: (mode, sessionId, idx) =>
    set((st) => ({
      selections: {
        ...st.selections,
        [mode]: st.selections[mode].filter((s) => !same(s, sessionId, idx)),
      },
    })),
  clear: (mode) =>
    set((st) => ({ selections: { ...st.selections, [mode]: [] } })),
}));
