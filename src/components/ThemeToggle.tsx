/**
 * ThemeToggle — fixed-position theme picker: a swatch button that opens a
 * small menu of the four themes. Mounted once at the app root (see main.tsx)
 * so the theme can change from any route.
 */
import { useEffect, useRef, useState } from 'react';
import { THEMES, useThemeStore, type ThemeMode } from '../stores/useThemeStore';
import { useT } from '../i18n';

const LABEL: Record<ThemeMode, string> = {
  arcade: 'Block Arcade',
  dark: 'Chalk Dark',
  light: 'Caribbean',
  mid: 'Titanium',
};

/** Page, board and accent of each theme, for its swatch. */
const SWATCH: Record<ThemeMode, [string, string, string]> = {
  arcade: ['#3D5599', '#24316A', '#46D046'],
  dark: ['#1F1D1A', '#2A2724', '#1BAFE0'],
  light: ['#D9F1F6', '#FFFFFF', '#F2764F'],
  mid: ['#C2CBD1', '#F8FAFB', '#E0002A'],
};

function Swatch({ theme, size = 18 }: { theme: ThemeMode; size?: number }) {
  const [page, board, accent] = SWATCH[theme];
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="17" rx="5" fill={page} stroke="rgba(0,0,0,0.25)" />
      <rect x="3" y="4" width="12" height="8" rx="2.5" fill={board} />
      <rect x="5" y="13" width="8" height="2.5" rx="1.25" fill={accent} />
    </svg>
  );
}

export function ThemeToggle() {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed right-4 top-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('Theme')}: ${LABEL[theme]}`}
        title={`${t('Theme')}: ${LABEL[theme]}`}
        className="pill h-9 w-9 justify-center"
      >
        <Swatch theme={theme} />
      </button>
      {open && (
        <div role="menu" className="board absolute right-0 mt-2 w-48 p-1.5">
          {THEMES.map((m) => (
            <button
              key={m}
              role="menuitemradio"
              aria-checked={theme === m}
              onClick={() => {
                setTheme(m);
                setOpen(false);
              }}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-bold transition-colors',
                theme === m ? 'bg-accent/15 text-accent' : 'text-text hover:bg-surface',
              ].join(' ')}
            >
              <Swatch theme={m} />
              {LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
