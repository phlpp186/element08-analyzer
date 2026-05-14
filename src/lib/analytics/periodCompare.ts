/**
 * Period comparison — aligned-to-event aggregation across user-defined
 * training periods.
 *
 * A "Period" is a date range ending at an anchor (typically a competition
 * date) and a fixed lookback in weeks. The aggregator buckets every
 * session inside that window by its "weeks before anchor" offset:
 *
 *   anchor          = period.anchorDate
 *   weekOffset(s)   = floor((anchor.midnight - s.date.midnight) / 7 days)
 *
 * So week 0 = target week, week -1 = the week before, etc. Negative
 * numbering makes the chart x-axis read naturally left-to-right toward
 * the anchor on the right edge.
 *
 * The chart renders one line per period with the same x-axis, so the
 * shape of each season's prep is directly comparable.
 */
import type { ParsedSession } from '../../schema/backup';

export interface Period {
  id: string;
  label: string;
  /** Hex color for chart line + table swatch. */
  color: string;
  /** ISO date string of the anchor (target day / end-of-period). */
  anchorDate: string;
  /** How many weeks BEFORE the anchor to include. */
  weeksBefore: number;
}

export type Metric =
  | 'sessions'
  | 'trainingDays'
  | 'dryHolds'
  | 'totalMinutes'
  | 'poolDistance'
  | 'maxDepth'
  | 'longestHold'
  | 'longestPoolDive';

export interface MetricDef {
  id: Metric;
  label: string;
  /** Short axis suffix, e.g. "sessions", "min", "m". */
  unit: string;
  /** Compute the metric for a single session — null if this metric
   *  doesn't apply to that mode. Aggregated across the bucket by summing
   *  (or maxing — see `aggregate`). */
  perSession: (s: ParsedSession) => number | null;
  /** "sum" | "max" | "uniqueDates" — controls how the bucket is reduced. */
  aggregate: 'sum' | 'max' | 'uniqueDates';
  /** Optional value formatter for axis labels + tooltips. Used by
   *  duration metrics so seconds render as m:ss instead of "185 sec". */
  format?: (v: number) => string;
}

/** Seconds → "m:ss" — for the duration-valued metrics. */
export function fmtMmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Longest single Hold block (seconds) in a dry session, or null. */
function longestHoldInSession(s: ParsedSession): number | null {
  if (s.mode !== 'dry') return null;
  const timeline = (s as unknown as { blockTimeline?: { type: string; seconds: number }[] })
    .blockTimeline;
  if (!timeline) return null;
  let max = 0;
  for (const b of timeline) if (b.type === 'Hold' && b.seconds > max) max = b.seconds;
  return max > 0 ? max : null;
}

/** Longest single dive time (seconds) in a pool session, or null. */
function longestPoolDiveInSession(s: ParsedSession): number | null {
  if (s.mode !== 'pool') return null;
  const dives = (s as unknown as { dives?: { diveTime: number }[] }).dives;
  if (!dives) return null;
  let max = 0;
  for (const d of dives) if (d.diveTime > max) max = d.diveTime;
  return max > 0 ? max : null;
}

export const METRICS: MetricDef[] = [
  {
    id: 'sessions',
    label: 'Sessions per week',
    unit: 'sessions',
    perSession: () => 1,
    aggregate: 'sum',
  },
  {
    id: 'trainingDays',
    label: 'Training days per week',
    unit: 'days',
    perSession: () => 1, // value ignored; aggregate counts unique dates
    aggregate: 'uniqueDates',
  },
  {
    id: 'dryHolds',
    label: 'Dry holds per week',
    unit: 'holds',
    perSession: (s) => (s.mode === 'dry' ? s.cyclesCount : null),
    aggregate: 'sum',
  },
  {
    id: 'totalMinutes',
    label: 'Total session minutes',
    unit: 'min',
    perSession: (s) => parseDurationMinutes(s.duration),
    aggregate: 'sum',
  },
  {
    id: 'poolDistance',
    label: 'Pool distance per week',
    unit: 'm',
    perSession: (s) => (s.mode === 'pool' ? s.totalDistance : null),
    aggregate: 'sum',
  },
  {
    id: 'maxDepth',
    label: 'Deepest dive of the week',
    unit: 'm',
    perSession: (s) => (s.mode === 'depth' ? s.maxDepth : null),
    aggregate: 'max',
  },
  {
    id: 'longestHold',
    label: 'Longest hold of the week',
    unit: 'm:ss',
    // Per-session longest hold, then max across the week → week's longest.
    perSession: longestHoldInSession,
    aggregate: 'max',
    format: fmtMmss,
  },
  {
    id: 'longestPoolDive',
    label: 'Longest pool dive of the week',
    unit: 'm:ss',
    perSession: longestPoolDiveInSession,
    aggregate: 'max',
    format: fmtMmss,
  },
];

