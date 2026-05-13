/**
 * SessionDetail — stub for Phase 2.
 *
 * Just shows that we found the session and confirms the basic shape. The
 * real detail view (stats, charts, profile) is the Phase 2 / Phase 3
 * deliverable.
 */
import { Link, Navigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { formatDate, modeColorClass, modeLabel, summaryLine } from '../lib/format';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  if (!backup) return <Navigate to="/" replace />;

  const numericId = Number(id);
  const session = Number.isFinite(numericId) ? getSession(numericId) : undefined;

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
        <p className="mt-8 text-textDim">Session not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        to="/sessions"
        className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
      >
        ← back to sessions
      </Link>

      <header className="mt-6 mb-8">
        <span
          className={[
            'font-mono text-[10px] uppercase tracking-widest',
            modeColorClass(session.mode),
          ].join(' ')}
        >
          {modeLabel(session.mode)} · {formatDate(session.date)}
        </span>
        <h1 className="mt-1 font-heading text-3xl tracking-wide text-text">
          {session.name || 'Untitled session'}
        </h1>
        <p className="mt-2 font-mono text-sm text-textDim">{summaryLine(session)}</p>
      </header>

      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-textDim">
          Phase 2
        </p>
        <p className="mt-2 text-text">
          Full session detail (stats, charts, profile) lands in the next phase.
        </p>
      </div>
    </div>
  );
}
