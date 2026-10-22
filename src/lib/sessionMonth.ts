/**
 * The Session list's month view: each session's best figure, what each day
 * of a month shows in the calendar, and the quick filters that light days
 * up (Philipp's option B, 2026-10-22; the app's logbook calendar). PURE.
 */
import type { ParsedSession } from '../schema/backup';
import { includeDive } from './analytics/diveFilter';

export interface SessionBest {
  /** Comparable within a mode: metres for depth and pool distance, seconds
   *  for holds and statics. */
  value: number;
  /** As shown: "71.8m", "125m", "6:36". */
  text: string;
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Dive = { depth?: number; distance?: number | null; diveTime?: number; discipline?: string; diveType?: string | null; rating?: number | null };

function dives(s: ParsedSession): Dive[] {
  return ((s as { dives?: Dive[] }).dives ?? []).filter((d) => includeDive(d.diveType));
}

/** Deepest dive, furthest pool dive (or longest static), longest hold. */
export function sessionBest(s: ParsedSession): SessionBest | null {
  if (s.mode === 'depth') {
    let max = 0;
    for (const d of dives(s)) if (typeof d.depth === 'number' && d.depth > max) max = d.depth;
    return max > 0 ? { value: max, text: `${Math.round(max * 10) / 10}m` } : null;
  }
  if (s.mode === 'pool') {
    let dist = 0;
    let sta = 0;
    for (const d of dives(s)) {
      if (d.discipline === 'STA') {
        if (typeof d.diveTime === 'number' && d.diveTime > sta) sta = d.diveTime;
      } else if (typeof d.distance === 'number' && d.distance > dist) dist = d.distance;
    }
    if (dist > 0) return { value: dist, text: `${Math.round(dist)}m` };
    return sta > 0 ? { value: sta, text: mmss(sta) } : null;
  }
  const timeline = (s as { blockTimeline?: { type?: string; seconds?: number }[] }).blockTimeline ?? [];
  let hold = 0;
  for (const b of timeline) if (b.type === 'Hold' && typeof b.seconds === 'number' && b.seconds > hold) hold = b.seconds;
  return hold > 0 ? { value: hold, text: mmss(hold) } : null;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sessionDay(s: ParsedSession): string | null {
  const d = new Date(s.date);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

export function inMonth(s: ParsedSession, year: number, month: number): boolean {
  const d = new Date(s.date);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
}

export interface CalendarDay {
  /** The mode the block is coloured in: the day's leading session. */
  mode: ParsedSession['mode'];
  /** The leading session's best, for the block's label. */
  best: string | null;
  sessions: number;
  /** Some session that day passes the active filters. */
  matches: boolean;
}

/** Depth outranks pool outranks dry, as in the app's month calendar: the
 *  deepest dive of the day is the headline on a mixed day. */
const RANK: Record<ParsedSession['mode'], number> = { depth: 2, pool: 1, dry: 0 };

export function monthDays(
  sessions: ParsedSession[],
  year: number,
  month: number,
  matches: (s: ParsedSession) => boolean,
): Map<string, CalendarDay> {
  const out = new Map<string, CalendarDay>();
  const lead = new Map<string, { s: ParsedSession; best: SessionBest | null }>();
  for (const s of sessions) {
    if (!inMonth(s, year, month)) continue;
    const key = sessionDay(s)!;
    const best = sessionBest(s);
    const cur = lead.get(key);
    if (
      !cur ||
      RANK[s.mode] > RANK[cur.s.mode] ||
      (RANK[s.mode] === RANK[cur.s.mode] && (best?.value ?? 0) > (cur.best?.value ?? 0))
    ) {
      lead.set(key, { s, best });
    }
    const day = out.get(key);
    const m = matches(s);
    if (day) {
      day.sessions++;
      day.matches = day.matches || m;
    } else {
      out.set(key, { mode: s.mode, best: null, sessions: 1, matches: m });
    }
  }
  for (const [key, { s, best }] of lead) {
    const day = out.get(key)!;
    day.mode = s.mode;
    day.best = best?.text ?? null;
  }
  return out;
}

export interface QuickFilters {
  /** Metres, or null when off. Depth sessions with a dive this deep. */
  deeperThan: number | null;
  /** Effort 7 or more on the session or any of its dives. */
  hard: boolean;
}

export const NO_QUICK: QuickFilters = { deeperThan: null, hard: false };

export function passesQuick(s: ParsedSession, f: QuickFilters): boolean {
  if (f.deeperThan != null) {
    if (s.mode !== 'depth') return false;
    if (!dives(s).some((d) => typeof d.depth === 'number' && d.depth >= f.deeperThan!)) return false;
  }
  if (f.hard) {
    const own = typeof s.rating === 'number' && s.rating >= 7;
    if (!own && !dives(s).some((d) => typeof d.rating === 'number' && d.rating >= 7)) return false;
  }
  return true;
}

/** The month a fresh visit opens on: the newest session's. */
export function latestMonth(sessions: ParsedSession[]): { y: number; m: number } {
  let latest = 0;
  for (const s of sessions) {
    const t = Date.parse(s.date);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  const d = latest > 0 ? new Date(latest) : new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}
