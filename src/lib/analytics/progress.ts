/**
 * progress — pure computations behind the Progress home (Phase 1 of the
 * "progress companion" direction, 2026-07-27).
 *
 * Everything here derives from the loaded backup only; no network. Volume is
 * counted in SESSIONS (not parsed duration strings — those are display-format
 * and locale-fragile), PBs are all-time maxima with a delta vs the best that
 * existed N days ago, and the trajectory is the running maximum over time.
 */
import type { ParsedSession } from '../../schema/backup';

const DAY_MS = 86_400_000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function ts(s: ParsedSession): number {
  const t = new Date(s.date).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Longest hold (seconds) recorded in a dry session's block timeline. */
function maxHoldSec(s: ParsedSession): number {
  if (s.mode !== 'dry') return 0;
  const blocks = (s as { blockTimeline?: { type?: string; seconds?: number }[] }).blockTimeline;
  if (!Array.isArray(blocks)) return 0;
  let max = 0;
  for (const b of blocks) {
    if (b?.type === 'Hold' && typeof b.seconds === 'number' && b.seconds > max) max = b.seconds;
  }
  return max;
}

/** Deepest dive (m) in a depth session. */
function maxDepthOf(s: ParsedSession): { depth: number; discipline?: string } {
  if (s.mode !== 'depth') return { depth: 0 };
  const sess = s as {
    maxDepth?: number;
    discipline?: string;
    dives?: { depth?: number; discipline?: string }[];
  };
  let depth = typeof sess.maxDepth === 'number' ? sess.maxDepth : 0;
  let discipline = sess.discipline;
  if (Array.isArray(sess.dives)) {
    for (const d of sess.dives) {
      if (typeof d?.depth === 'number' && d.depth > depth) {
        depth = d.depth;
        discipline = d.discipline ?? discipline;
      }
    }
  }
  return { depth, discipline };
}

/** Longest single pool dive (m) in a pool session. */
function maxPoolDistOf(s: ParsedSession): { dist: number; discipline?: string } {
  if (s.mode !== 'pool') return { dist: 0 };
  const sess = s as { dives?: { distance?: number | null; discipline?: string }[] };
  let dist = 0;
  let discipline: string | undefined;
  if (Array.isArray(sess.dives)) {
    for (const d of sess.dives) {
      if (typeof d?.distance === 'number' && d.distance > dist) {
        dist = d.distance;
        discipline = d.discipline;
      }
    }
  }
  return { dist, discipline };
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface PbKpi {
  /** Current all-time best (0 = no data of this kind). */
  value: number;
  /** Discipline the best was set in, when known. */
  discipline?: string;
  /** ISO date the best was set. */
  dateSet?: string;
  /** Best that already existed `windowDays` ago — delta = value - prev. */
  prev: number;
  /** value - prev; 0 when the best predates the window. */
  delta: number;
}

export interface ProgressKpis {
  deepest: PbKpi;
  longestHold: PbKpi;
  longestPoolDive: PbKpi;
  /** Sessions in the last 28 days vs the 28 before. */
  sessions4w: { current: number; prior: number };
  diveCount: number;
  sessionCount: number;
}

/** windowDays: the "recent improvement" horizon for the PB deltas. */
export function progressKpis(sessions: ParsedSession[], windowDays = 180): ProgressKpis {
  const now = Date.now();
  const cutoff = now - windowDays * DAY_MS;

  const mk = (): { cur: PbKpi } => ({
    cur: { value: 0, prev: 0, delta: 0 },
  });
  const deep = mk().cur;
  const hold = mk().cur;
  const pool = mk().cur;

  let diveCount = 0;
  let cur4w = 0;
  let prior4w = 0;

  for (const s of sessions) {
    const t = ts(s);
    if (Number.isFinite(t)) {
      if (t >= now - 28 * DAY_MS) cur4w++;
      else if (t >= now - 56 * DAY_MS) prior4w++;
    }
    const dives = (s as { dives?: unknown[] }).dives;
    diveCount += Array.isArray(dives) ? dives.length : s.mode === 'dry' ? 0 : 0;

    const upd = (kpi: PbKpi, v: number, discipline?: string) => {
      if (v <= 0) return;
      if (v > kpi.value) {
        kpi.value = v;
        kpi.discipline = discipline;
        kpi.dateSet = s.date;
      }
      if (Number.isFinite(t) && t < cutoff && v > kpi.prev) kpi.prev = v;
    };

    const d = maxDepthOf(s);
    upd(deep, d.depth, d.discipline);
    upd(hold, maxHoldSec(s));
    const p = maxPoolDistOf(s);
    upd(pool, p.dist, p.discipline);
  }

  for (const kpi of [deep, hold, pool]) {
    // No pre-window best (young logbook): treat the delta as "new".
    kpi.delta = kpi.prev > 0 ? Math.max(0, kpi.value - kpi.prev) : kpi.value > 0 ? kpi.value : 0;
    if (kpi.prev === 0) kpi.delta = 0; // young logbook → show no delta rather than a fake jump
  }

  return {
    deepest: deep,
    longestHold: hold,
    longestPoolDive: pool,
    sessions4w: { current: cur4w, prior: prior4w },
    diveCount,
    sessionCount: sessions.length,
  };
}

// ─── PB trajectory (running max over time) ───────────────────────────────────

export type TrajectoryMode = 'depth' | 'hold' | 'pool';

export interface TrajectoryPoint {
  /** ms epoch of the session. */
  t: number;
  /** Session's own best that day. */
  value: number;
  /** Running all-time max as of this session. */
  runningMax: number;
  /** True when this session RAISED the running max (a PB day). */
  isPb: boolean;
}

export function pbTrajectory(sessions: ParsedSession[], mode: TrajectoryMode): TrajectoryPoint[] {
  const rows: { t: number; value: number }[] = [];
  for (const s of sessions) {
    const t = ts(s);
    if (!Number.isFinite(t)) continue;
    let v: number;
    if (mode === 'depth') v = maxDepthOf(s).depth;
    else if (mode === 'hold') v = maxHoldSec(s);
    else v = maxPoolDistOf(s).dist;
    if (v > 0) rows.push({ t, value: v });
  }
  rows.sort((a, b) => a.t - b.t);
  let max = 0;
  return rows.map((r) => {
    const isPb = r.value > max;
    if (isPb) max = r.value;
    return { t: r.t, value: r.value, runningMax: max, isPb };
  });
}

/** Which trajectory the diver most plausibly cares about first. */
export function primaryTrajectoryMode(sessions: ParsedSession[]): TrajectoryMode {
  let depth = 0;
  let pool = 0;
  let dry = 0;
  for (const s of sessions) {
    if (s.mode === 'depth') depth++;
    else if (s.mode === 'pool') pool++;
    else dry++;
  }
  if (depth >= pool && depth >= dry) return 'depth';
  if (pool >= dry) return 'pool';
  return 'hold';
}

// ─── Consistency (sessions per week, last N weeks) ───────────────────────────

export interface WeekBar {
  /** ms epoch of the Monday starting the week. */
  weekStart: number;
  count: number;
}

export function weeklyConsistency(sessions: ParsedSession[], weeks = 12): WeekBar[] {
  const now = new Date();
  // Monday of the current week, local time.
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (monday.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(monday.getDate() - dow);
  const start = monday.getTime() - (weeks - 1) * 7 * DAY_MS;

  const bars: WeekBar[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: start + i * 7 * DAY_MS,
    count: 0,
  }));
  for (const s of sessions) {
    const t = ts(s);
    if (!Number.isFinite(t) || t < start) continue;
    const idx = Math.floor((t - start) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks) bars[idx].count++;
  }
  return bars;
}

// ─── Goal progress (athlete_profiles.goals against the loaded logbook) ───────

/** Mirror of the app's AthleteGoal (athlete_profiles.goals jsonb rows). */
export interface CloudGoal {
  id: string;
  text: string;
  done?: boolean;
  target?: { discipline: string; unit: string; value: number };
}

export interface GoalProgressRow {
  goal: CloudGoal;
  /** Current best for the goal's target discipline (same unit family). */
  current: number;
  /** 0..1, clamped. Null when the goal has no numeric target. */
  fraction: number | null;
}

const DEPTH_DISCIPLINES = new Set(['CWT', 'CWTB', 'CNF', 'FIM', 'VWT']);
const POOL_DISCIPLINES = new Set(['DYN', 'DYNB', 'DNF']);

export function goalProgress(sessions: ParsedSession[], goals: CloudGoal[]): GoalProgressRow[] {
  return goals
    .filter((g) => !g.done)
    .map((g) => {
      if (!g.target || !(g.target.value > 0)) return { goal: g, current: 0, fraction: null };
      const disc = g.target.discipline?.toUpperCase?.() ?? '';
      let current = 0;
      if (DEPTH_DISCIPLINES.has(disc)) {
        for (const s of sessions) {
          if (s.mode !== 'depth') continue;
          const sess = s as { dives?: { depth?: number; discipline?: string }[] };
          for (const d of sess.dives ?? []) {
            if ((d.discipline ?? '').toUpperCase() === disc && typeof d.depth === 'number')
              current = Math.max(current, d.depth);
          }
        }
      } else if (POOL_DISCIPLINES.has(disc)) {
        for (const s of sessions) {
          if (s.mode !== 'pool') continue;
          const sess = s as { dives?: { distance?: number | null; discipline?: string }[] };
          for (const d of sess.dives ?? []) {
            if ((d.discipline ?? '').toUpperCase() === disc && typeof d.distance === 'number')
              current = Math.max(current, d.distance);
          }
        }
      } else if (disc === 'STA') {
        for (const s of sessions) current = Math.max(current, maxHoldSec(s));
      }
      const fraction = current > 0 ? Math.min(1, current / g.target.value) : 0;
      return { goal: g, current, fraction };
    });
}

// ─── formatting ──────────────────────────────────────────────────────────────

export function fmtHold(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
