/**
 * LanguageSwitcher — a small fixed <select> that changes the UI language. Sits
 * at the top-right next to the ThemeToggle, matching its floating chrome.
 */
import { LANGS, useLangValue, setLang, type Lang } from './useLang';

export function LanguageSwitcher() {
  const lang = useLangValue();
  return (
    <select
      aria-label="Language"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className="fixed right-16 top-4 z-50 rounded-full border border-border bg-panel/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-textDim backdrop-blur transition-colors hover:border-accent hover:text-accent focus:border-accent focus:outline-none"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} className="bg-panel text-text normal-case tracking-normal">
          {l.name}
        </option>
      ))}
    </select>
  );
}
