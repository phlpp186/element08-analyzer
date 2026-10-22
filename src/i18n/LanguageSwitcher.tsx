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
      className="pill fixed right-16 top-4 z-50 h-9 px-3 font-mono text-[11px] uppercase tracking-widest focus:border-accent focus:outline-none"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} className="bg-panel text-text normal-case tracking-normal">
          {l.name}
        </option>
      ))}
    </select>
  );
}
