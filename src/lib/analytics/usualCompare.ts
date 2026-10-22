/**
 * "Against your usual": one dive measured against the diver's other dives
 * of the same discipline within ±5 m of its depth (Philipp, 2026-10-22).
 * The usual is the median, so one odd dive does not move it. PURE.
 *
 * Read from the stored per-dive figures on both sides, so the dive and its
 * peers are measured the same way even when only some have a profile.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

export const USUAL_WINDOW_M = 5;
export const USUAL_MIN_DIVES = 3;

type Dive = {
  depth?: number;
  diveTime?: number;
  hangTime?: number;
  descentSpeed?: number | null;
  ascentSpeed?: number | null;
  discipline?: string;
  diveType?: string | null;
};

export type UsualMetric = 'descentSpeed' | 'ascentSpeed' | 'hangTime' | 'diveTime';

export interface UsualRow {
  metric: UsualMetric;
  value: number;
  usual: number;
  /** Speeds: relative change in %; times: difference in seconds. */
  delta: number;
}

export interface UsualCompare {
  discipline: string;
  from: number;
  to: number;
  /** The other dives in the window. */
  count: number;
  rows: UsualRow[];
  /** The row furthest from usual (relative), when it is far enough to say. */
  standout: UsualRow | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function usualCompare(
  sessions: ParsedSession[],
  sessionId: number,
  diveIdx: number,
): UsualCompare | null {
  const session = sessions.find((s) => s.id === sessionId);
  const dive = ((session as { dives?: Dive[] } | undefined)?.dives ?? [])[diveIdx];
  const depth = num(dive?.depth);
  if (!dive || depth == null || !dive.discipline) return null;
  const disc = dive.discipline;

  const peers: Dive[] = [];
  for (const s of sessions) {
    if (s.mode !== 'depth') continue;
    ((s as { dives?: Dive[] }).dives ?? []).forEach((d, i) => {
      if (s.id === sessionId && i === diveIdx) return;
      if (d.discipline !== disc || !includeDive(d.diveType)) return;
      const dd = num(d.depth);
      if (dd != null && Math.abs(dd - depth) <= USUAL_WINDOW_M) peers.push(d);
    });
  }
  if (peers.length < USUAL_MIN_DIVES) return null;

  const rows: UsualRow[] = [];
  const add = (metric: UsualMetric, relative: boolean) => {
    const value = num(dive[metric]);
    const others = peers.map((p) => num(p[metric])).filter((v): v is number => v != null);
    if (value == null || others.length < USUAL_MIN_DIVES) return;
    const usual = median(others);
    rows.push({ metric, value, usual, delta: relative ? ((value - usual) / usual) * 100 : value - usual });
  };
  add('descentSpeed', true);
  add('ascentSpeed', true);
  add('hangTime', false);
  add('diveTime', false);

  // The biggest relative difference, if at least 5 %: below that a dive is
  // simply usual.
  let standout: UsualRow | null = null;
  let biggest = 0;
  for (const r of rows) {
    const rel = Math.abs(r.value - r.usual) / r.usual;
    if (rel >= 0.05 && rel > biggest) {
      biggest = rel;
      standout = r;
    }
  }
  return {
    discipline: disc,
    from: Math.max(0, Math.round(depth - USUAL_WINDOW_M)),
    to: Math.round(depth + USUAL_WINDOW_M),
    count: peers.length,
    rows,
    standout,
  };
}
