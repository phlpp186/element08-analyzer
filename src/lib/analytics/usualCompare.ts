/**
 * "Against your usual": one dive measured against the diver's other dives
 * of the same discipline at a similar depth (±5 m) or pool distance
 * (±10 m), Philipp 2026-10-22. The usual is the median, so one odd dive does
 * not move it. PURE.
 *
 * Read from the stored per-dive figures on both sides, so the dive and its
 * peers are measured the same way even when only some have a profile.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

export const USUAL_DEPTH_WINDOW_M = 5;
export const USUAL_POOL_WINDOW_M = 10;
export const USUAL_MIN_DIVES = 3;

/** How a figure reads, which decides its format and its "better" words. */
export type UsualKind = 'speed' | 'time' | 'pace' | 'bpm';

export type UsualMetric =
  | 'descentSpeed'
  | 'ascentSpeed'
  | 'hangTime'
  | 'diveTime'
  | 'pace'
  | 'minHr'
  | 'avgHr';

export interface UsualRow {
  metric: UsualMetric;
  kind: UsualKind;
  value: number;
  usual: number;
  /** speed and pace: relative change in %; time: seconds; bpm: beats. */
  delta: number;
}

export interface UsualCompare {
  discipline: string;
  /** The window, in metres of depth or of pool distance. */
  from: number;
  to: number;
  /** The other dives in the window. */
  count: number;
  rows: UsualRow[];
  /** The row furthest from usual (relative), when it is far enough to say. */
  standout: UsualRow | null;
}

type Dive = {
  depth?: number;
  distance?: number | null;
  diveTime?: number;
  hangTime?: number;
  descentSpeed?: number | null;
  ascentSpeed?: number | null;
  hr?: number | null;
  hrLowest?: number | null;
  profile?: { hr?: number | null }[];
  hrProfile?: { hr?: number | null }[];
  discipline?: string;
  diveType?: string | null;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function divesOf(s: ParsedSession | undefined): Dive[] {
  return (s as { dives?: Dive[] } | undefined)?.dives ?? [];
}

/** The lowest heart rate: the stored figure, else the profile's minimum. */
function minHr(d: Dive): number | null {
  const stored = num(d.hrLowest);
  if (stored != null) return stored;
  let lo: number | null = null;
  for (const p of d.profile ?? d.hrProfile ?? []) {
    const v = num(p.hr);
    if (v != null && (lo == null || v < lo)) lo = v;
  }
  return lo;
}

function pace(d: Dive): number | null {
  const dist = num(d.distance);
  const time = num(d.diveTime);
  return dist != null && time != null ? (time / dist) * 100 : null;
}

const RELATIVE: Record<UsualKind, boolean> = { speed: true, pace: true, time: false, bpm: false };

function compare(
  dive: Dive,
  peers: Dive[],
  metrics: { metric: UsualMetric; kind: UsualKind; get: (d: Dive) => number | null }[],
): { rows: UsualRow[]; standout: UsualRow | null } {
  const rows: UsualRow[] = [];
  for (const { metric, kind, get } of metrics) {
    const value = get(dive);
    const others = peers.map(get).filter((v): v is number => v != null);
    if (value == null || others.length < USUAL_MIN_DIVES) continue;
    const usual = median(others);
    rows.push({
      metric,
      kind,
      value,
      usual,
      delta: RELATIVE[kind] ? ((value - usual) / usual) * 100 : value - usual,
    });
  }
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
  return { rows, standout };
}

export function usualCompare(
  sessions: ParsedSession[],
  sessionId: number,
  diveIdx: number,
): UsualCompare | null {
  const dive = divesOf(sessions.find((s) => s.id === sessionId))[diveIdx];
  const depth = num(dive?.depth);
  if (!dive || depth == null || !dive.discipline) return null;
  const disc = dive.discipline;
  const peers: Dive[] = [];
  for (const s of sessions) {
    if (s.mode !== 'depth') continue;
    divesOf(s).forEach((d, i) => {
      if (s.id === sessionId && i === diveIdx) return;
      if (d.discipline !== disc || !includeDive(d.diveType)) return;
      const dd = num(d.depth);
      if (dd != null && Math.abs(dd - depth) <= USUAL_DEPTH_WINDOW_M) peers.push(d);
    });
  }
  if (peers.length < USUAL_MIN_DIVES) return null;
  const { rows, standout } = compare(dive, peers, [
    { metric: 'descentSpeed', kind: 'speed', get: (d) => num(d.descentSpeed) },
    { metric: 'ascentSpeed', kind: 'speed', get: (d) => num(d.ascentSpeed) },
    { metric: 'hangTime', kind: 'time', get: (d) => num(d.hangTime) },
    { metric: 'diveTime', kind: 'time', get: (d) => num(d.diveTime) },
  ]);
  return {
    discipline: disc,
    from: Math.max(0, Math.round(depth - USUAL_DEPTH_WINDOW_M)),
    to: Math.round(depth + USUAL_DEPTH_WINDOW_M),
    count: peers.length,
    rows,
    standout,
  };
}

/** The pool version: same discipline within ±10 m of distance. Statics have
 *  no distance and so no usual here. */
export function poolUsualCompare(
  sessions: ParsedSession[],
  sessionId: number,
  diveIdx: number,
): UsualCompare | null {
  const dive = divesOf(sessions.find((s) => s.id === sessionId))[diveIdx];
  const dist = num(dive?.distance);
  if (!dive || dist == null || !dive.discipline) return null;
  const disc = dive.discipline;
  const peers: Dive[] = [];
  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    divesOf(s).forEach((d, i) => {
      if (s.id === sessionId && i === diveIdx) return;
      if (d.discipline !== disc || !includeDive(d.diveType)) return;
      const dd = num(d.distance);
      if (dd != null && Math.abs(dd - dist) <= USUAL_POOL_WINDOW_M) peers.push(d);
    });
  }
  if (peers.length < USUAL_MIN_DIVES) return null;
  const { rows, standout } = compare(dive, peers, [
    { metric: 'diveTime', kind: 'time', get: (d) => num(d.diveTime) },
    { metric: 'pace', kind: 'pace', get: pace },
    { metric: 'minHr', kind: 'bpm', get: minHr },
    { metric: 'avgHr', kind: 'bpm', get: (d) => num(d.hr) },
  ]);
  return {
    discipline: disc,
    from: Math.max(0, Math.round(dist - USUAL_POOL_WINDOW_M)),
    to: Math.round(dist + USUAL_POOL_WINDOW_M),
    count: peers.length,
    rows,
    standout,
  };
}
