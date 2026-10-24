/**
 * CompareModeHeader — shared header for the two Compare modes.
 *
 * A "Compare" title over a two-way switch: Seasons or Dives, each a large
 * segment with a line on what it compares. The two modes used to be the
 * title itself, the other one dimmed, and readers took it for a heading,
 * not a choice (feedback 2026-10-24). Below sits the mode's description.
 */
import { Link } from 'react-router-dom';
import { useT } from '../i18n';

type Mode = 'seasons' | 'dives';

export function CompareModeHeader({
  mode,
  description,
}: {
  mode: Mode;
  description: string;
}) {
  const t = useT();
  return (
    <header className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-light tracking-widest text-text">{t('Compare')}</h1>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to sessions')}
        </Link>
      </div>
      <nav
        aria-label={t('Compare')}
        className="grid max-w-2xl grid-cols-2 gap-1.5 rounded-2xl border border-border bg-abyss p-1.5"
      >
        <ModeLink
          to="/compare/seasons"
          label={t('Seasons')}
          hint={t('Training periods side by side')}
          active={mode === 'seasons'}
        />
        <ModeLink
          to="/compare/dives"
          label={t('Dives')}
          hint={t('Single dives and holds overlaid')}
          active={mode === 'dives'}
        />
      </nav>
      <p className="mt-3 max-w-xl text-sm text-textDim">{description}</p>
    </header>
  );
}

function ModeLink({
  to,
  label,
  hint,
  active,
}: {
  to: string;
  label: string;
  hint: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex min-w-0 flex-col rounded-xl px-4 py-2.5 transition-colors',
        active ? 'pill-on' : 'text-textDim hover:bg-panel hover:text-text',
      ].join(' ')}
    >
      <span className="font-heading text-lg font-bold leading-tight">{label}</span>
      <span className={`text-xs leading-snug ${active ? 'opacity-80' : 'opacity-70'}`}>{hint}</span>
    </Link>
  );
}
