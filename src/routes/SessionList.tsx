/**
 * SessionList — every session in the loaded backup, sorted newest-first,
 * filterable by mode.
 *
 * Clicking a row navigates to the (Phase 2) session detail view. For now
 * the detail route shows a placeholder.
 *
 * No data fetching here — everything renders from useBackupStore. If
 * someone direct-navigates to /sessions without loading a file first, we
 * redirect to the landing page.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import {
  formatDate,
  modeColorClass,
  modeLabel,
  summaryLine,
} from '../lib/format';
import type { ParsedSession } from '../schema/backup';

type ModeFilter = 'all' | ParsedSession['mode'];

const FILTERS: { id: ModeFilter; label: string }[] = [
  { id: 'all',   label: 'All' },
  { id: 'dry',   label: 'Dry' },
  { id: 'depth', label: 'Depth' },
  { id: 'pool',  label: 'Pool' },
];

export function SessionList() {
  const backup = useBackupStore((s) => s.backup);
  const filename = useBackupStore((s) => s.filename);
  const clear = useBackupStore((s) => s.clear);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ModeFilter>('all');

  // No backup loaded → bounce back to drop zone. Replace so back-button
  // doesn't strand the user on an empty list.
  if (!backup) return <Navigate to="/" replace />;

  const sessions = useMemo(() => {
    const all = backup.data.sessions;
    const filtered = filter === 'all' ? all : all.filter((s) => s.mode === filter);
    // Sort by date descending. Invalid dates sink to the bottom.
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      const sa = Number.isFinite(ta) ? ta : -Infinity;
      const sb = Number.isFinite(tb) ? tb : -Infinity;
      return sb - sa;
    });
  }, [backup, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, dry: 0, depth: 0, pool: 0 };
    for (const s of backup.data.sessions) {
      c.all++;
      c[s.mode]++;
    }
    return c;
  }, [backup]);

  function loadDifferent() {
    clear();
    navigate('/');
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            Sessions
          </h1>
          {filename && (
            <p className="mt-1 font-mono text-xs text-textDim">{filename}</p>
          )}
        </div>
        <div className="flex items-center gap-5">
          <Link
            to="/insights"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            insights →
          </Link>
          <Link
            to="/compare"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            compare →
          </Link>
          <button
            onClick={loadDifferent}
            className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
          >
            ← load different file
          </button>
        </div>
      </header>

      {/* Filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'rounded-full border px-4 py-1.5 text-sm transition-colors',
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-textDim hover:border-accent hover:text-accent',
              ].join(' ')}
            >
              {f.label} <span className="ml-1 text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {sessions.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: ParsedSession }) {
  return (
    <li>
      <Link
        to={`/session/${session.id}`}
        className="flex items-center gap-4 bg-panel px-4 py-3 transition-colors hover:bg-abyss"
      >
        <div className="w-24 shrink-0">
          <span
            className={[
              'font-mono text-[10px] uppercase tracking-widest',
              modeColorClass(session.mode),
            ].join(' ')}
          >
            {modeLabel(session.mode)}
          </span>
          <div className="text-xs text-textDim">
            {formatDate(session.date)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-base tracking-wide text-text">
            {session.name || 'Untitled session'}
          </div>
          <div className="truncate font-mono text-xs text-textDim">
            {summaryLine(session)}
          </div>
        </div>

        {session.rating != null && (
          <div className="font-mono text-xs text-textDim">
            ★ {session.rating}/5
          </div>
        )}
      </Link>
    </li>
  );
}

function EmptyState({ filter }: { filter: ModeFilter }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
      <p className="text-textDim">
        {filter === 'all'
          ? 'No sessions in this backup.'
          : `No ${filter} sessions in this backup.`}
      </p>
    </div>
  );
}
