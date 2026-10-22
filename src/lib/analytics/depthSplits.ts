/**
 * Splits for comparing depth dives (Philipp's options A + C, 2026-10-22):
 * seconds per depth band on the way down and up, how far ahead or behind a
 * dive was against a reference at every metre, and a verdict naming what
 * differed between two dives. PURE.
 *
 * Crossing times are interpolated between samples, so a band's time does not
 * jump with the logging interval. Descent is everything up to the first
 * deepest sample, ascent everything after it.
 */
import type { ProfilePoint } from './diveProfile';

export interface BandSplit {
  from: number;
  to: number;
  /** Seconds to go from `from` to `to` on the way down, null if not reached. */
  descent: number | null;
  /** Seconds to go from `to` back up to `from`. */
  ascent: number | null;
}

interface Crossings {
  maxDepth: number;
  /** Time the dive first reached depth d going down. */
  down: (d: number) => number | null;
  /** Time the dive first came back up to depth d. */
  up: (d: number) => number | null;
}

function crossings(profile: ProfilePoint[]): Crossings | null {
  if (!profile || profile.length < 3) return null;
  const pts = [...profile].sort((a, b) => a.t - b.t);
  let iMax = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].d > pts[iMax].d) iMax = i;
  const maxDepth = pts[iMax].d;
  if (maxDepth <= 0) return null;
  const down = (d: number): number | null => {
    if (d <= pts[0].d) return pts[0].t;
    for (let i = 1; i <= iMax; i++) {
      if (pts[i].d >= d) {
        const a = pts[i - 1];
        const b = pts[i];
        return b.d === a.d ? b.t : a.t + ((d - a.d) / (b.d - a.d)) * (b.t - a.t);
      }
    }
    return null;
  };
  const up = (d: number): number | null => {
    if (d > maxDepth) return null;
    for (let i = iMax + 1; i < pts.length; i++) {
      if (pts[i].d <= d) {
        const a = pts[i - 1];
        const b = pts[i];
        return b.d === a.d ? b.t : a.t + ((a.d - d) / (a.d - b.d)) * (b.t - a.t);
      }
    }
    // Never back at that depth (the log stopped short of the surface): the
    // last sample stands in for the top band only.
    return d <= pts[pts.length - 1].d + 0.5 ? pts[pts.length - 1].t : null;
  };
  return { maxDepth, down, up };
}

/** Seconds per `step`-metre band, down and up, for every full band. */
export function bandSplits(profile: ProfilePoint[], step = 10): BandSplit[] {
  const c = crossings(profile);
  if (!c) return [];
  const out: BandSplit[] = [];
  for (let from = 0; from + step <= c.maxDepth; from += step) {
    const to = from + step;
    const d0 = c.down(from);
    const d1 = c.down(to);
    const u1 = c.up(to);
    const u0 = c.up(from);
    out.push({
      from,
      to,
      descent: d0 != null && d1 != null ? d1 - d0 : null,
      ascent: u0 != null && u1 != null ? u0 - u1 : null,
    });
  }
  return out;
}

/** Metres above the shallower dive's turn left out of the gap: the slowing
 *  into the turn and any bottom hang live there, and they are not pace. */
const TURN_MARGIN = 2;

export interface GapCurve {
  /** Deepest metre the gap is measured to (both dives' turn less a margin). */
  turn: number;
  /** One point per metre down then up: where, and seconds ahead (+) or
   *  behind (−) the reference. Down counts from the start; up counts from
   *  passing `turn` on the way back, so a dive that went a little deeper or
   *  hung longer is not "behind" on the way up for that alone. */
  points: { depth: number; phase: 'down' | 'up'; gap: number }[];
}

/** How far ahead (+) or behind (−) `other` was against `ref`, metre by metre,
 *  over the depths both reached. */
