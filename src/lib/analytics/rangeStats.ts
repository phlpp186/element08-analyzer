/**
 * rangeStats — what happened between two points in time on one dive.
 *
 * Drag A to B across a dive profile and this is the readout: how far, how long,
 * how fast, and which way. Shared verbatim between the analyzer and the coach
 * portal (`diff` the two files to check for drift), because the one thing worse
 * than not having this number is having two of them that disagree.
 *
 * WHY A SIGNED DIRECTION AND TWO SPEEDS. "Average speed" over a segment is only
 * meaningful while the diver is going ONE WAY. Drag across the bottom of a dive
 * and the net displacement is near zero, so `metres ÷ seconds` reports a diver
 * who was not moving through a turn they very much swam. So:
 *
 *   · `avgSpeed` is net displacement over time, and is NULL whenever net
 *     displacement is not the right question (a hang, or a selection that
 *     turned around inside itself). Null is the module refusing to answer,
 *     not an absence of data.
 *   · `pathSpeed` is metres actually travelled over time, and is always there.
 *     It matches the convention SpeedBands already uses on the same dive
 *     (`dist += |Δd|` per sample), so the two surfaces agree.
 *
 * Hangs are NOT excluded the way SpeedBands excludes them. The diver drew this
 * range by hand; silently dropping samples from inside their own selection
 * would make the numbers unexplainable. `direction: 'hang'` says so instead.
 */

export interface RangePoint {
  /** Seconds from dive start. */
  t: number;
  /** Depth in metres, positive downward. */
  d: number;
  /** Instantaneous vertical speed, m/s, when the profile carries one. */
  v?: number;
  hr?: number;
}

export type RangeDirection = 'descent' | 'ascent' | 'hang' | 'mixed';

export interface RangeStats {
  startT: number;
  endT: number;
  /** Elapsed seconds. Always > 0. */
  dt: number;
  startDepth: number;
  endDepth: number;
  /** endDepth - startDepth. POSITIVE means deeper. */
  deltaDepth: number;
  shallowest: number;
  deepest: number;
  direction: RangeDirection;
  /** |deltaDepth| / dt, or null when net displacement is the wrong question. */
  avgSpeed: number | null;
  /** Metres actually travelled (sum of |Δd|). */
  pathDistance: number;
  /** pathDistance / dt. Always available. */
  pathSpeed: number;
  /** Fastest instantaneous |v| in range, when the profile carries speed. */
  maxSpeed: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
  /** Profile samples inside the range. */
  samples: number;
}

/** A segment this flat is a hang, whichever way its noise happens to point. */
const HANG_RANGE_M = 1.0;
/** Backtracking under this share of the dominant direction is kick-glide
 *  wobble, not a turn. Above it, the selection genuinely went both ways. */
const ONE_WAY_RATIO = 0.15;

function classify(descendM: number, ascendM: number, spread: number): RangeDirection {
  if (spread < HANG_RANGE_M) return 'hang';
  if (ascendM <= ONE_WAY_RATIO * descendM) return 'descent';
  if (descendM <= ONE_WAY_RATIO * ascendM) return 'ascent';
  return 'mixed';
}

/**
 * Stats for the samples in [t0, t1]. Returns null when there is nothing
 * defensible to report: fewer than two samples in range, or no elapsed time.
 * The caller renders nothing rather than a row of zeroes.
 */
export function rangeStats(points: RangePoint[], t0: number, t1: number): RangeStats | null {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const inRange = points.filter((p) => p.t >= lo && p.t <= hi).sort((a, b) => a.t - b.t);
  if (inRange.length < 2) return null;

  const startT = inRange[0].t;
  const endT = inRange[inRange.length - 1].t;
  const dt = endT - startT;
  if (dt <= 0) return null;

  let descendM = 0;
  let ascendM = 0;
  let shallowest = inRange[0].d;
  let deepest = inRange[0].d;
  let maxSpeed: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  let minHr: number | null = null;
  let maxHr: number | null = null;

  for (let i = 0; i < inRange.length; i++) {
    const p = inRange[i];
    if (p.d < shallowest) shallowest = p.d;
    if (p.d > deepest) deepest = p.d;
    if (p.v != null && Number.isFinite(p.v)) {
      const a = Math.abs(p.v);
      if (maxSpeed == null || a > maxSpeed) maxSpeed = a;
    }
    if (p.hr != null && p.hr > 0) {
      hrSum += p.hr;
      hrCount++;
      if (minHr == null || p.hr < minHr) minHr = p.hr;
      if (maxHr == null || p.hr > maxHr) maxHr = p.hr;
    }
    if (i > 0) {
      const step = p.d - inRange[i - 1].d;
      if (step > 0) descendM += step;
      else ascendM += -step;
    }
  }

  const deltaDepth = inRange[inRange.length - 1].d - inRange[0].d;
  const pathDistance = descendM + ascendM;
  const direction = classify(descendM, ascendM, deepest - shallowest);
  const oneWay = direction === 'descent' || direction === 'ascent';

  return {
    startT,
    endT,
    dt,
    startDepth: inRange[0].d,
    endDepth: inRange[inRange.length - 1].d,
    deltaDepth,
    shallowest,
    deepest,
    direction,
    avgSpeed: oneWay ? Math.abs(deltaDepth) / dt : null,
    pathDistance,
    pathSpeed: pathDistance / dt,
    maxSpeed,
    avgHr: hrCount > 0 ? hrSum / hrCount : null,
    minHr,
    maxHr,
    samples: inRange.length,
  };
}
