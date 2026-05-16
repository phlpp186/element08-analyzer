/**
 * SpO₂ analytics for the Breath Hold tab.
 *
 * Old view (stock-of-time bars per zone) inflated indefinitely with
 * session count and was visually dominated by the >89 % baseline zone
 * no matter what. Current view is a per-session trend:
 *
 *   - `spo2LowestPerSession`: lowest cleaned SpO₂ reached in each dry
 *     session, paired with date + name. Plotted as a scatter over time
 *     with horizontal zone-band references; the diver sees whether they
 *     are pushing lower / more often.
 *   - `spo2Summary`: a single tally of total time below 89 % (in
 *     seconds) and the number of contributing sessions / holds, for the
 *     "X minutes of low-SpO₂ time across Y sessions" line above the
 *     scatter. Stocks belong in a sentence, not a bar.
 */
import { cleanOxyReadings, type OxyReading } from './cleanOxyReadings';
import type { ParsedSession } from '../../schema/backup';

/** Zone thresholds — labels read "lowest reading was this zone or below". */
export const SPO2_ZONES = [
  { from: 90, to: 101, label: '>89%',   color: '#4fc3f7' }, // baseline / blue
  { from: 75, to: 90,  label: '75–89%', color: '#ffd54f' }, // mild
  { from: 65, to: 75,  label: '65–74%', color: '#ffa726' }, // moderate
  { from: 55, to: 65,  label: '55–64%', color: '#ef5350' }, // severe
  { from: 0,  to: 55,  label: '<55%',   color: '#b71c1c' }, // critical
] as const;

export function zoneFor(spo2: number): typeof SPO2_ZONES[number] {
  for (const z of SPO2_ZONES) {
    if (spo2 >= z.from && spo2 < z.to) return z;
  }
  return SPO2_ZONES[SPO2_ZONES.length - 1];
}

export interface Spo2SessionPoint {
  date: string;
  sessionName: string;
  lowest: number;
  holdCount: number;
  /** Seconds in this session where cleaned SpO₂ was below 90. ~1 Hz cadence
   *  so sample count ≈ seconds. Included on the tooltip. */
  secBelow89: number;
}

export interface Spo2Summary {
  /** Sum of below-89 sample counts across all included sessions. */
  totalSecBelow89: number;
  /** Sessions that contributed at least one usable SpO₂ reading. */
  sessionsWithOxy: number;
  /** Holds across those sessions (sum of cyclesCount). */
  totalHolds: number;
}

export interface Spo2TrendData {
  points: Spo2SessionPoint[];
  summary: Spo2Summary;
}

export function spo2LowestPerSession(
  sessions: ParsedSession[],
  lungVolFilter: 'FL' | 'FRC' | 'RV' | null = null,
): Spo2TrendData {
  const points: Spo2SessionPoint[] = [];
  let totalSecBelow89 = 0;
  let totalHolds = 0;

  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    if (lungVolFilter && (s as unknown as { lungVol?: string }).lungVol !== lungVolFilter) continue;
    const readings = (s as unknown as { oxyReadings?: OxyReading[] }).oxyReadings ?? [];
    if (readings.length === 0) continue;
    const cleaned = cleanOxyReadings(readings).cleaned;
    if (cleaned.length === 0) continue;

    let lowest = Infinity;
    let secBelow89 = 0;
    for (const r of cleaned) {
      if (r.s <= 0) continue;
      if (r.s < lowest) lowest = r.s;
      if (r.s < 90) secBelow89++;
    }
    if (!Number.isFinite(lowest)) continue;

    const holdCount = (s as unknown as { cyclesCount?: number }).cyclesCount ?? 0;
    points.push({
      date: s.date,
      sessionName: s.name || 'Dry session',
      lowest,
      holdCount,
      secBelow89,
    });
    totalSecBelow89 += secBelow89;
    totalHolds += holdCount;
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return {
    points,
    summary: {
      totalSecBelow89,
      sessionsWithOxy: points.length,
      totalHolds,
    },
  };
}

/** Sample-count → "Mh Ms" rough duration. Each sample is ~1 second of
 *  exposure; finer cadence is unusual. */
export function fmtZoneDuration(samples: number): string {
  if (samples <= 0) return '0s';
  const h = Math.floor(samples / 3600);
  const m = Math.floor((samples % 3600) / 60);
  const s = samples % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
