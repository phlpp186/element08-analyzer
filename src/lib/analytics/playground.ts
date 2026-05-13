/**
 * Playground analytics — filter a session set, group by a time bucket,
 * aggregate by one of several metrics.
 *
 * Deliberately a thin, composable layer that the playground UI drives
 * via a flat `Filters` object. The same primitives could power saved
 * "queries" in a future build.
 */
import type { ParsedSession } from '../../schema/backup';

export type Mode = 'all' | 'dry' | 'depth' | 'pool';
export type GroupBy = 'day' | 'week' | 'month';
export type SessionTag =
  | 'co2_table'
  | 'o2_table'
  | 'comfy'
  | 'pb_attempt'
  | 'recovery';

export interface Filters {
  /** ISO date (inclusive). Null = no lower bound. */
  from: string | null;
  /** ISO date (inclusive). Null = no upper bound. */
  to: string | null;
  mode: Mode;
  /** When empty, no filter applied (all tags accepted). */
  sessionTags: SessionTag[];
  /** Dry-mode-only filter. Ignored unless mode === 'dry' or 'all'. */
  lungVols: ('FL' | 'FRC' | 'RV')[];
}

export type Metric =
  | 'sessions'
  | 'trainingDays'
  | 'totalMinutes'
  | 'dryHolds'
  | 'poolDistance'
  | 'maxDepth';

export interface MetricDef {
  id: Metric;
  label: string;
  unit: string;
  perSession: (s: ParsedSession) => number | null;
  aggregate: 'sum' | 'max' | 'uniqueDates';
}

export const PLAYGROUND_METRICS: MetricDef[] = [
  { id: 'sessions',     label: 'Sessions',         unit: 'sessions', perSession: () => 1, aggregate: 'sum' },
  { id: 'trainingDays', label: 'Training days',    unit: 'days',     perSession: () => 1, aggregate: 'uniqueDates' },
  { id: 'totalMinutes', label: 'Total minutes',    unit: 'min',      perSession: (s) => parseDurationMinutes(s.duration), aggregate: 'sum' },
  { id: 'dryHolds',     label: 'Dry holds',        unit: 'holds',    perSession: (s) => (s.mode === 'dry' ? s.cyclesCount : null), aggregate: 'sum' },
  { id: 'poolDistance', label: 'Pool distance',    unit: 'm',        perSession: (s) => (s.mode === 'pool' ? s.totalDistance : null), aggregate: 'sum' },
  { id: 'maxDepth',     label: 'Deepest dive',     unit: 'm',        perSession: (s) => (s.mode === 'depth' ? s.maxDepth : null), aggregate: 'max' },
];

// ── Filter ─────────────────────────────────────────────────────────────────

export function applyFilters(
  sessions: ParsedSession[],
  filters: Filters,
): ParsedSession[] {
  const from = filters.from ? startOfDayLocal(new Date(filters.from)) : null;
  const to = filters.to ? endOfDayLocal(new Date(filters.to)) : null;

  return sessions.filter((s) => {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (filters.mode !== 'all' && s.mode !== filters.mode) return false;
    if (filters.sessionTags.length > 0 && (s.sessionTag == null || !filters.sessionTags.includes(s.sessionTag as SessionTag))) {
      return false;
    }
    if (filters.lungVols.length > 0) {
      // Lung volume is meaningful for dry sessions (session-level) and
      // for individual pool dives. We filter at session-level so this is
      // primarily a dry-session filter; pool/depth sessions are dropped
      // when this filter is engaged.
      if (s.mode !== 'dry') return false;
      const lv = (s as { lungVol?: string | null }).lungVol;
      if (!lv || !filters.lungVols.includes(lv as 'FL' | 'FRC' | 'RV')) {
        return false;
      }
    }
    return true;
  });
}

// ── Group + aggregate ──────────────────────────────────────────────────────

export interface GroupedBucket {
  /** ISO date — the START of the bucket (Monday for week, 1st for month). */
  key: string;
  /** Display label for the x-axis ("Mon 13 May" / "Wk 19" / "May 2026"). */
  label: string;
  /** Aggregated metric value. 0 if no contributing sessions. */
  value: number;
}

export function aggregate(
  sessions: ParsedSession[],
  groupBy: GroupBy,
  metricId: Metric,
): GroupedBucket[] {
  const metric = PLAYGROUND_METRICS.find((m) => m.id === metricId) ?? PLAYGROUND_METRICS[0];

  // Bucket label key → { sum, max, dates }
  const buckets = new Map<string, { sum: number; max: number; dates: Set<string>; label: string }>();

  for (const s of sessions) {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) continue;
    const bucketStart = bucketDate(d, groupBy);
    const key = isoDate(bucketStart);

    const v = metric.perSession(s);
    if (v == null) continue;

    const existing = buckets.get(key) ?? { sum: 0, max: 0, dates: new Set<string>(), label: formatBucketLabel(bucketStart, groupBy) };
    existing.sum += v;
    existing.max = Math.max(existing.max, v);
    existing.dates.add(isoDate(d));
    buckets.set(key, existing);
  }

  const keys = Array.from(buckets.keys()).sort();
  return keys.map((k) => {
    const b = buckets.get(k)!;
    const value = metric.aggregate === 'max' ? b.max
      : metric.aggregate === 'uniqueDates' ? b.dates.size
      : b.sum;
    return { key: k, label: b.label, value };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function bucketDate(d: Date, groupBy: GroupBy): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  if (groupBy === 'day') return copy;
  if (groupBy === 'week') {
    // ISO week starts Monday. Day-of-week 0 = Sunday in JS; map to 7.
    const dow = copy.getDay() === 0 ? 7 : copy.getDay();
    copy.setDate(copy.getDate() - (dow - 1));
    return copy;
  }
  // month
  copy.setDate(1);
  return copy;
}

function formatBucketLabel(d: Date, groupBy: GroupBy): string {
  if (groupBy === 'day') {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  if (groupBy === 'week') {
    // ISO week number, approximate (matches the user's region for most cases)
    return `Wk ${getIsoWeek(d)} '${String(d.getFullYear()).slice(2)}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function getIsoWeek(d: Date): number {
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function startOfDayLocal(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDayLocal(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDurationMinutes(s: string | undefined): number {
  if (!s) return 0;
  let total = 0;
  const hour = /(\d+)\s*h/.exec(s);
  if (hour) total += parseInt(hour[1], 10) * 60;
  const min = /(\d+)\s*m(?!s)/.exec(s);
  if (min) total += parseInt(min[1], 10);
  const sec = /(\d+)\s*s/.exec(s);
  if (sec) total += parseInt(sec[1], 10) / 60;
  return total;
}
