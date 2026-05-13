/**
 * Profile-derived helpers for the depth-dive player.
 *
 * Per the spec, a depth Dive.profile is `{ t, d, v?, hr?, temp? }[]` at
 * 1 Hz. We extract one array per track so each chart can render its own
 * line without re-traversing.
 *
 * Hangs are sourced from `dive.hangs` when present (recent dives have
 * detected segments). For older dives without that field, we synthesize
 * a single bottom-hang covering the time between descent end and ascent
 * start so the visual still works.
 */

export interface ProfilePoint {
  /** Seconds from dive start */
  t: number;
  /** Depth in metres */
  d: number;
  /** Vertical speed m/s (negative = descending) */
  v?: number;
  /** Heart rate bpm */
  hr?: number;
  /** Water temperature °C */
  temp?: number;
}

export interface HangSegment {
  startT: number;
  endT: number;
  avgD: number;
  type: 'bottom' | 'offBottom';
}

export interface ContractionOnset {
  depth: number;
  direction: 'down' | 'up';
}

export interface DepthDiveData {
  /** All profile points sorted by time. */
  points: ProfilePoint[];
  /** Pre-extracted track series. Each entry is `[t, value]` for ECharts. */
  depthSeries: [number, number][];
  hrSeries: [number, number][];
  tempSeries: [number, number][];
  speedSeries: [number, number][];
  hasHR: boolean;
  hasTemp: boolean;
  hasSpeed: boolean;
  /** Hang segments (real or synthesized) for shading on the depth track. */
  hangs: HangSegment[];
  /** Time-axis bounds (seconds). */
  startT: number;
  endT: number;
  /** Max depth in metres (for axis scaling + display). */
  maxDepth: number;
}

interface DiveLike {
  profile?: ProfilePoint[];
  hangs?: HangSegment[];
  diveTime: number;
  descentTime?: number;
  ascentTime?: number;
  hangTime?: number;
  depth: number;
}

export function extractDiveData(dive: DiveLike): DepthDiveData {
  const points = dive.profile ?? [];
  const sorted = [...points].sort((a, b) => a.t - b.t);

  const depthSeries: [number, number][] = [];
  const hrSeries: [number, number][] = [];
  const tempSeries: [number, number][] = [];
  const speedSeries: [number, number][] = [];

  for (const p of sorted) {
    depthSeries.push([p.t, p.d]);
    if (p.hr != null && p.hr > 0) hrSeries.push([p.t, p.hr]);
    if (p.temp != null) tempSeries.push([p.t, p.temp]);
    if (p.v != null) speedSeries.push([p.t, p.v]);
  }

  const startT = sorted.length > 0 ? sorted[0].t : 0;
  const endT = sorted.length > 0 ? sorted[sorted.length - 1].t : dive.diveTime;

  const hangs = dive.hangs && dive.hangs.length > 0
    ? dive.hangs
    : synthesizeHang(dive);

  return {
    points: sorted,
    depthSeries,
    hrSeries,
    tempSeries,
    speedSeries,
    hasHR: hrSeries.length >= 2,
    hasTemp: tempSeries.length >= 2,
    hasSpeed: speedSeries.length >= 2,
    hangs,
    startT,
    endT,
    maxDepth: dive.depth,
  };
}

/** Fallback hang segment derived from session-level descentTime / hangTime
 *  when the dive predates the per-segment hangs[] field. */
function synthesizeHang(dive: DiveLike): HangSegment[] {
  const desc = dive.descentTime ?? 0;
  const hang = dive.hangTime ?? 0;
  if (hang <= 0 || desc <= 0) return [];
  return [{
    startT: desc,
    endT: desc + hang,
    avgD: dive.depth,
    type: 'bottom',
  }];
}
