/**
 * Pool distance distribution — histogram of per-dive distances across all
 * pool sessions, bucketed into 25 m bins. STA dives (no distance) are
 * excluded.
 *
 * The mobile app's version bins similarly; if we discover a mismatch later
 * we'll align bin boundaries with the app side.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

interface PoolDiveLite {
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';
  distance: number | null;
  diveType?: string | null;
}

export interface DistanceBin {
  /** Lower bound, metres (inclusive). */
  from: number;
  /** Upper bound, metres (exclusive). */
  to: number;
  /** Number of dives in this bin. */
  count: number;
}

export function distanceDistribution(sessions: ParsedSession[], binSize = 25): DistanceBin[] {
  // Collect all distance values from pool dives (skip STA).
  const distances: number[] = [];
  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
    for (const d of dives) {
      if (!includeDive(d.diveType)) continue;
      if (d.discipline === 'STA') continue;
      if (d.distance != null && d.distance > 0) distances.push(d.distance);
    }
  }
  if (distances.length === 0) return [];

  const max = Math.max(...distances);
  // Bins span 0 → (next multiple of binSize ≥ max). Empty top bins are
  // trimmed; empty interior bins stay so the histogram has a continuous
  // x-axis.
  const lastBinStart = Math.floor(max / binSize) * binSize;
  const bins: DistanceBin[] = [];
  for (let start = 0; start <= lastBinStart; start += binSize) {
    bins.push({ from: start, to: start + binSize, count: 0 });
  }
  for (const d of distances) {
    const idx = Math.min(Math.floor(d / binSize), bins.length - 1);
    bins[idx].count++;
  }
  return bins;
}