export function gapCurve(ref: ProfilePoint[], other: ProfilePoint[]): GapCurve | null {
  const r = crossings(ref);
  const o = crossings(other);
  if (!r || !o) return null;
  const turn = Math.floor(Math.min(r.maxDepth, o.maxDepth)) - TURN_MARGIN;
  if (turn < 2) return null;
  const points: GapCurve['points'] = [];
  for (let d = 1; d <= turn; d++) {
    const a = r.down(d);
    const b = o.down(d);
    if (a != null && b != null) points.push({ depth: d, phase: 'down', gap: a - b });
  }
  const r0 = r.up(turn);
  const o0 = o.up(turn);
  if (r0 != null && o0 != null) {
    for (let d = turn; d >= 1; d--) {
      const a = r.up(d);
      const b = o.up(d);
      if (a != null && b != null) points.push({ depth: d, phase: 'up', gap: a - r0 - (b - o0) });
    }
  }
  return { turn, points };
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export interface Stretch {
  phase: 'descent' | 'ascent';
  from: number;
  to: number;
  /** Seconds the reference saved (+) or lost (−) over the stretch. */
  saved: number;
}

/** Where the reference gained or lost most: neighbouring bands that moved
 *  the same way by at least `min` seconds each, merged; the largest wins. */
export function biggestStretch(ref: BandSplit[], other: BandSplit[], min = 0.3): Stretch | null {
  let best: Stretch | null = null;
  for (const phase of ['descent', 'ascent'] as const) {
    let run: Stretch | null = null;
    const flush = () => {
      if (run && (!best || Math.abs(run.saved) > Math.abs(best.saved))) best = run;
      run = null;
    };
    const n = Math.min(ref.length, other.length);
    for (let i = 0; i < n; i++) {
      const a = ref[i][phase];
      const b = other[i][phase];
      const saved = a != null && b != null ? b - a : 0;
      if (Math.abs(saved) < min) {
        flush();
        continue;
      }
      if (run && Math.sign(run.saved) === Math.sign(saved)) {
        run.to = ref[i].to;
        run.saved += saved;
      } else {
        flush();
        run = { phase, from: ref[i].from, to: ref[i].to, saved };
      }
    }
    flush();
  }
  return best;
}

/** The kit and conditions two dives were logged with, side by side, where
 *  they differ. `kit` marks gear (suit, weight, fins, mask), the rest are
 *  conditions and technique. */
export interface Difference {
  key: string;
  ref: string;
  other: string;
  kit: boolean;
}

type DiveLike = Record<string, unknown> & {
  weightKg?: number | null;
  suit?: { kind?: string; mm?: number } | null;
  mfChargeDepth?: number | null;
  advanced?: Record<string, unknown> | null;
};

const KIT_CHIPS = ['monofin', 'bifin', 'fimFins', 'mask', 'weights'];
const CONDITION_CHIPS = ['waves', 'current', 'thermocline', 'eq', 'pace'];

function fields(d: DiveLike): Record<string, string | null> {
  const adv = d.advanced ?? {};
  const chip = (k: string) => (adv[k] == null || adv[k] === '' ? null : String(adv[k]));
  const out: Record<string, string | null> = {
    // The thickness says it; the kind is how it was entered ("preset").
    suit: d.suit?.kind === 'none' ? 'none' : d.suit?.mm != null ? `${d.suit.mm} mm` : null,
    weight: typeof d.weightKg === 'number' ? `${d.weightKg} kg` : null,
    mouthfill: typeof d.mfChargeDepth === 'number' && d.mfChargeDepth > 0 ? `${Math.round(d.mfChargeDepth)} m` : null,
  };
  for (const k of [...KIT_CHIPS, ...CONDITION_CHIPS]) out[k] = chip(k);
  return out;
}

export function diveDifferences(ref: DiveLike, other: DiveLike): { differences: Difference[]; sameKit: boolean | null } {
  const a = fields(ref);
  const b = fields(other);
  const kitKeys = new Set(['suit', 'weight', ...KIT_CHIPS]);
  const differences: Difference[] = [];
  let kitKnown = false;
  for (const key of Object.keys(a)) {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) continue;
    if (kitKeys.has(key) && x != null && y != null) kitKnown = true;
    if (x !== y) differences.push({ key, ref: x ?? '–', other: y ?? '–', kit: kitKeys.has(key) });
  }
  const kitDiffers = differences.some((d) => d.kit);
  return { differences, sameKit: kitDiffers ? false : kitKnown ? true : null };
}
