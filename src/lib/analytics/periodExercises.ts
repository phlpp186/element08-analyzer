/**
 * Exercise-level extraction for the Compare → Exercises scatter.
 *
 * Unlike the Overlay/Periodization/Summary tabs (which aggregate per
 * week), this returns ONE point per individual hold or dive — the raw
 * training-log granularity. Each point carries the session's date as its
 * x coordinate and a mode-specific performance value as its y:
 *
 *   dry   → each Hold block's duration (seconds)
 *   depth → each dive's max depth (metres)
 *   pool  → each dive's dive time (seconds)
 *
 * All holds/dives of a session share the session date as x — they
 * separate on the y axis, so a day with three holds shows three dots
 * stacked at that day's column.
 */
import type { ParsedSession } from '../../schema/backup';
import type { Period } from './periodCompare';

export type ExerciseMode = 'dry' | 'depth' | 'pool';

export interface ExercisePoint {
  /** Session date as epoch ms — the scatter's x coordinate. */
  dateMs: number;
  /** Mode-specific performance value — the y coordinate.
   *  dry: hold seconds · depth: metres · pool: dive seconds. */
  value: number;
  /** 1-based index within its session (Hold # / Dive #) for the tooltip. */
  indexInSession: number;
  sessionId: number;
  sessionName: string;
}

export interface ExerciseScatterData {
  points: ExercisePoint[];
  /** Period window bounds (epoch ms) so the x-axis spans the whole period
   *  even when training is sparse. */
  periodStartMs: number;
  periodEndMs: number;
}

interface BlockEntry {
  type: 'Rest' | 'Hold' | 'Recover';
  seconds: number;
}
interface DepthDiveLite {
  depth: number;
}
interface PoolDiveLite {
  diveTime: number;
}

export function extractExercises(
  sessions: ParsedSession[],
  period: Period,
  mode: ExerciseMode,
): ExerciseScatterData {
  const anchor = startOfDayLocal(new Date(period.anchorDate));
  // Fallback window if the anchor date is unparseable — empty result.
  if (!anchor) {
    const now = Date.now();
    return { points: [], periodStartMs: now, periodEndMs: now };
  }

  const periodEndMs = anchor.getTime();
  const periodStart = new Date(anchor);
  periodStart.setDate(anchor.getDate() - (period.weeksBefore * 7 - 1));
  const periodStartMs = periodStart.getTime();

  const points: ExercisePoint[] = [];

  for (const s of sessions) {
    if (s.mode !== mode) continue;
    const sd = startOfDayLocal(new Date(s.date));
    if (!sd) continue;
    const daysDiff = Math.floor((anchor.getTime() - sd.getTime()) / 86400000);
    // In range: on or before the anchor, within `weeksBefore` weeks of it.
    if (daysDiff < 0 || daysDiff >= period.weeksBefore * 7) continue;

    const dateMs = sd.getTime();
    const sessionName = s.name || sessionFallbackName(s.mode);

    if (s.mode === 'dry') {
      // One point per Hold block in the timeline.
      const timeline = (s as unknown as { blockTimeline?: BlockEntry[] }).blockTimeline ?? [];
      let holdIdx = 0;
      for (const b of timeline) {
        if (b.type !== 'Hold') continue;
        holdIdx++;
        if (b.seconds > 0) {
          points.push({
            dateMs,
            value: b.seconds,
            indexInSession: holdIdx,
            sessionId: s.id,
            sessionName,
          });
        }
      }
    } else if (s.mode === 'depth') {
      const dives = (s as unknown as { dives?: DepthDiveLite[] }).dives ?? [];
      dives.forEach((d, i) => {
        if (d.depth > 0) {
          points.push({
            dateMs,
            value: d.depth,
            indexInSession: i + 1,
            sessionId: s.id,
            sessionName,
          });
        }
      });
    } else {
      // pool
      const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
      dives.forEach((d, i) => {
        if (d.diveTime > 0) {
          points.push({
            dateMs,
            value: d.diveTime,
            indexInSession: i + 1,
            sessionId: s.id,
            sessionName,
          });
        }
      });
    }
  }

  return { points, periodStartMs, periodEndMs };
}

function sessionFallbackName(mode: string): string {
  return mode === 'dry' ? 'Dry session' : mode === 'depth' ? 'Depth session' : 'Pool session';
}

function startOfDayLocal(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
