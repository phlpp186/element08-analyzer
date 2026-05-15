/**
 * useThemeStore — light / dark UI preference.
 *
 * Theme is a UI preference, not user data, so persisting it to localStorage
 * is outside the analyzer's "your data never leaves the browser" promise.
 * The store also applies the right class to <html> whenever it changes so
 * the Tailwind CSS-variable palette swaps in.
 */
import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'element08.theme';

function readInitial(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  // Honour whatever the FOUC-prevention script in index.html set, falling
  // back to a fresh localStorage read.
  if (document.documentElement.classList.contains('light')) return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage blocked — stay on default */
  }
  return 'dark';
}

function applyClass(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('light', theme === 'light');
}

interface ThemeState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  setTheme: (theme) => {
    applyClass(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* blocked */ }
    set({ theme });
  },
  toggle: () => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
    applyClass(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* blocked */ }
    set({ theme: next });
  },
}));
