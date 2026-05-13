/**
 * Sensor-glitch filter for oximeter readings.
 *
 * Direct port from the mobile app's src/lib/algorithms/cleanOxyReadings.ts —
 * kept algorithmically identical so analyzer numbers match the in-app
 * Insights tab to the unit. If the app's version changes, update this file
 * in lockstep (Phase 5 will extract this into a shared package).
 */

export interface OxyReading {
  /** ms since session start */
  t: number;
  /** SpO2 % */
  s: number;
  /** Heart rate bpm */
  h: number;
  /** Perfusion index */
  p: number;
}

export interface CleanResult {
  cleaned: OxyReading[];
  flaggedIndices: number[];
}

interface CleanOptions {
  spo2Threshold?: number;
  hrThreshold?: number;
  spo2NeighbourTolerance?: number;
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
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function cleanOxyReadings(
  readings: OxyReading[],
  options: CleanOptions = {},
): CleanResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const n = readings.length;
  if (n < 5) {
    return { cleaned: readings.map((r) => ({ ...r })), flaggedIndices: [] };
  }

  const flagged: boolean[] = new Array(n).fill(false);
  for (let i = 2; i < n - 2; i++) {
    const sWindow = [readings[i - 2].s, readings[i - 1].s, readings[i + 1].s, readings[i + 2].s];
    const hWindow = [readings[i - 2].h, readings[i - 1].h, readings[i + 1].h, readings[i + 2].h];

    const sMedian = median(sWindow);
    const hMedian = median(hWindow);

    const sDeviation = Math.abs(readings[i].s - sMedian);
    const hDeviation = Math.abs(readings[i].h - hMedian);

    const sNeighboursAgree = range(sWindow) <= opts.spo2NeighbourTolerance;
    const hNeighboursAgree = range(hWindow) <= opts.hrNeighbourTolerance;

    const sBad = sDeviation > opts.spo2Threshold && sNeighboursAgree;
    const hBad = hDeviation > opts.hrThreshold && hNeighboursAgree;

    if (sBad || hBad) {
      flagged[i] = true;
    }
  }

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
  }

  const flaggedIndices: number[] = [];
  for (let i = 0; i < n; i++) if (flagged[i]) flaggedIndices.push(i);

  return { cleaned, flaggedIndices };
}