export interface AggregatedSeries {
  periodId: string;
  label: string;
  color: string;
  /** Dense array indexed by `i` corresponding to week offset
   *  `-(weeksBefore - 1) + i`. `null` = no sessions that week (gap). */
  points: (number | null)[];
}

/** Build one series per period, all aligned to weeks-before-anchor.
 *  Output length per series = `period.weeksBefore`. */
export function aggregatePeriods(
  sessions: ParsedSession[],
  periods: Period[],
  metricId: Metric,
): { series: AggregatedSeries[]; xLabels: number[] } {
  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0];

  // Decide x-axis range as the longest period's lookback so all series
  // can share one axis. Shorter periods get null-padded on the left.
  const maxWeeks = Math.max(...periods.map((p) => p.weeksBefore), 1);
  const xLabels: number[] = [];
  for (let i = -(maxWeeks - 1); i <= 0; i++) xLabels.push(i);

  const series: AggregatedSeries[] = periods.map((p) => {
    const anchor = startOfDayLocal(new Date(p.anchorDate));
    if (!anchor) {
      return { periodId: p.id, label: p.label, color: p.color, points: xLabels.map(() => null) };
    }
    // Bucket: weekOffset -> { sum/max/dates }
    const buckets = new Map<number, { sum: number; max: number; dates: Set<string> }>();
    for (const s of sessions) {
      const sessionDate = startOfDayLocal(new Date(s.date));
      if (!sessionDate) continue;
      const daysDiff = Math.floor((anchor.getTime() - sessionDate.getTime()) / 86400000);
      if (daysDiff < 0) continue; // session is after the anchor
      const weekOffset = -Math.floor(daysDiff / 7);
      if (weekOffset < -(p.weeksBefore - 1)) continue;

      const v = metric.perSession(s);
      if (v == null) continue;

      const b = buckets.get(weekOffset) ?? { sum: 0, max: 0, dates: new Set() };
      b.sum += v;
      b.max = Math.max(b.max, v);
      b.dates.add(isoDate(sessionDate));
      buckets.set(weekOffset, b);
    }

    // Project bucket map onto the shared x-axis. Pre-period weeks (more
    // distant than this period's weeksBefore) stay null so the line
    // starts at the period's earliest week instead of running off-axis.
    const periodStart = -(p.weeksBefore - 1);
    const points = xLabels.map((wk) => {
      if (wk < periodStart) return null;
      const b = buckets.get(wk);
      if (!b) return 0; // explicit zero — "had this week, did nothing"
      if (metric.aggregate === 'max') return b.max;
      if (metric.aggregate === 'uniqueDates') return b.dates.size;
      return b.sum;
    });

    return { periodId: p.id, label: p.label, color: p.color, points };
  });

  return { series, xLabels };
}

// ── helpers ────────────────────────────────────────────────────────────────

function startOfDayLocal(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "19m 25s" → 19.42. "1h 12m" → 72. Returns 0 on unparseable. */
function parseDurationMinutes(s: string | undefined): number {
  if (!s) return 0;
  let total = 0;
  const hour = /(\d+)\s*h/.exec(s);
  if (hour) total += parseInt(hour[1], 10) * 60;
  const min = /(\d+)\s*m(?!s)/.exec(s); // m but not ms
  if (min) total += parseInt(min[1], 10);
  const sec = /(\d+)\s*s/.exec(s);
  if (sec) total += parseInt(sec[1], 10) / 60;
  return total;
}

/** Suggest one default period covering the user's most recent 12 weeks
 *  ending today. Used as a sensible "give me something to look at" when
 *  the user lands on the compare page with no periods defined. */
export function defaultPeriod(sessions: ParsedSession[]): Period | null {
  if (sessions.length === 0) return null;
  // Anchor on the most recent session (or today, whichever is earlier).
  const latest = sessions
    .map((s) => new Date(s.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latest) return null;
  return {
    id: 'default',
    label: 'Last 12 weeks',
    color: '#4fc3f7',
    anchorDate: isoDate(latest),
    weeksBefore: 12,
  };
}
