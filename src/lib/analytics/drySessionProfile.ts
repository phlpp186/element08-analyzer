/**
 * Profile-derived helpers for the dry-session player.
 *
 * Dry sessions are a single continuous timeline. Three sources:
 *   - oxyReadings: 1 Hz SpO₂/HR/PI samples. `t` is ms since oxy-stream
 *     start (not since first Play press).
 *   - playStart: ms offset between oxy-stream start and the first Play
 *     press. Pre-play samples sit at negative normalized time and are
 *     discarded for charts. Null when no oximeter was paired before play
 *     — in that case we treat the recording as starting at play.
 *   - blockTimeline: ordered Rest / Hold / Recover blocks with durations
 *     in seconds. Cumulative sum gives each block's start time relative
 *     to play.
 *   - contractions: { elapsed (seconds since play), holdIdx }.
 *
 * Output series use seconds-since-play as the x axis. SpO₂ readings are
 * pre-cleaned with the 5-point median spike filter so chart values match
 * the in-app Insights numbers.
 */
import { cleanOxyReadings, type OxyReading } from './cleanOxyReadings';

interface BlockEntry {
  type: 'Rest' | 'Hold' | 'Recover';
  seconds: number;
  rating?: number | null;
  pausedMs?: number;
}

interface Contraction {
  elapsed: number;
  holdIdx: number;
}

interface DrySessionLike {
  oxyReadings?: OxyReading[];
  playStart?: number | null;
  blockTimeline?: BlockEntry[];
  contractions?: Contraction[];
  duration?: string;
}

export interface DryBlock {
  type: 'Rest' | 'Hold' | 'Recover';
  startT: number;
  endT: number;
  rating?: number | null;
}

export interface DrySessionData {
  spo2Series: [number, number][];
  hrSeries: [number, number][];
  blocks: DryBlock[];
  /** Contractions normalized to seconds-since-play, paired with the hold
   *  block they belong to (for tooltip context). */
  contractions: { t: number; holdIdx: number }[];
  /** Time-axis bounds (seconds). 0 is "first play press." */
  startT: number;
  endT: number;
  hasOxy: boolean;
}

export function extractDrySessionData(session: DrySessionLike): DrySessionData {
  const playStart = session.playStart ?? 0;
  const readings = session.oxyReadings ?? [];
  const cleaned = readings.length > 0 ? cleanOxyReadings(readings).cleaned : [];

  const spo2Series: [number, number][] = [];
  const hrSeries: [number, number][] = [];

  // Normalize: t' = (t - playStart) / 1000 → seconds since play. Drop any
  // negative-time samples (pre-play oximeter recording).
  for (const r of cleaned) {
    const tSec = (r.t - playStart) / 1000;
    if (tSec < 0) continue;
    if (r.s > 0) spo2Series.push([tSec, r.s]);
    if (r.h > 0) hrSeries.push([tSec, r.h]);
  }

  // Block timeline: cumulative seconds, one entry per block.
  const blocks: DryBlock[] = [];
  let cursor = 0;
  const timeline = session.blockTimeline ?? [];
  for (const b of timeline) {
    blocks.push({
      type: b.type,
      startT: cursor,
      endT: cursor + b.seconds,
      rating: b.rating ?? null,
    });
    cursor += b.seconds;
  }

  // Time-axis bounds: prefer the block timeline (definitive session length).
  // If absent, span the oxy series. Falling back to 0 keeps the chart from
  // crashing on empty data.
  let startT = 0;
  let endT = cursor;
  if (endT === 0 && spo2Series.length > 0) {
    endT = spo2Series[spo2Series.length - 1][0];
  }

  const contractions = (session.contractions ?? [])
    .filter((c) => c.elapsed >= 0)
    .map((c) => ({ t: c.elapsed, holdIdx: c.holdIdx }));

  return {
    spo2Series,
    hrSeries,
    blocks,
    contractions,
    startT,
    endT,
    hasOxy: spo2Series.length >= 2 || hrSeries.length >= 2,
  };
}
