/**
 * useCompareStore — user-defined comparison periods and selected metric.
 *
 * In-memory only (matches the analyzer's privacy promise). The user
 * re-adds periods on each visit; we don't persist to localStorage.
 */
import { create } from 'zustand';
import type { Metric, Period } from '../lib/analytics/periodCompare';

interface CompareState {
  periods: Period[];
  metric: Metric;
  addPeriod: (p: Period) => void;
  updatePeriod: (id: string, patch: Partial<Period>) => void;
  removePeriod: (id: string) => void;
  setMetric: (m: Metric) => void;
  reset: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  periods: [],
  metric: 'sessions',
  addPeriod: (p) => set((s) => ({ periods: [...s.periods, p] })),
  updatePeriod: (id, patch) =>
    set((s) => ({
      periods: s.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  removePeriod: (id) =>
    set((s) => ({ periods: s.periods.filter((p) => p.id !== id) })),
  setMetric: (m) => set({ metric: m }),
  reset: () => set({ periods: [], metric: 'sessions' }),
}));
