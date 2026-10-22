/**
 * averageProfile — a mean depth-vs-time curve across a set of dives, for the Ask
 * assistant's `profile_avg` chart (and reusable elsewhere).
 *
 * Dives differ in duration and max depth, so a raw depth-time average is
 * meaningless. Each dive is TIME-NORMALIZED to its own [0,1] span (so descent /
 * bottom / ascent line up proportionally), resampled to a fixed grid by linear
 * interpolation, then averaged sample-by-sample. We also return the min/max
 * envelope at each grid point so the caller can shade the spread — honest about
 * how much the shapes vary rather than implying every dive looked like the mean.
 *
 * Pure + Deno/browser-safe (no Math.min/max spread on the big per-dive arrays —
 * loops, per the large-array lesson).
 */
import type { ProfilePoint } from './diveProfile';

/** Grid points across the normalized dive (inclusive of both ends). */
export const AVG_PROFILE_SAMPLES = 40;

export interface AvgProfilePoint {
  /** Time fraction 0..1 of the dive (0 = surface start, 1 = surface end). */
  f: number;
  meanDepth: number;
  minDepth: number;
  maxDepth: number;
}

export interface AvgProfile {
  points: AvgProfilePoint[];
  /** Dives actually averaged (those with a usable >=2-point profile). */
  n: number;
  avgMaxDepth: number;
  avgDurationSec: number;
  /** Deepest single sample across all dives (drives the Y axis). */
  peakDepth: number;
}

/** Depth at absolute time `targetT` (seconds) on a t-sorted profile, by linear
 *  interpolation; clamps to the first/last sample outside the range. */
function depthAt(sorted: ProfilePoint[], targetT: number): number {
  if (targetT <= sorted[0].t) return sorted[0].d;
  const last = sorted[sorted.length - 1];
  if (targetT >= last.t) return last.d;
  // Small profiles (a few hundred points at most) → a linear scan is fine.
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    if (targetT <= b.t) {
      const a = sorted[i - 1];
      const span = b.t - a.t;
      if (span <= 0) return b.d;
      const w = (targetT - a.t) / span;
      return a.d + (b.d - a.d) * w;
    }
  }
  return last.d;
}

function maxD(profile: ProfilePoint[]): number {
  let m = profile[0].d;
  for (let i = 1; i < profile.length; i++) {
    if (profile[i].d > m) m = profile[i].d;
  }
  return m;
}

export function averageProfile(profiles: ProfilePoint[][]): AvgProfile | null {
  const resampled: number[][] = [];
  let sumMax = 0;
  let sumDur = 0;
  let peakDepth = 0;

  for (const p of profiles) {
    if (!p || p.length < 2) continue;
    const sorted = [...p].sort((a, b) => a.t - b.t);
    const t0 = sorted[0].t;
    const totalT = sorted[sorted.length - 1].t - t0;
    if (totalT <= 0) continue;

    const dmax = maxD(sorted);
    if (dmax > peakDepth) peakDepth = dmax;
    sumMax += dmax;
    sumDur += totalT;

    const row: number[] = [];
    for (let i = 0; i <= AVG_PROFILE_SAMPLES; i++) {
      row.push(depthAt(sorted, t0 + (i / AVG_PROFILE_SAMPLES) * totalT));
    }
    resampled.push(row);
  }

  const n = resampled.length;
  if (n === 0) return null;

  const points: AvgProfilePoint[] = [];
  for (let i = 0; i <= AVG_PROFILE_SAMPLES; i++) {
    let sum = 0;
    let lo = resampled[0][i];
    let hi = resampled[0][i];
    for (let j = 0; j < n; j++) {
      const v = resampled[j][i];
      sum += v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    points.push({ f: i / AVG_PROFILE_SAMPLES, meanDepth: sum / n, minDepth: lo, maxDepth: hi });
  }

  return {
    points,
    n,
    avgMaxDepth: sumMax / n,
    avgDurationSec: sumDur / n,
    peakDepth,
  };
}
