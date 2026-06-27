/**
 * Language store — the analyzer's UI language, persisted to localStorage (key
 * shared across the ELEMENT | 08 web properties). English is the source language
 * written directly in the components; other languages are looked up at runtime
 * (see ./index.ts). A first visit detects the browser language.
 *
 * A tiny module-level store exposed via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'de' | 'fr' | 'es' | 'zh-Hans' | 'zh-Hant' | 'ko' | 'ja' | 'th';

export const LANGS: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'th', name: 'ไทย' },
];

const KEY = 'element08.lang';

function detect(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s && LANGS.some((l) => l.code === s)) return s as Lang;
  } catch {
    /* storage blocked */
  }
  const navs = navigator.languages || [navigator.language || 'en'];
  for (const raw of navs) {
    const lc = String(raw).toLowerCase();
    if (lc.startsWith('zh')) {
      return lc.includes('hant') || lc.includes('tw') || lc.includes('hk') || lc.includes('mo')
        ? 'zh-Hant'
        : 'zh-Hans';
    }
    const base = lc.split('-')[0];
    const m = LANGS.find((l) => l.code === lc || l.code.split('-')[0] === base);
    if (m) return m.code;
  }
  return 'en';
}

function applyHtmlLang(lang: Lang) {
  try {
    document.documentElement.setAttribute('lang', lang);
  } catch {
    /* no document */
  }
}

let current: Lang = detect();
applyHtmlLang(current);
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  applyHtmlLang(lang);
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive current language for components. */
export function useLangValue(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}
