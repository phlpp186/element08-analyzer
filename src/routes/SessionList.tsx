/**
 * SessionList — every session in the loaded backup, newest first.
 *
 * The list is the diver's training journal: each row shows the session
 * header (mode · date · name · rating · summary) and, when present, the
 * diver's own free-text remarks (session-level and per-dive) — so a
 * diver can scroll back to "May last year" and read what they were
 * thinking, not just what the numbers say.
 *
 * Layout:
 *   - Mode filter pills + a "Has notes" toggle that collapses to the
 *     sessions where the diver actually wrote something.
 *   - Sticky month headers; sessions group under year-month sections.
 *   - Side rail (desktop only) lists every year-month in the backup
 *     for one-click jumps.
 *   - Each row links to the session-detail view (no behavioral change
 *     from the old compact list — just more text in the row).
 *
 * No data fetching here — everything renders from useBackupStore. If
 * someone direct-navigates to /sessions without loading a file first, we
 * redirect to the landing page.
 */
import { useMemo, useRef, useState } from 'react';
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

interface DiveNote {
  index: number;
  label: string;
  text: string;
}

export function SessionList() {
  const backup = useBackupStore((s) => s.backup);
  const filename = useBackupStore((s) => s.filename);
  const clear = useBackupStore((s) => s.clear);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ModeFilter>('all');
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const monthRefs = useRef<Record<string, HTMLElement | null>>({});

  if (!backup) return <Navigate to="/" replace />;

  const filtered = useMemo(() => {
    const all = backup.data.sessions;
    let out = filter === 'all' ? all : all.filter((s) => s.mode === filter);
    if (onlyWithNotes) out = out.filter((s) => sessionHasNotes(s));
    return [...out].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      const sa = Number.isFinite(ta) ? ta : -Infinity;
      const sb = Number.isFinite(tb) ? tb : -Infinity;
      return sb - sa;
    });
  }, [backup, filter, onlyWithNotes]);

  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  const counts = useMemo(() => {
    const c = { all: 0, dry: 0, depth: 0, pool: 0, withNotes: 0 };
    for (const s of backup.data.sessions) {
      c.all++;
      c[s.mode]++;
      if (sessionHasNotes(s)) c.withNotes++;
    }
    return c;
  }, [backup]);

  function loadDifferent() {
    clear();
    navigate('/');
  }

  function scrollToMonth(key: string) {
    monthRefs.current[key]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
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
          <Link
            to="/playground"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            playground →
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
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
        <span className="mx-2 text-textDim opacity-40">·</span>
        <button
          onClick={() => setOnlyWithNotes((v) => !v)}
          className={[
            'rounded-full border px-4 py-1.5 text-sm transition-colors',
            onlyWithNotes
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-textDim hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          Has notes{' '}
          <span className="ml-1 text-xs opacity-60">{counts.withNotes}</span>
        </button>
      </div>

      <div className="flex gap-8">
        {/* Side rail — year-month jump list */}
        {grouped.length > 1 && (
          <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-32 shrink-0 overflow-y-auto md:block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-textDim">
              Jump to
            </div>
            <ul className="space-y-1">
              {grouped.map((g) => (
                <li key={g.key}>
                  <button
                    onClick={() => scrollToMonth(g.key)}
                    className="block w-full text-left font-mono text-xs text-textDim transition-colors hover:text-accent"
                  >
                    {g.label}{' '}
                    <span className="opacity-50">({g.sessions.length})</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* Feed */}
        <div className="min-w-0 flex-1">
          {grouped.length === 0 ? (
            <EmptyState onlyWithNotes={onlyWithNotes} filter={filter} />
          ) : (
            grouped.map((g) => (
              <section
                key={g.key}
                ref={(el) => {
                  monthRefs.current[g.key] = el;
                }}
                className="mb-10"
              >
                <h2 className="sticky top-0 z-10 -mx-2 mb-3 bg-bg/95 px-2 py-2 font-mono text-xs uppercase tracking-widest text-textDim backdrop-blur">
                  {g.label}
                  <span className="ml-3 opacity-50">
                    {g.sessions.length} session
                    {g.sessions.length === 1 ? '' : 's'}
                  </span>
                </h2>
                <ul className="space-y-3">
                  {g.sessions.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: ParsedSession }) {
  const notes = collectDiveNotes(session);
  const hasNotes = !!session.remarks?.trim() || notes.length > 0;

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-panel">
      <Link
        to={`/session/${session.id}`}
        className="block px-4 py-3 transition-colors hover:bg-abyss"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={[
              'font-mono text-[10px] uppercase tracking-widest',
              modeColorClass(session.mode),
            ].join(' ')}
          >
            {modeLabel(session.mode)}
          </span>
          <span className="font-mono text-xs text-textDim">
            {formatDate(session.date)}
          </span>
          <span className="truncate font-heading text-base tracking-wide text-text">
            {session.name || 'Untitled session'}
          </span>
          {session.rating != null && (
            <span className="ml-auto font-mono text-xs text-textDim">
              ★ {session.rating}/5
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-xs text-textDim">
          {summaryLine(session)}
          {session.sessionTag && (
            <span className="ml-2 rounded border border-border px-1.5 py-px text-[10px] uppercase tracking-wider opacity-80">
              {session.sessionTag.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {hasNotes && (
          <div className="mt-3 border-l-2 border-accent/40 pl-3">
            {session.remarks?.trim() && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                {session.remarks}
              </p>
            )}
            {notes.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {notes.map((n) => (
                  <li
                    key={n.index}
                    className="flex gap-2 text-xs leading-relaxed text-textDim"
                  >
                    <span className="font-mono shrink-0 text-textDim opacity-60">
                      {n.label}
                    </span>
                    <span className="text-text/85">{n.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}

// ── Empty ───────────────────────────────────────────────────────────────────

function EmptyState({
  onlyWithNotes,
  filter,
}: {
  onlyWithNotes: boolean;
  filter: ModeFilter;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
      <p className="text-textDim">
        {onlyWithNotes
          ? "No sessions with notes match this filter. Try widening the mode or turning 'Has notes' off."
          : filter === 'all'
            ? 'No sessions in this backup.'
            : `No ${filter} sessions in this backup.`}
      </p>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sessionHasNotes(s: ParsedSession): boolean {
  if (s.remarks && s.remarks.trim().length > 0) return true;
  if ('dives' in s && Array.isArray(s.dives)) {
    for (const d of s.dives) {
      const r = (d as { remarks?: string | null }).remarks;
      if (r && r.trim().length > 0) return true;
    }
  }
  return false;
}

function collectDiveNotes(s: ParsedSession): DiveNote[] {
  if (!('dives' in s) || !Array.isArray(s.dives)) return [];
  const out: DiveNote[] = [];
  s.dives.forEach((d, i) => {
    const r = (d as { remarks?: string | null }).remarks;
    if (r && r.trim().length > 0) {
      out.push({ index: i, label: `Dive ${i + 1}`, text: r });
    }
  });
  return out;
}

interface MonthGroup {
  key: string;     // 'YYYY-MM' for stable sort
  label: string;   // 'May 2026'
  sessions: ParsedSession[];
}

function groupByMonth(sessions: ParsedSession[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const s of sessions) {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    });
    let g = map.get(key);
    if (!g) {
      g = { key, label, sessions: [] };
      map.set(key, g);
    }
    g.sessions.push(s);
  }
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}
