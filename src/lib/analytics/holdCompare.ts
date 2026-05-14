/**
 * holdCompare — slice an individual breath hold out of a dry session for
 * the /compare/dives holds mode.
 *
 * A dry session is one continuous timeline; a "hold" is the Nth `Hold`
 * block in it. extractDrySessionData already gives us block boundaries
 * and SpO2/HR series in seconds-since-play, so a hold slice is just a
 * windowed, re-zeroed view of those series.
 *
 * Window mirrors the mobile app's CompareHoldChart: 30s before the hold
 * starts through 30s after it ends, so the lead-in and recovery show.
 */
import { extractDrySessionData } from './drySessionProfile';
import type { ParsedSession } from '../../schema/backup';

export const HOLD_PRE_POST_SEC = 30;

export interface HoldSlice {
  holdIdx: number;
  durationSec: number;
  rating: number | null;
  contractionCount: number;
  hasOxy: boolean;
  /** Series within [holdStart - 30, holdEnd + 30], x re-zeroed to hold start. */
  hrSeries: [number, number][];
  spo2Series: [number, number][];
}

export function extractHoldSlice(
  session: ParsedSession,
  holdIdx: number,
): HoldSlice | null {
  const data = extractDrySessionData(session as never);
  const holds = data.blocks.filter((b) => b.type === 'Hold');
  const block = holds[holdIdx];
  if (!block) return null;

  const lo = block.startT - HOLD_PRE_POST_SEC;
  const hi = block.endT + HOLD_PRE_POST_SEC;
  const slice = (series: [number, number][]) =>
    series
      .filter(([t]) => t >= lo && t <= hi)
      .map(([t, v]) => [t - block.startT, v] as [number, number]);

  return {
    holdIdx,
    durationSec: block.endT - block.startT,
    rating: typeof block.rating === 'number' ? block.rating : null,
    contractionCount: data.contractions.filter((c) => c.holdIdx === holdIdx).length,
    hasOxy: data.hasOxy,
    hrSeries: slice(data.hrSeries),
    spo2Series: slice(data.spo2Series),
  };
}

export interface HoldStats {
  minSpo2: number | null;
  minHr: number | null;
  hrAtEnd: number | null;
  spo2Post30: number | null;
}

export function holdStats(slice: HoldSlice): HoldStats {
  return {
    // SpO2 dips after the hold (afterdrop), so min spans through the post window.
    minSpo2: minInRange(slice.spo2Series, 0, slice.durationSec + HOLD_PRE_POST_SEC),
    minHr: minInRange(slice.hrSeries, 0, slice.durationSec),
    hrAtEnd: nearest(slice.hrSeries, slice.durationSec),
    spo2Post30: nearest(slice.spo2Series, slice.durationSec + HOLD_PRE_POST_SEC),
  };
}

function minInRange(
  series: [number, number][],
  lo: number,
  hi: number,
): number | null {
  let m: number | null = null;
  for (const [t, v] of series) {
    if (t < lo || t > hi) continue;
    if (m == null || v < m) m = v;
  }
  return m;
}

/** Series value at the sample nearest `t`, or null when the nearest sample
 *  is more than 5s away (no real reading there). */
function nearest(series: [number, number][], t: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [pt, v] of series) {
    const d = Math.abs(pt - t);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return bestDist <= 5 ? best : null;
}
