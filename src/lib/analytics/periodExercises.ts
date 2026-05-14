/**
 * Exercise-level extraction for the Compare → Exercises scatter.
 *
 * Unlike the Overlay/Periodization/Summary tabs (which aggregate per
 * week), this returns ONE point per individual hold or dive — the raw
 * training-log granularity.
 *
 * Disciplines are grouped by what they MEASURE, not by app mode:
 *
 *   'breathhold' → time-measured efforts:
 *        dry-session Hold blocks (source 'dry')
 *        pool STA dives          (source 'pool-sta')
 *      Both plotted on a seconds y-axis, colour-distinguished.
 *
 *   'depth'      → depth-measured: depth dives, max depth in metres.
 *
 *   'pool'       → distance-measured: pool DYN / DYNB / DNF / other
 *      dives that have a recorded distance. STA is excluded here — it
 *      lives in 'breathhold' since mixing seconds and metres on one
 *      y-axis is meaningless.
 *
 * All holds/dives of a session share the session date as x — they
 * separate on the y axis, so a day with three efforts shows three dots
 * stacked at that day's column.
 */
import type { ParsedSession } from '../../schema/backup';
import type { Period } from './periodCompare';
import { includeDive } from './diveFilter';

export type ExerciseMode = 'breathhold' | 'depth' | 'pool';

/** Which discipline family a point came from — drives its colour. */
export type ExerciseSource = 'dry' | 'pool-sta' | 'depth' | 'pool';

export interface ExercisePoint {
  /** Session date as epoch ms — the scatter's x coordinate. */
  dateMs: number;
  /** y coordinate. breathhold: seconds · depth/pool: metres. */
  value: number;
  /** 1-based index within its session (Hold # / Dive #) for the tooltip. */
  indexInSession: number;
  sessionId: number;
  sessionName: string;
  source: ExerciseSource;
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
  diveType?: string | null;
}
interface PoolDiveLite {
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';
  diveTime: number;
  distance: number | null;
  diveType?: string | null;
}

export function extractExercises(
  sessions: ParsedSession[],
  period: Period,
  mode: ExerciseMode,
): ExerciseScatterData {
  const anchor = startOfDayLocal(new Date(period.anchorDate));
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
    const sd = startOfDayLocal(new Date(s.date));
    if (!sd) continue;
    const daysDiff = Math.floor((anchor.getTime() - sd.getTime()) / 86400000);
    if (daysDiff < 0 || daysDiff >= period.weeksBefore * 7) continue;

    const dateMs = sd.getTime();
    const sessionName = s.name || sessionFallbackName(s.mode);

    if (mode === 'breathhold') {
      // Dry-session Hold blocks.
      if (s.mode === 'dry') {
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
              source: 'dry',
            });
          }
        }
      }
      // Pool STA dives — time-measured, belong with the breath holds.
      if (s.mode === 'pool') {
        const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
        dives.forEach((d, i) => {
          if (!includeDive(d.diveType)) return;
          if (d.discipline === 'STA' && d.diveTime > 0) {
            points.push({
              dateMs,
              value: d.diveTime,
              indexInSession: i + 1,
              sessionId: s.id,
              sessionName,
              source: 'pool-sta',
            });
          }
        });
      }
    } else if (mode === 'depth') {
      if (s.mode !== 'depth') continue;
      const dives = (s as unknown as { dives?: DepthDiveLite[] }).dives ?? [];
      dives.forEach((d, i) => {
        // Skip warmup / safety / excluded — they don't represent a real
        // training effort. Matches the app's Insights default.
        if (!includeDive(d.diveType)) return;
        if (d.depth > 0) {
          points.push({
            dateMs,
            value: d.depth,
            indexInSession: i + 1,
            sessionId: s.id,
            sessionName,
            source: 'depth',
          });
        }
      });
    } else {
      // pool — distance-measured disciplines only (STA excluded).
      if (s.mode !== 'pool') continue;
      const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
      dives.forEach((d, i) => {
        if (!includeDive(d.diveType)) return;
        if (d.discipline !== 'STA' && d.distance != null && d.distance > 0) {
          points.push({
            dateMs,
            value: d.distance,
            indexInSession: i + 1,
            sessionId: s.id,
            sessionName,
            source: 'pool',
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
