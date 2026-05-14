/**
 * CompareModeHeader — shared header for the two Compare modes.
 *
 * Renders both mode titles side by side as large clickable headings: the
 * active mode is bright, the other dimmed and links to its route. Below
 * sits a mode-specific one-line description.
 */
import { Link } from 'react-router-dom';

type Mode = 'seasons' | 'dives';

export function CompareModeHeader({
  mode,
  description,
}: {
  mode: Mode;
  description: string;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1">
          <ModeLink to="/compare/seasons" label="Compare seasons" active={mode === 'seasons'} />
          <ModeLink to="/compare/dives" label="Compare dives" active={mode === 'dives'} />
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
      </div>
      <p className="mt-2 max-w-xl text-sm text-textDim">{description}</p>
    </header>
  );
}

function ModeLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={[
        'text-3xl font-light tracking-widest transition-colors',
        active ? 'text-text' : 'text-textDim/40 hover:text-textDim',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
