/**
 * Small read-outs for the dive pages' stat tiles. Everything here is read
 * straight off the dive's own samples; nothing is modelled or estimated.
 */
import type { ProfilePoint } from './diveProfile';

export interface SeriesSummary {
  start: number;
  end: number;
  min: number;
  minT: number;
  max: number;
  maxT: number;
}

/** First, last, lowest and highest value of a time-ordered [t, v][] series. */
export function seriesSummary(series: [number, number][]): SeriesSummary | null {
  if (series.length < 2) return null;
  let min = series[0][1];
  let minT = series[0][0];
  let max = series[0][1];
  let maxT = series[0][0];
  for (const [t, v] of series) {
    if (v < min) {
      min = v;
      minT = t;
    }
    if (v > max) {
      max = v;
      maxT = t;
    }
  }
  return {
    start: series[0][1],
    end: series[series.length - 1][1],
    min,
    minT,
    max,
    maxT,
  };
}

/** Time at which depth first reaches `depth` going down, interpolated
 *  between the two samples that straddle it. */
function firstCrossingDown(points: ProfilePoint[], depth: number): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.d < depth && b.d >= depth) {
      return a.t + ((depth - a.d) / (b.d - a.d)) * (b.t - a.t);
    }
  }
  return null;
}

/** Time at which depth last leaves `depth` going up. */
function lastCrossingUp(points: ProfilePoint[], depth: number): number | null {
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    if (a.d >= depth && b.d < depth) {
      return a.t + ((a.d - depth) / (a.d - b.d)) * (b.t - a.t);
    }
  }
  return null;
}

/** Average speed over the first `metres` of the descent and the last
 *  `metres` of the ascent (surface to surface). Null when the dive is not
 *  deep enough or the profile does not cover both ends. */
export function edgeSpeeds(
  points: ProfilePoint[],
  maxDepth: number,
  metres = 10,
): { firstDescent: number | null; lastAscent: number | null } {
  if (points.length < 2 || !(maxDepth > metres)) {
    return { firstDescent: null, lastAscent: null };
  }
  const startT = points[0].t;
  const endT = points[points.length - 1].t;
  const down = firstCrossingDown(points, metres);
  const up = lastCrossingUp(points, metres);
  return {
    firstDescent: down != null && down > startT ? metres / (down - startT) : null,
    lastAscent: up != null && endT > up ? metres / (endT - up) : null,
  };
}

/** Fastest recorded vertical speed each way (v is negative descending). */
export function speedPeaks(speedSeries: [number, number][]): {
  descent: number | null;
  ascent: number | null;
} {
  let descent = 0;
  let ascent = 0;
  for (const [, v] of speedSeries) {
    if (v < -descent) descent = -v;
    if (v > ascent) ascent = v;
  }
  return { descent: descent > 0 ? descent : null, ascent: ascent > 0 ? ascent : null };
}

/** Value of a time-ordered series at the sample nearest to `t`. */
export function valueNear(series: [number, number][], t: number): number | null {
  let best: number | null = null;
  let bestDt = Infinity;
  for (const [st, v] of series) {
    const dt = Math.abs(st - t);
    if (dt < bestDt) {
      bestDt = dt;
      best = v;
    }
  }
  return best;
}
