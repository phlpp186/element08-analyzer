/**
 * SessionList — every session in the loaded backup, newest first.
 *
 * The list is the diver's training journal: each row shows the session
 * header (mode · date · name · rating · summary) and, when present, the
 * diver's own free-text remarks (session-level and per-dive) — so a
 * diver can scroll back to "May last year" and read what they were
 * thinking, not just what the numbers say.
 *
 * Layout (Philipp's option B, 2026-10-22):
 *   - Mode filter pills + a "Has notes" toggle, and the list's scope:
 *     This month (the calendar's month, or one day of it) or All months
 *     (the whole history under sticky month headers).
 *   - A month calendar beside the list: training days as blocks in their
 *     mode colour with the day's best; a search with quick filters fades
 *     the days without a match. Folds to one week on narrow screens.
 *   - Lean rows as in the app's logbook; notes open in place.
 *
 * No data fetching here — everything renders from useBackupStore. If
 * someone direct-navigates to /sessions without loading a file first, we
 * redirect to the landing page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import {
  formatDate,
  modeColorClass,
  summaryLine,
} from '../lib/format';
import type { ParsedSession } from '../schema/backup';
import { useT } from '../i18n';
import { ModeBlock } from '../components/ModeBlock';
import { MonthCalendar } from '../components/MonthCalendar';
import {
  inMonth,
  latestMonth,
  monthDays,
  NO_QUICK,
  passesQuick,
  sessionBest,
  sessionDay,
  type QuickFilters,
} from '../lib/sessionMonth';

const PAGE = 60;

const NO_SESSIONS: ParsedSession[] = [];

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
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const filename = useBackupStore((s) => s.filename);
  const clear = useBackupStore((s) => s.clear);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ModeFilter>('all');
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<QuickFilters>(NO_QUICK);
  const [deeperText, setDeeperText] = useState('40');
  // 'month' lists the calendar's month (or one day of it); 'all' is the
  // whole history grouped by month, as the list was before the calendar.
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const sessions = backup?.data.sessions ?? NO_SESSIONS;
  const [view, setView] = useState(() => latestMonth(sessions));
  const [selDay, setSelDay] = useState<string | null>(null);
  const [folded, setFolded] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  // Reset the render window whenever the filter set changes.
  useEffect(() => setLimit(PAGE), [filter, onlyWithNotes, query, quick, scope]);

  const base = useMemo(() => {
    let out = filter === 'all' ? sessions : sessions.filter((s) => s.mode === filter);
    if (onlyWithNotes) out = out.filter((s) => sessionHasNotes(s));
    return [...out].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      const sa = Number.isFinite(ta) ? ta : -Infinity;
      const sb = Number.isFinite(tb) ? tb : -Infinity;
      return sb - sa;
    });
  }, [sessions, filter, onlyWithNotes]);

  const q = query.trim().toLowerCase();
  const searching = q !== '' || quick.deeperThan != null || quick.hard;
  const matches = useMemo(
    () => (s: ParsedSession) => (!q || sessionMatches(s, q)) && passesQuick(s, quick),
    [q, quick],
  );

  const days = useMemo(() => monthDays(base, view.y, view.m, matches), [base, view, matches]);

  const monthList = useMemo(
    () =>
      base.filter(
        (s) =>
          inMonth(s, view.y, view.m) &&
          (selDay == null || sessionDay(s) === selDay) &&
          (!searching || matches(s)),
      ),
    [base, view, selDay, searching, matches],
  );
  const allList = useMemo(() => (searching ? base.filter(matches) : base), [base, searching, matches]);
  const visible = allList.slice(0, limit);
  const grouped = useMemo(() => groupByMonth(visible), [visible]);

  const counts = useMemo(() => {
    const c = { all: 0, dry: 0, depth: 0, pool: 0, withNotes: 0 };
    for (const s of sessions) {
      c.all++;
      c[s.mode]++;
      if (sessionHasNotes(s)) c.withNotes++;
    }
    return c;
  }, [sessions]);

  if (!backup) return <Navigate to="/" replace />;

  function loadDifferent() {
    clear();
    navigate('/');
  }

  function stepMonth(dir: 1 | -1) {
    setView(({ y, m }) => {
      const d = new Date(y, m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    setSelDay(null);
    setScope('month');
  }

  function setDeeper(text: string) {
    setDeeperText(text);
    const v = Number.parseFloat(text.replace(',', '.'));
    setQuick((f) => ({ ...f, deeperThan: Number.isFinite(v) ? v : null }));
  }

  const monthName = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dayName = selDay
    ? new Date(`${selDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const listHead =
    scope === 'all'
      ? searching
        ? t('{n} matching sessions').replace('{n}', String(allList.length))
        : t('All sessions')
      : dayName
        ? `${dayName} · ${monthList.length} ${t(monthList.length === 1 ? 'session' : 'sessions')}`
        : searching
          ? t('{n} matching in {month}').replace('{n}', String(monthList.length)).replace('{month}', monthName)
          : `${monthName} · ${monthList.length} ${t(monthList.length === 1 ? 'session' : 'sessions')}`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            {t('Sessions')}
          </h1>
          {filename && (
            <p className="mt-1 font-mono text-xs text-textDim">{filename}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            to="/progress"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('progress')} →
          </Link>
          <Link
            to="/insights"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('insights')} →
          </Link>
          <Link
            to="/compare"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('compare')} →
          </Link>
          <Link
            to="/playground"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('playground')} →
          </Link>
          <button
            onClick={loadDifferent}
            className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
          >
            ← {t('load different file')}
          </button>
        </div>
      </header>

      {/* Mode filter pills + notes toggle, and the list's scope */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`pill px-4 py-1.5 text-sm ${filter === f.id ? 'pill-on' : ''}`}
          >
            {t(f.label)} <span className="ml-1 text-xs opacity-60">{counts[f.id]}</span>
          </button>
        ))}
        <span className="mx-2 text-textDim opacity-40">·</span>
        <button
          onClick={() => setOnlyWithNotes((v) => !v)}
          className={`pill px-4 py-1.5 text-sm ${onlyWithNotes ? 'pill-on' : ''}`}
        >
          {t('Has notes')} <span className="ml-1 text-xs opacity-60">{counts.withNotes}</span>
        </button>
        <span className="ml-auto flex gap-1.5">
          <button
            onClick={() => setScope('month')}
            className={`pill px-4 py-1.5 text-sm ${scope === 'month' ? 'pill-on' : ''}`}
          >
            {t('This month')}
          </button>
          <button
            onClick={() => {
              setScope('all');
              setSelDay(null);
            }}
            className={`pill px-4 py-1.5 text-sm ${scope === 'all' ? 'pill-on' : ''}`}
          >
            {t('All months')}
          </button>
        </span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Calendar + search: stays in view while the list scrolls */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <MonthCalendar
            year={view.y}
            month={view.m}
            days={days}
            selected={selDay}
            searching={searching}
            onSelect={(d) => {
              setScope('month');
              setSelDay((cur) => (cur === d ? null : d));
            }}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            folded={folded}
            onFold={setFolded}
          />
          <div className="board space-y-2.5 p-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={scope === 'month' ? t('Search this month') : t('Search name, location, notes, or month…')}
              aria-label={t('Search')}
              className="w-full rounded-lg border border-border bg-abyss px-3 py-2 text-sm text-text placeholder:text-textDim focus:border-accent focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setQuick((f) => ({ ...f, deeperThan: f.deeperThan == null ? Number.parseFloat(deeperText) || 40 : null }))}
                className={`pill px-3 py-1 text-xs ${quick.deeperThan != null ? 'pill-on' : ''}`}
              >
                {t('Deeper than')}
              </button>
              {quick.deeperThan != null && (
                <span className="flex items-center gap-1 rounded-lg border border-border bg-abyss px-2 py-0.5">
                  <input
                    value={deeperText}
                    onChange={(e) => setDeeper(e.target.value)}
                    inputMode="decimal"
                    aria-label={t('Deeper than')}
                    className="w-10 bg-transparent font-num text-sm font-bold text-text focus:outline-none"
                  />
                  <span className="font-mono text-xs text-textDim">m</span>
                </span>
              )}
              <button
                onClick={() => setQuick((f) => ({ ...f, hard: !f.hard }))}
                className={`pill px-3 py-1 text-xs ${quick.hard ? 'pill-on' : ''}`}
              >
                {t('Effort 7+')}
              </button>
              {searching && (
                <button
                  onClick={() => {
                    setQuery('');
                    setQuick(NO_QUICK);
                  }}
                  className="ml-auto font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
                >
                  {t('clear')}
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* The list */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-textDim">{listHead}</h2>
            {selDay && scope === 'month' && (
              <button onClick={() => setSelDay(null)} className="pill px-3 py-1 text-xs">
                {t('Show the whole month')}
              </button>
            )}
          </div>

          {scope === 'month' ? (
            monthList.length === 0 ? (
              <EmptyState onlyWithNotes={onlyWithNotes} filter={filter} query={query} inMonth />
            ) : (
              <ul className="space-y-3">
                {monthList.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </ul>
            )
          ) : grouped.length === 0 ? (
            <EmptyState onlyWithNotes={onlyWithNotes} filter={filter} query={query} />
          ) : (
            <>
              {grouped.map((g) => (
                <section key={g.key} className="mb-10">
                  <h3 className="sticky top-0 z-10 -mx-2 mb-3 bg-deep/95 px-2 py-2 font-mono text-xs uppercase tracking-widest text-textDim backdrop-blur">
                    {g.label}
                    <span className="ml-3 opacity-50">
                      {g.sessions.length} {t(g.sessions.length === 1 ? 'session' : 'sessions')}
                    </span>
                  </h3>
                  <ul className="space-y-3">
                    {g.sessions.map((s) => (
                      <SessionRow key={s.id} session={s} />
                    ))}
                  </ul>
                </section>
              ))}
              {allList.length > visible.length && (
                <LoadMore
                  remaining={allList.length - visible.length}
                  onMore={() => setLimit((l) => l + PAGE)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Auto-loads the next page when scrolled into view; also a manual button. */
function LoadMore({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onMore);
  cb.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="py-6 text-center">
      <button
        onClick={onMore}
        className="pill px-5 py-2 font-mono text-xs uppercase tracking-widest"
      >
        {t('Show more')} <span className="opacity-60">({remaining})</span>
      </button>
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

/** The session's main discipline (most dives), or its tag for a dry one. */
function sessionChip(s: ParsedSession): string | null {
  const list = ((s as { dives?: { discipline?: string }[] }).dives ?? [])
    .map((d) => d.discipline)
    .filter((d): d is string => !!d);
  if (list.length > 0) {
    const count = new Map<string, number>();
    for (const d of list) count.set(d, (count.get(d) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return s.sessionTag ? s.sessionTag.replace(/_/g, ' ') : null;
}

/** A lean row, as in the app's logbook: mode block, name, a discipline tag,
 *  count, date and place, the best figure on the right. Notes fold to one
 *  line that opens in place. */
function SessionRow({ session }: { session: ParsedSession }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const notes = collectDiveNotes(session);
  const remarks = session.remarks?.trim() ?? '';
  const hasNotes = remarks !== '' || notes.length > 0;
  const location = (session as { location?: string | null }).location?.trim();
  const best = sessionBest(session);
  const chip = sessionChip(session);
  const firstNote = remarks || notes[0]?.text || '';

  return (
    <li className="board overflow-hidden">
      <Link
        to={`/session/${session.id}`}
        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-abyss/60"
      >
        <ModeBlock mode={session.mode} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-base tracking-wide text-text">
            {session.name || t('Untitled session')}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-textDim">
            {chip && (
              <span className={`rounded bg-surface px-1.5 py-px text-[10px] font-bold uppercase ${modeColorClass(session.mode)}`}>
                {chip}
              </span>
            )}
            <span>{summaryLine(session)}</span>
            <span>· {formatDate(session.date)}</span>
            {location && <span className="truncate">· {location}</span>}
            {session.rating != null && <span>· ★ {session.rating}/10</span>}
          </div>
        </div>
        {best && (
          <span className="shrink-0 font-num text-xl font-bold tabular-nums text-text">{best.text}</span>
        )}
      </Link>
      {hasNotes && (
        <div className="border-t border-border/50 px-4 py-2">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full min-w-0 items-start gap-2 text-left text-xs text-textDim hover:text-text"
          >
            <span className="shrink-0">{open ? '▾' : '▸'}</span>
            {!open && <span className="truncate">{firstNote}</span>}
            {open && <span>{t('Notes')}</span>}
          </button>
          {open && (
            <div className="mt-2 border-l-2 border-accent/40 pl-3">
              {remarks && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{remarks}</p>
              )}
              {notes.length > 0 && (
                <ul className={`space-y-1.5 ${remarks ? 'mt-2' : ''}`}>
                  {notes.map((n) => (
                    <li key={n.index} className="flex gap-2 text-xs leading-relaxed text-textDim">
                      <span className="shrink-0 font-mono text-textDim opacity-60">
                        {t('Dive')} {n.index + 1}
                      </span>
                      <span className="text-text/85">{n.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Empty ───────────────────────────────────────────────────────────────────

function EmptyState({
  onlyWithNotes,
  filter,
  query,
  inMonth = false,
}: {
  onlyWithNotes: boolean;
  filter: ModeFilter;
  query: string;
  /** The month view: say so, the rest of the logbook is a scope away. */
  inMonth?: boolean;
}) {
  const t = useT();
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
      <p className="text-textDim">
        {inMonth
          ? t('Nothing here this month. Try another month, or switch to All months.')
          : query.trim()
          ? `${t('No sessions match')} “${query.trim()}”.`
          : onlyWithNotes
            ? t(
                "No sessions with notes match this filter. Try widening the mode or turning 'Has notes' off.",
              )
            : filter === 'all'
              ? t('No sessions in this backup.')
              : `${t('No')} ${filter} ${t('sessions in this backup.')}`}
      </p>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Free-text match across name, location, notes (session + dive), and the
 *  human date label (so "may 2025" or "june" narrows the feed). */
function sessionMatches(s: ParsedSession, q: string): boolean {
  const hay: string[] = [s.name ?? '', s.remarks ?? ''];
  const loc = (s as { location?: string | null }).location;
  if (loc) hay.push(loc);
  const d = new Date(s.date);
  if (!Number.isNaN(d.getTime())) {
    hay.push(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }));
    hay.push(formatDate(s.date));
  }
  if ('dives' in s && Array.isArray(s.dives)) {
    for (const dv of s.dives) {
      const r = (dv as { remarks?: string | null }).remarks;
      if (r) hay.push(r);
      const disc = (dv as { discipline?: string }).discipline;
      if (disc) hay.push(disc);
    }
  }
  return hay.join('  ').toLowerCase().includes(q);
}

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
