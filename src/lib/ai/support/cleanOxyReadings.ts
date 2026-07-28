/**
 * Sensor-glitch filter for oximeter readings.
 *
 * Some pulse oximeters (notably the new generation Berrymed-style devices
 * the testers are wearing) fire transient spike artifacts: a 1-2 sample
 * SpO2 nosedive paired with an HR spike, then immediate snap-back to
 * baseline. Without filtering, these poison Min-SpO2, recovery-time, and
 * threshold-crossing analytics — Min SpO2 reads 85% when the diver
 * actually held above 92%.
 *
 * Approach: a 5-point median spike filter, applied independently to the
 * SpO2 and HR channels. A sample is flagged when it differs from the
 * median of its 5-point window by more than the per-channel threshold,
 * AND when the window's neighbours (excluding the sample itself) agree
 * with each other within a tight tolerance.
 *
 * Why this is robust against real physiology:
 *
 *   Glitch shape:   95 → 85 → 95         (spike, neighbours agree)
 *   Real afterdrop: 95 → 88 → 81         (trajectory, neighbours diverge)
 *   Real recovery:  85 → 88 → 92         (trajectory, neighbours diverge)
 *
 * The "neighbours must agree" guard is what distinguishes an isolated
 * transient (which we want to drop) from a real desaturation curve or
 * a recovery-breath HR spike (which we must preserve). Both real
 * physiological events have monotonic trajectories where the values
 * before and after the suspect sample disagree with each other; only a
 * sensor glitch produces neighbours that bracket the spike at the same
 * level.
 *
 * Flagged samples are replaced via linear interpolation between the
 * nearest unflagged neighbours, so downstream stats see a clean
 * monotone curve without holes. PI is left untouched (we don't have a
 * physiologically-grounded threshold for it).
 */

import type { OxyReading } from '../appTypes';

export interface CleanResult {
  /** Same length as input. Flagged samples have `s` and `h` replaced by
   *  linear interpolation between the nearest unflagged neighbours. */
  cleaned: OxyReading[];
  /** Indices of samples that were flagged as glitches (for debugging /
   *  optional "show raw" overlays). */
  flaggedIndices: number[];
}

interface CleanOptions {
  /** SpO2 difference (percentage points) from window median that
   *  triggers a flag. Default 5. */
  spo2Threshold?: number;
  /** HR difference (bpm) from window median that triggers a flag.
   *  Default 20. */
  hrThreshold?: number;
  /** Tolerance for "neighbours agree" check on SpO2 (percentage points).
   *  Default 2. */
  spo2NeighbourTolerance?: number;
  /** Tolerance for "neighbours agree" check on HR (bpm). Default 8. */
  hrNeighbourTolerance?: number;
}

const DEFAULT_OPTIONS: Required<CleanOptions> = {
  spo2Threshold: 5,
  hrThreshold: 20,
  spo2NeighbourTolerance: 2,
  hrNeighbourTolerance: 8,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Clean oximeter readings of single- and double-sample sensor glitches.
 *
 * Pure function. Does not mutate input. Returns the same number of
 * readings as input, with flagged samples linearly interpolated.
 *
 * Arrays shorter than 5 samples are returned unchanged (no window).
 */
export function cleanOxyReadings(readings: OxyReading[], options: CleanOptions = {}): CleanResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const n = readings.length;
  if (n < 5) {
    return { cleaned: readings.map((r) => ({ ...r })), flaggedIndices: [] };
  }

  // Pass 1: identify flagged indices using 5-point window centred on each
  // interior sample. Edges (first 2 / last 2) are never flagged because
  // the window can't be centred on them.
  const flagged: boolean[] = new Array(n).fill(false);
  for (let i = 2; i < n - 2; i++) {
    const sWindow = [readings[i - 2].s, readings[i - 1].s, readings[i + 1].s, readings[i + 2].s];
    const hWindow = [readings[i - 2].h, readings[i - 1].h, readings[i + 1].h, readings[i + 2].h];

    const sMedian = median(sWindow);
    const hMedian = median(hWindow);

    const sDeviation = Math.abs(readings[i].s - sMedian);
    const hDeviation = Math.abs(readings[i].h - hMedian);

    // Neighbours must agree before we trust the median enough to flag.
    // Without this guard, we'd flag samples on real desat trajectories
    // where the window happens to straddle a steep slope.
    const sNeighboursAgree = range(sWindow) <= opts.spo2NeighbourTolerance;
    const hNeighboursAgree = range(hWindow) <= opts.hrNeighbourTolerance;

    const sBad = sDeviation > opts.spo2Threshold && sNeighboursAgree;
    const hBad = hDeviation > opts.hrThreshold && hNeighboursAgree;

    if (sBad || hBad) {
      flagged[i] = true;
    }
  }

  // Pass 2: linear interpolation across runs of flagged samples. For each
  // flagged sample, find the nearest unflagged neighbour on either side
  // and interpolate `s` and `h`. Time `t` and PI `p` are kept as-is.
  const cleaned: OxyReading[] = readings.map((r) => ({ ...r }));
  for (let i = 0; i < n; i++) {
    if (!flagged[i]) continue;

    let leftIdx = i - 1;
    while (leftIdx >= 0 && flagged[leftIdx]) leftIdx--;
    let rightIdx = i + 1;
    while (rightIdx < n && flagged[rightIdx]) rightIdx++;

    if (leftIdx >= 0 && rightIdx < n) {
      const leftR = readings[leftIdx];
      const rightR = readings[rightIdx];
      const span = rightR.t - leftR.t;
      const frac = span > 0 ? (readings[i].t - leftR.t) / span : 0.5;
      cleaned[i] = {
        ...readings[i],
        s: Math.round(leftR.s + (rightR.s - leftR.s) * frac),
        h: Math.round(leftR.h + (rightR.h - leftR.h) * frac),
      };
    } else if (leftIdx >= 0) {
      cleaned[i] = { ...readings[i], s: readings[leftIdx].s, h: readings[leftIdx].h };
    } else if (rightIdx < n) {
      cleaned[i] = { ...readings[i], s: readings[rightIdx].s, h: readings[rightIdx].h };
    }
    // else: array is all flagged — leave the original values.
  }

  const flaggedIndices: number[] = [];
  for (let i = 0; i < n; i++) if (flagged[i]) flaggedIndices.push(i);

  return { cleaned, flaggedIndices };
}
