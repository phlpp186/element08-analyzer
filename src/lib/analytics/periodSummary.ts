/**
 * Period summary — single-row roll-up of one Period.
 *
 * Used by the Summary tab in the Compare view. Reuses the matrix
 * builder to compute per-week values, then folds those into totals +
 * peak-week info. Mode mix is computed in its own pass so we know the
 * dry/depth/pool ratio for the mode-mix bar.
 */
import type { ParsedSession } from '../../schema/backup';
import { buildPeriodMatrix } from './periodMatrix';
import type { Period } from './periodCompare';

export interface ModeMix {
  dry: number;
  depth: number;
  pool: number;
}

export interface PeriodSummary {
  period: Period;
  totalSessions: number;
  totalTrainingDays: number;
  totalDryHolds: number;
  totalMinutes: number;
  totalPoolDistance: number;
  /** Deepest single dive across the period. */
  maxDepth: number;
  /** Week offset (negative or 0) with the highest session count. Null
   *  when no sessions fell in the period. */
  peakSessionsWeek: number | null;
  /** Average sessions per week, computed over weeks that had ≥1 session
   *  (training weeks). Null when no weeks had activity. */
  avgSessionsPerActiveWeek: number | null;
  modeMix: ModeMix;
}

export function summarizePeriod(
  sessions: ParsedSession[],
  period: Period,
): PeriodSummary {
  const { rows } = buildPeriodMatrix(sessions, period);

  let totalSessions = 0;
  let totalTrainingDays = 0;
  let totalDryHolds = 0;
  let totalMinutes = 0;
  let totalPoolDistance = 0;
  let maxDepth = 0;
  let peakSessionsWeek: number | null = null;
  let peakSessionsCount = 0;
  let activeWeeks = 0;

  for (const r of rows) {
    totalSessions += r.values.sessions;
    totalTrainingDays += r.values.trainingDays;
    totalDryHolds += r.values.dryHolds;
    totalMinutes += r.values.totalMinutes;
    totalPoolDistance += r.values.poolDistance;
    if (r.values.maxDepth > maxDepth) maxDepth = r.values.maxDepth;
    if (r.values.sessions > peakSessionsCount) {
      peakSessionsCount = r.values.sessions;
      peakSessionsWeek = r.weekOffset;
    }
    if (r.values.sessions > 0) activeWeeks++;
  }

  const avgSessionsPerActiveWeek =
    activeWeeks > 0 ? totalSessions / activeWeeks : null;

  // Mode mix — direct pass over the sessions, scoped to the period.
  const anchor = new Date(period.anchorDate);
  anchor.setHours(0, 0, 0, 0);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - (period.weeksBefore - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const modeMix: ModeMix = { dry: 0, depth: 0, pool: 0 };
  for (const s of sessions) {
    const sd = new Date(s.date);
    if (Number.isNaN(sd.getTime())) continue;
    sd.setHours(0, 0, 0, 0);
    if (sd.getTime() < start.getTime() || sd.getTime() > anchor.getTime()) continue;
    modeMix[s.mode]++;
  }

  return {
    period,
    totalSessions,
    totalTrainingDays,
    totalDryHolds,
    totalMinutes,
    totalPoolDistance,
    maxDepth,
    peakSessionsWeek,
    avgSessionsPerActiveWeek,
    modeMix,
  };
}

export function summarizePeriods(
  sessions: ParsedSession[],
  periods: Period[],
): PeriodSummary[] {
  return periods.map((p) => summarizePeriod(sessions, p));
}
