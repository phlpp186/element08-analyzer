/**
 * SessionDetail — landing page for a single session.
 *
 * Behavior by mode:
 *   - DEPTH: lists every dive in the session with key stats; clicking a
 *     dive opens the full multi-track player (DepthDivePlayer).
 *   - POOL : same list pattern, but dive detail comes in Phase 3b.
 *   - DRY  : single contiguous timeline session — Phase 3b player.
 *
 * The session-level header (date, name, summary) is the same across modes.
 */
import { Link, Navigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import {
  formatDate,
  modeColorClass,
  modeLabel,
  summaryLine,
} from '../lib/format';

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
        <BackLink />
        <p className="mt-8 text-textDim">Session not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <BackLink />

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

      {session.mode === 'depth' && <DepthDiveList session={session} />}
      {session.mode === 'pool' && <PoolPlaceholder />}
      {session.mode === 'dry' && <DryPlaceholder />}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/sessions"
      className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
    >
      ← back to sessions
    </Link>
  );
}

// ─── Depth ──────────────────────────────────────────────────────────────────

interface DepthDiveRow {
  depth: number;
  diveTime: number;
  si: number;
  descentTime?: number;
  ascentTime?: number;
  hangTime?: number;
  discipline?: string;
  hr?: number | null;
}

function DepthDiveList({ session }: { session: any }) {
  const dives: DepthDiveRow[] = session.dives ?? [];
  if (dives.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-panel py-12 text-center text-textDim">
        This depth session has no dives recorded.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {dives.map((d, idx) => (
        <li key={idx}>
          <Link
            to={`/session/${session.id}/dive/${idx}`}
            className="flex items-center gap-4 bg-panel px-4 py-3 transition-colors hover:bg-abyss"
          >
            <div className="w-20 shrink-0 font-mono text-xs uppercase tracking-widest text-textDim">
              Dive {idx + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading text-lg tracking-wide text-accent">
                {d.depth}m
              </div>
              <div className="font-mono text-xs text-textDim">
                {fmtSec(d.diveTime)} · descent {fmtSec(d.descentTime ?? 0)} · hang {fmtSec(d.hangTime ?? 0)} · ascent {fmtSec(d.ascentTime ?? 0)}
                {d.discipline ? ` · ${d.discipline}` : ''}
              </div>
            </div>
            <span className="font-mono text-xs text-textDim">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Placeholders for pool + dry (Phase 3b) ────────────────────────────────

function PoolPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-textDim">Phase 3b</p>
      <p className="mt-2 text-text">
        Pool dive player coming next — per-dive HR + lap-time scrubbing.
      </p>
    </div>
  );
}

function DryPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-textDim">Phase 3b</p>
      <p className="mt-2 text-text">
        Dry session player coming next — SpO₂ + HR + contractions scrub.
      </p>
    </div>
  );
}
