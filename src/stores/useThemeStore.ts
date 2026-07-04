/**
 * useThemeStore — Caribbean (light) / Chalk Dark (dark) UI preference.
 *
 * Theme is a UI preference, not user data, so persisting it to localStorage
 * is outside the analyzer's "your data never leaves the browser" promise.
 * The store also applies the right class to <html> whenever it changes so
 * the Tailwind CSS-variable palette swaps in.
 *
 * With no stored preference the app follows the OS `prefers-color-scheme`;
 * that resolution happens in the FOUC-prevention script in index.html
 * before first paint, so the initial read just honours the <html> class.
 * Retired stored values ('neon'/'sky') are treated as no preference there.
 */
import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'element08.theme';

function readInitial(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  // The index.html script already resolved stored preference vs OS
  // preference into the <html> class — treat it as the source of truth.
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
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
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    applyClass(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* blocked */ }
    set({ theme: next });
  },
}));
