/**
 * effectiveHangs — apply a user override (if any) on top of auto-detected
 * hangs, and recompute the dive's descent / hang / ascent times + speeds
 * so the depth-player stat row reflects the correction.
 *
 * Speeds are recomputed honestly: `descentSpeed = maxDepth / descentTime`
 * with descent ending at the first hang start (or maxDepthTime if no hang).
 * Same idea for ascent. No speed inflation from including a hang slice.
 */
import type { HangSegment, ProfilePoint } from './diveProfile';

export interface DiveTimes {
  descentTime: number;
  hangTime: number;
  ascentTime: number;
  /** m/s. Null when descentTime is zero (or unknown). */
  descentSpeed: number | null;
  /** m/s. Null when ascentTime is zero (or unknown). */
  ascentSpeed: number | null;
}

/** Pick the override when present, else the auto-detected list. */
export function effectiveHangs(
  override: HangSegment[] | undefined,
  auto: HangSegment[],
): HangSegment[] {
  return override !== undefined ? override : auto;
}

/** Compute descent / hang / ascent times + speeds from the profile and
 *  effective hangs. */
export function diveTimes(
  points: ProfilePoint[],
  hangs: HangSegment[],
  maxDepth: number,
): DiveTimes {
  if (points.length < 2) {
    return { descentTime: 0, hangTime: 0, ascentTime: 0, descentSpeed: null, ascentSpeed: null };
  }
  const startT = points[0].t;
  const endT = points[points.length - 1].t;

  // Total hang time = sum of individual hang segments.
  let hangTime = 0;
  for (const h of hangs) hangTime += Math.max(0, h.endT - h.startT);

  // Descent ends at the first hang's start, or at the deepest sample if
  // there are no hangs. Ascent starts at the last hang's end, or at the
  // deepest sample.
  const sorted = [...hangs].sort((a, b) => a.startT - b.startT);
  const firstHang = sorted[0];
  const lastHang = sorted[sorted.length - 1];

  const maxDepthT = maxDepthTime(points);

  const descentEndT = firstHang ? firstHang.startT : maxDepthT;
  const ascentStartT = lastHang ? lastHang.endT : maxDepthT;

  const descentTime = Math.max(0, descentEndT - startT);
  const ascentTime = Math.max(0, endT - ascentStartT);

  const descentSpeed =
    descentTime > 0 && maxDepth > 0 ? maxDepth / descentTime : null;
  const ascentSpeed =
    ascentTime > 0 && maxDepth > 0 ? maxDepth / ascentTime : null;

  return { descentTime, hangTime, ascentTime, descentSpeed, ascentSpeed };
}

function maxDepthTime(points: ProfilePoint[]): number {
  let bestT = points[0].t;
  let bestD = points[0].d;
  for (const p of points) {
    if (p.d > bestD) {
      bestD = p.d;
      bestT = p.t;
    }
  }
  return bestT;
}
