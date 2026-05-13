/**
 * SpO2 exposure zones — total time spent at each saturation band across
 * all (cleaned) dry-session oximeter readings.
 *
 * Mirrors app/insights/index.tsx lines 1551-1562 exactly. Bands are:
 *   > 89%      — normal
 *   75-89%     — mild hypoxia
 *   65-74%     — moderate
 *   55-64%     — severe
 *   < 55%      — critical
 *
 * Each oxy reading is roughly 1 Hz, so the count of samples per band ≈ the
 * total seconds spent in that band. We don't multiply by sample interval
 * (the in-app version doesn't either) — both views report counts.
 */
import { cleanOxyReadings, type OxyReading } from './cleanOxyReadings';
import type { ParsedSession } from '../../schema/backup';

export interface Spo2Zones {
  above89: number;
  n89_75: number;
  n74_65: number;
  n64_55: number;
  below55: number;
}

/** Optional lung-volume filter — null/undefined = include all. */
export function spo2ExposureZones(
  sessions: ParsedSession[],
  lungVolFilter: 'FL' | 'FRC' | 'RV' | null = null,
): Spo2Zones {
  const z: Spo2Zones = {
    above89: 0,
    n89_75: 0,
    n74_65: 0,
    n64_55: 0,
    below55: 0,
  };

  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    if (lungVolFilter && (s as unknown as { lungVol: string }).lungVol !== lungVolFilter) continue;

    const readings = (s as unknown as { oxyReadings?: OxyReading[] }).oxyReadings ?? [];
    const cleaned = cleanOxyReadings(readings).cleaned;
    for (const r of cleaned) {
      if (r.s >= 90) z.above89++;
      else if (r.s >= 75) z.n89_75++;
      else if (r.s >= 65) z.n74_65++;
      else if (r.s >= 55) z.n64_55++;
      else z.below55++;
    }
  }
  return z;
}

/** Sample-count → "Mh Ms" rough duration. Each sample is ~1 second of
 *  exposure; finer cadence is unusual and the app reports counts too. */
export function fmtZoneDuration(samples: number): string {
  if (samples <= 0) return '0s';
  const h = Math.floor(samples / 3600);
  const m = Math.floor((samples % 3600) / 60);
  const s = samples % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
