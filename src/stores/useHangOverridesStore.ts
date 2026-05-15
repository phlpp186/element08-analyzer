/**
 * useHangOverridesStore — manual corrections to auto-detected hang
 * segments for a depth dive.
 *
 * The hang-detection algorithm in the mobile app is good but not perfect
 * on slow / soft-touch dives. The user can edit, delete, or add hangs in
 * the analyzer's depth dive player; the corrections are kept here and
 * survive page reloads via localStorage (UI preference, outside the
 * privacy promise that backup data never leaves the browser).
 *
 * An override fully replaces the auto-detected hang list for a single
 * dive. When no override is set, the auto-detected hangs apply.
 */
import { create } from 'zustand';
import type { HangSegment } from '../lib/analytics/diveProfile';

const STORAGE_KEY = 'element08.hangOverrides';

function diveKey(sessionId: number, diveIdx: number): string {
  return `${sessionId}-${diveIdx}`;
}

function readInitial(): Record<string, HangSegment[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return {};
    return parsed as Record<string, HangSegment[]>;
  } catch {
    return {};
  }
}

function persist(state: Record<string, HangSegment[]>) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (Object.keys(state).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* localStorage blocked — corrections live in memory only */
  }
}

interface HangOverridesState {
  overrides: Record<string, HangSegment[]>;
  /** Replace the entire hangs array for a dive. Empty array is valid
   *  (means "this dive has no hangs even though auto-detect found some"). */
  set: (sessionId: number, diveIdx: number, hangs: HangSegment[]) => void;
  /** Drop the override for a dive — falls back to auto-detected hangs. */
  clear: (sessionId: number, diveIdx: number) => void;
  /** Look up an override. Undefined means "use auto-detected". */
  get: (sessionId: number, diveIdx: number) => HangSegment[] | undefined;
}

export const useHangOverridesStore = create<HangOverridesState>((set, get) => ({
  overrides: readInitial(),
  set: (sessionId, diveIdx, hangs) =>
    set((s) => {
      const next = { ...s.overrides, [diveKey(sessionId, diveIdx)]: hangs };
      persist(next);
      return { overrides: next };
    }),
  clear: (sessionId, diveIdx) =>
    set((s) => {
      const next = { ...s.overrides };
      delete next[diveKey(sessionId, diveIdx)];
      persist(next);
      return { overrides: next };
    }),
  get: (sessionId, diveIdx) => get().overrides[diveKey(sessionId, diveIdx)],
}));
