/**
 * Pool HR per dive — extract HR low and HR high per training dive,
 * one point per dive, plotted over time.
 *
 * Source of truth:
 *   1. dive.hrLowest / dive.hrHighest if present
 *   2. else min/max from dive.profile[].hr if profile is present
 *   3. else min/max from dive.hrProfile[].hr (legacy field)
 *
 * Dives with no HR data anywhere are skipped. Warmups/safeties/excluded
 * are skipped via includeDive.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

interface PoolDiveLite {
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';
  diveType?: string | null;
  diveTime: number;
  distance: number | null;
  hrLowest?: number | null;
  hrHighest?: number | null;
  profile?: { t: number; hr?: number }[];
  hrProfile?: { t: number; hr: number }[];
}

export interface HrPoint {
  date: string;
  low: number;
  high: number;
  discipline: PoolDiveLite['discipline'];
  /** Distance or `null` for STA — surfaced in the tooltip. */
  distance: number | null;
  diveTime: number;
}

function extractRange(d: PoolDiveLite): { low: number; high: number } | null {
  if (d.hrLowest != null && d.hrHighest != null && d.hrLowest > 0 && d.hrHighest > 0) {
    return { low: d.hrLowest, high: d.hrHighest };
  }
  const samples: number[] = [];
  for (const p of d.profile ?? []) {
    if (typeof p.hr === 'number' && p.hr > 0) samples.push(p.hr);
  }
  if (samples.length === 0) {
    for (const p of d.hrProfile ?? []) {
      if (typeof p.hr === 'number' && p.hr > 0) samples.push(p.hr);
    }
  }
  if (samples.length === 0) return null;
  return { low: Math.min(...samples), high: Math.max(...samples) };
}

export function poolHrPerDive(sessions: ParsedSession[]): HrPoint[] {
  const out: HrPoint[] = [];
  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
    for (const d of dives) {
      if (!includeDive(d.diveType)) continue;
      const range = extractRange(d);
      if (!range) continue;
      out.push({
        date: s.date,
        low: range.low,
        high: range.high,
        discipline: d.discipline,
        distance: d.distance,
        diveTime: d.diveTime,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
