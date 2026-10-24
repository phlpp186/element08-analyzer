/**
 * Speed by depth, for comparing dives (the app's "speed vs depth" compare view,
 * asked for on the web, 2026-10-24). PURE.
 *
 * Each dive becomes two curves: descent speed and ascent speed against depth,
 * split at the first deepest sample. Speed is the app's: derived from depth
 * and Savitzky-Golay smoothed at 'medium'. A dive without a profile gets
 * straight lines at its average descent and ascent speed, marked as such.
 */
import type { ProfilePoint } from './diveProfile';
import { smoothSpeed } from './speedProfile';

export interface DepthSpeed {
  depth: number;
  /** m/s, always positive. */
  spd: number;
}

export interface SpeedByDepth {
  /** In time order: down from the surface, then back up. Depth is not
   *  strictly monotonic (a FIM pull, a wave), which is why it is not sorted:
   *  sorting would scramble the line. */
  descent: DepthSpeed[];
  ascent: DepthSpeed[];
  /** No profile: the curves come from the dive's summary times. */
  fallback: boolean;
}

interface DiveLike {
  profile?: ProfilePoint[];
  depth: number;
  diveTime: number;
  descentTime?: number;
  hangTime?: number;
}

export function speedByDepth(dive: DiveLike): SpeedByDepth {
  if (!dive.profile || dive.profile.length < 2) return standIn(dive);
  const profile = [...dive.profile].sort((a, b) => a.t - b.t);
  const spd = smoothSpeed(profile, 'medium');
  let peak = 0;
  for (let i = 1; i < profile.length; i++) if (profile[i].d > profile[peak].d) peak = i;

  const descent: DepthSpeed[] = [];
  const ascent: DepthSpeed[] = [];
  for (let i = 0; i < profile.length; i++) {
    const s = Math.abs(spd[i]);
    const d = profile[i].d;
    if (!Number.isFinite(s) || !Number.isFinite(d)) continue;
    if (i <= peak) descent.push({ depth: d, spd: s });
    if (i >= peak) ascent.push({ depth: d, spd: s });
  }
  return { descent, ascent, fallback: false };
}

/** A dive without a profile: its average descent and ascent speed as straight
 *  lines. Smoothing a four-point outline (as the app does) bends a steady
 *  1.0 m/s descent into 0.1 to 0.7 m/s. */
function standIn(dive: DiveLike): SpeedByDepth {
  const desc = dive.descentTime && dive.descentTime > 0 ? dive.descentTime : dive.diveTime * 0.35;
  const hang = dive.hangTime && dive.hangTime > 0 ? dive.hangTime : 0;
  const asc = dive.diveTime - desc - hang;
  const down = desc > 0 ? dive.depth / desc : 0;
  const up = asc > 0 ? dive.depth / asc : 0;
  return {
    descent: [
      { depth: 0, spd: down },
      { depth: dive.depth, spd: down },
    ],
    ascent: [
      { depth: dive.depth, spd: up },
      { depth: 0, spd: up },
    ],
    fallback: true,
  };
}

/** Speed where the curve first passes a depth, interpolated between the two
 *  samples around it; null if it never reaches that depth. */
export function speedAtDepth(pts: DepthSpeed[], depth: number): number | null {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (depth >= Math.min(a.depth, b.depth) && depth <= Math.max(a.depth, b.depth)) {
      const span = b.depth - a.depth;
      return span === 0 ? a.spd : a.spd + ((b.spd - a.spd) * (depth - a.depth)) / span;
    }
  }
  return null;
}

export interface SpeedDelta {
  depth: number;
  /** First dive minus second, m/s; null where either curve is missing. */
  descent: number | null;
  ascent: number | null;
}

/** The two dives' speed difference every `step` metres, for the labels the
 *  app prints beside a two-dive comparison. */
export function speedDeltas(
  a: SpeedByDepth,
  b: SpeedByDepth,
  maxDepth: number,
  step = 5,
): SpeedDelta[] {
  const out: SpeedDelta[] = [];
  for (let d = step; d < maxDepth; d += step) {
    const da = speedAtDepth(a.descent, d);
    const db = speedAtDepth(b.descent, d);
    const ua = speedAtDepth(a.ascent, d);
    const ub = speedAtDepth(b.ascent, d);
    out.push({
      depth: d,
      descent: da != null && db != null ? da - db : null,
      ascent: ua != null && ub != null ? ua - ub : null,
    });
  }
  return out;
}
