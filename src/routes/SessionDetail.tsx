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
      {session.mode === 'pool' && <PoolDiveList session={session} />}
      {session.mode === 'dry' && <DryOpenPlayer sessionId={session.id} />}
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

// ─── Pool ──────────────────────────────────────────────────────────────────

interface PoolDiveRow {
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';
  distance: number | null;
  diveTime: number;
  si: number;
  turns?: number | null;
  hrHighest?: number | null;
  hrLowest?: number | null;
}

const POOL_DISC_COLORS: Record<PoolDiveRow['discipline'], string> = {
  STA:   '#00b4ff',
  DYN:   '#00e5cc',
  DYNB:  '#a89fff',
  DNF:   '#f5a623',
  other: '#8a8a8a',
};

function PoolDiveList({ session }: { session: any }) {
  const dives: PoolDiveRow[] = session.dives ?? [];
  if (dives.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-panel py-12 text-center text-textDim">
        This pool session has no dives recorded.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {dives.map((d, idx) => {
        const isSta = d.discipline === 'STA';
        const primary = isSta ? fmtSec(d.diveTime) : `${d.distance ?? 0}m`;
        return (
          <li key={idx}>
            <Link
              to={`/session/${session.id}/pool/${idx}`}
              className="flex items-center gap-4 bg-panel px-4 py-3 transition-colors hover:bg-abyss"
            >
              <div className="w-20 shrink-0 font-mono text-xs uppercase tracking-widest text-textDim">
                Dive {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="font-heading text-lg tracking-wide"
                  style={{ color: POOL_DISC_COLORS[d.discipline] }}
                >
                  {d.discipline} · {primary}
                </div>
                <div className="font-mono text-xs text-textDim">
                  {!isSta && `${fmtSec(d.diveTime)} · `}
                  {d.turns != null && d.turns > 0 ? `${d.turns} turn${d.turns === 1 ? '' : 's'} · ` : ''}
                  SI {fmtSec(d.si)}
                  {d.hrHighest != null && d.hrLowest != null && ` · HR ${d.hrLowest}–${d.hrHighest}`}
                </div>
              </div>
              <span className="font-mono text-xs text-textDim">→</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Dry ───────────────────────────────────────────────────────────────────

function DryOpenPlayer({ sessionId }: { sessionId: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <p className="text-sm text-textDim">
        Dry sessions are a single continuous timeline — open the full
        player to scrub through SpO₂, HR, and the block timeline.
      </p>
      <Link
        to={`/session/${sessionId}/dry`}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-widest text-deep hover:opacity-90"
      >
        Open timeline player →
      </Link>
    </div>
  );
}
