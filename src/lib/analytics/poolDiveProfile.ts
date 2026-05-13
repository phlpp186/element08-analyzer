/**
 * Profile-derived helpers for the pool-dive player.
 *
 * A PoolDive carries:
 *   profile?: { t, hr, depth, speed }[]   — 1 Hz time series (t in seconds)
 *   hrProfile?: { t, hr }[]                — legacy HR-only fallback
 *   lapTimes: number[]                    — per-lap seconds (may not sum
 *                                            exactly to diveTime; see Build 20
 *                                            warning in the mobile app)
 *   contractions: number[]                — seconds from dive start
 *
 * We turn each of those into pre-indexed series so the chart renderer
 * doesn't have to filter inside its option builder on every redraw.
 */

export interface PoolProfilePoint {
  t: number;
  hr: number | null;
  depth: number | null;
  speed: number | null;
}

interface PoolDiveLike {
  profile?: PoolProfilePoint[];
  hrProfile?: { t: number; hr: number }[];
  lapTimes?: number[];
  contractions?: number[];
  diveTime: number;
  distance: number | null;
}

export interface PoolDiveData {
  hrSeries: [number, number][];
  depthSeries: [number, number][];
  speedSeries: [number, number][];
  hasHR: boolean;
  hasDepth: boolean;
  hasSpeed: boolean;
  /** Cumulative lap-end times. Rescaled to fit `diveTime` exactly, matching
   *  the mobile app's chart logic (lap totals don't always equal diveTime). */
  lapEndTimes: number[];
  contractionTimes: number[];
  startT: number;
  endT: number;
}

export function extractPoolDiveData(dive: PoolDiveLike): PoolDiveData {
  // Prefer the new full profile; fall back to legacy hrProfile when only HR
  // was captured. Both share `t` in seconds and stay sorted.
  const profile = dive.profile ?? [];

  const hrSeries: [number, number][] = [];
  const depthSeries: [number, number][] = [];
  const speedSeries: [number, number][] = [];

  for (const p of profile) {
    if (p.hr != null && p.hr > 0) hrSeries.push([p.t, p.hr]);
    if (p.depth != null && p.depth > 0) depthSeries.push([p.t, p.depth]);
    if (p.speed != null) speedSeries.push([p.t, p.speed]);
  }

  if (hrSeries.length === 0 && dive.hrProfile) {
    for (const p of dive.hrProfile) {
      if (p.hr > 0) hrSeries.push([p.t, p.hr]);
    }
  }

  // Lap markers — cumulative sums, rescaled to diveTime so they don't
  // overshoot the x-axis when manual entry rounded MM:SS values don't
  // sum exactly to the underlying dive time. Mirrors pool-dive.tsx fix
  // from Build 20.
  const lapEndTimes: number[] = [];
  const lapTimes = dive.lapTimes ?? [];
  if (lapTimes.length >= 1 && dive.diveTime > 0) {
    const sum = lapTimes.reduce((a, b) => a + b, 0);
    const scale = sum > 0 ? dive.diveTime / sum : 1;
    let cursor = 0;
    // N laps → N-1 turn boundaries (last cumsum equals dive end, not a turn).
    for (let i = 0; i < lapTimes.length - 1; i++) {
      cursor += lapTimes[i];
      lapEndTimes.push(cursor * scale);
    }
  }

  const contractionTimes = (dive.contractions ?? []).filter((t) => t > 0);

  // Determine time axis bounds. If we have any profile series, use its
  // observed start/end; otherwise span [0, diveTime].
  let startT = 0;
  let endT = dive.diveTime;
  if (profile.length > 0) {
    startT = profile[0].t;
    endT = profile[profile.length - 1].t;
  }

  return {
    hrSeries,
    depthSeries,
    speedSeries,
    hasHR: hrSeries.length >= 2,
    hasDepth: depthSeries.length >= 2,
    hasSpeed: speedSeries.length >= 2,
    lapEndTimes,
    contractionTimes,
    startT,
    endT,
  };
}
