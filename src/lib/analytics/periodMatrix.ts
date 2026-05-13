/**
 * Periodization matrix — one row per week, one column per metric,
 * computed for a single Period.
 *
 * The heatmap view colors each cell by its value's position within the
 * column's range (max of that period for that metric). This makes
 * relative intensity visible at a glance: peak weeks pop out, deload
 * weeks recede.
 *
 * We deliberately keep the same metric set as the overlay chart so users
 * can flip between visualizations without re-learning what each column
 * means.
 */
import type { ParsedSession } from '../../schema/backup';
import { METRICS, type Metric, type Period } from './periodCompare';

export interface MatrixRow {
  /** Negative week offset (0 = target week, -1 = one week before). */
  weekOffset: number;
  /** Display label, e.g. "-12w" or "target". */
  label: string;
  /** Metric -> aggregated value for the week. */
  values: Record<Metric, number>;
  /** True for the row corresponding to week 0 — flagged for highlight. */
  isAnchorWeek: boolean;
}

export interface PeriodMatrix {
  rows: MatrixRow[];
  /** Per-column max across the period — denominator for color scaling. */
  columnMax: Record<Metric, number>;
}

/** Compute every metric for every week of `period` in one pass.
 *  Empty weeks are kept as zero rows so the heatmap renders a continuous
 *  calendar (deload weeks SHOULD be visible as gaps, not omitted).        */
export function buildPeriodMatrix(
  sessions: ParsedSession[],
  period: Period,
): PeriodMatrix {
  const anchor = startOfDayLocal(new Date(period.anchorDate));

  // Initialize one bucket per week.
  type Bucket = {
    sessions: number;
    trainingDays: Set<string>;
    dryHolds: number;
    totalMinutes: number;
    poolDistance: number;
    maxDepth: number;
  };
  const buckets = new Map<number, Bucket>();
  for (let i = -(period.weeksBefore - 1); i <= 0; i++) {
    buckets.set(i, {
      sessions: 0,
      trainingDays: new Set(),
      dryHolds: 0,
      totalMinutes: 0,
      poolDistance: 0,
      maxDepth: 0,
    });
  }

  if (anchor) {
    for (const s of sessions) {
      const sd = startOfDayLocal(new Date(s.date));
      if (!sd) continue;
      const daysDiff = Math.floor((anchor.getTime() - sd.getTime()) / 86400000);
      if (daysDiff < 0) continue;
      const wk = -Math.floor(daysDiff / 7);
      const b = buckets.get(wk);
      if (!b) continue;

      b.sessions++;
      b.trainingDays.add(isoDate(sd));
      if (s.mode === 'dry') b.dryHolds += s.cyclesCount;
      b.totalMinutes += parseDurationMinutes(s.duration);
      if (s.mode === 'pool') b.poolDistance += s.totalDistance;
      if (s.mode === 'depth') b.maxDepth = Math.max(b.maxDepth, s.maxDepth);
    }
  }

  const rows: MatrixRow[] = [];
  for (let i = -(period.weeksBefore - 1); i <= 0; i++) {
    const b = buckets.get(i)!;
    rows.push({
      weekOffset: i,
      label: i === 0 ? 'target' : `${i}w`,
      values: {
        sessions: b.sessions,
        trainingDays: b.trainingDays.size,
        dryHolds: b.dryHolds,
        totalMinutes: Math.round(b.totalMinutes),
        poolDistance: Math.round(b.poolDistance),
        maxDepth: Math.round(b.maxDepth),
      },
      isAnchorWeek: i === 0,
    });
  }

  // Column maxes for color scaling. Force min 1 so we never divide by 0
  // (empty columns render fully cold).
  const columnMax: Record<Metric, number> = {} as Record<Metric, number>;
  for (const m of METRICS) {
    let max = 0;
    for (const r of rows) max = Math.max(max, r.values[m.id]);
    columnMax[m.id] = Math.max(max, 1);
  }

  return { rows, columnMax };
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
