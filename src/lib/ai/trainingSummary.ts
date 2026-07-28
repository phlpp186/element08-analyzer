/**
 * get_training_summary — the Balance-tab view of training, as a tool.
 *
 * Aggregates SESSIONS (not dives): per-week session counts, distinct days
 * trained, mode mix, dive-type (intensity) mix, and — when an active plan is
 * supplied — season/plan adherence with the exact semantics of the Insights
 * Balance tab (completed weeks only, actual/target sessions, capped at 100%).
 *
 * The plan and today's date arrive via ToolContext (the Ask screen wires them
 * from usePlanStore/settings), keeping this module pure: no store imports, no
 * Date.now(). Answers "how consistent was my training", "how many days did I
 * train in June", "am I on track with my plan".
 *
 * Pure, no RN imports (runs in app / Deno / browser).
 */
import type { Session } from './appTypes';

// Structural plan shape (matches Plan/SeasonPlan from the plan store without
// importing it — the tool only reads these fields).
export interface PlanWeekLike {
  weekStart: string;
  targetSessions: number;
}
export interface PlanPhaseLike {
  name?: string;
  type?: string;
  weeks: PlanWeekLike[];
}
export interface PlanLike {
  name: string;
  kind?: string;
  phases: PlanPhaseLike[];
}

/** App-side context the client wires in; never supplied by the model. */
export interface ToolContext {
  /** Local ISO date (YYYY-MM-DD). Needed for plan adherence + "this week". */
  todayIso?: string;
  /** First day of week for the weekly buckets (0=Sun, 1=Mon). Default 1. */
  weekStartsOn?: 0 | 1;
  /** The user's active training/season plan, if any. */
  plan?: PlanLike | null;
  /** IANA timezone of the device (e.g. "Asia/Manila"). Lets the model present
   *  the UTC-stored dive timestamps in the user's local time. */
  tz?: string;
}

export interface TrainingSummarySpec {
  /** ISO date (inclusive) — filters the session date. */
  date_from?: string;
  date_to?: string;
}

interface WeekBucket {
  week_start: string;
  sessions: number;
  days_trained: number;
  by_mode: Record<string, number>;
}

export interface TrainingSummaryResult {
  from: string | null;
  to: string | null;
  totals: {
    sessions: number;
    days_trained: number;
    by_mode: Record<string, number>;
    /** Dive-type mix across depth + pool dives (intensity proxy). */
    dives_by_type: Record<string, number>;
  };
  weeks: WeekBucket[];
  plan: {
    name: string;
    kind: string;
    total_weeks: number;
    current_week: number | null;
    current_phase: string | null;
    /** Sessions done vs targeted across COMPLETED plan weeks, capped at 100. */
    adherence_pct: number | null;
    target_sessions_completed_weeks: number;
    actual_sessions_completed_weeks: number;
  } | null;
  notes: string[];
}

const MAX_WEEKS = 26;

/** Monday-of-week (or Sunday, per setting) for an ISO date, UTC-safe. */
function weekStartIso(dateIso: string, weekStartsOn: 0 | 1): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function trainingSummary(
  sessions: Session[],
  spec: TrainingSummarySpec,
  ctx: ToolContext = {},
): TrainingSummaryResult {
  const notes: string[] = [];
  const ws: 0 | 1 = ctx.weekStartsOn ?? 1;

  let rows = sessions.filter((s) => !!s.date);
  if (spec.date_from) rows = rows.filter((s) => s.date.slice(0, 10) >= spec.date_from!);
  if (spec.date_to) rows = rows.filter((s) => s.date.slice(0, 10) <= spec.date_to!);
  rows = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));

  // ── Totals + weekly buckets ────────────────────────────────────────────────
  const by_mode: Record<string, number> = {};
  const dives_by_type: Record<string, number> = {};
  const allDays = new Set<string>();
  const buckets = new Map<
    string,
    { days: Set<string>; sessions: number; by_mode: Record<string, number> }
  >();

  for (const s of rows) {
    const day = s.date.slice(0, 10);
    allDays.add(day);
    bump(by_mode, s.mode);
    if (s.mode === 'depth' || s.mode === 'pool') {
      for (const d of s.dives)
        bump(dives_by_type, (d as { diveType?: string }).diveType ?? 'unlabeled');
    }
    const wk = weekStartIso(day, ws);
    let b = buckets.get(wk);
    if (!b) {
      b = { days: new Set(), sessions: 0, by_mode: {} };
      buckets.set(wk, b);
    }
    b.sessions++;
    b.days.add(day);
    bump(b.by_mode, s.mode);
  }

  let weeks: WeekBucket[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week_start, b]) => ({
      week_start,
      sessions: b.sessions,
      days_trained: b.days.size,
      by_mode: b.by_mode,
    }));
  if (weeks.length > MAX_WEEKS) {
    notes.push(
      `Showing the most recent ${MAX_WEEKS} of ${weeks.length} weeks — narrow the date range for older ones.`,
    );
    weeks = weeks.slice(-MAX_WEEKS);
  }

  // ── Plan adherence (Balance-tab semantics) ─────────────────────────────────
  // Only COMPLETED plan weeks count (week end <= today); actual sessions in
  // each week vs its target, percentage capped at 100. Plan weeks are always
  // Monday-anchored regardless of the weekly-bucket setting above.
  let plan: TrainingSummaryResult['plan'] = null;
  if (ctx.plan && ctx.plan.phases?.length) {
    const today = ctx.todayIso?.slice(0, 10) ?? null;
    let totalWeeks = 0;
    let currentWeek: number | null = null;
    let currentPhase: string | null = null;
    let targetTotal = 0;
    let actualTotal = 0;
    let completedWeeks = 0;

    for (const phase of ctx.plan.phases) {
      for (const week of phase.weeks) {
        totalWeeks++;
        const weekEnd = addDaysIso(week.weekStart, 7);
        if (today && week.weekStart <= today && today < weekEnd) {
          currentWeek = totalWeeks;
          currentPhase = phase.name ?? phase.type ?? null;
        }
        if (today && weekEnd <= today) {
          completedWeeks++;
          targetTotal += week.targetSessions;
          actualTotal += sessions.filter((s) => {
            const d = s.date?.slice(0, 10);
            return !!d && d >= week.weekStart && d < weekEnd;
          }).length;
        }
      }
    }

    plan = {
      name: ctx.plan.name,
      kind: ctx.plan.kind ?? 'season',
      total_weeks: totalWeeks,
      current_week: currentWeek,
      current_phase: currentPhase,
      adherence_pct:
        completedWeeks > 0 && targetTotal > 0
          ? Math.min(100, Math.round((actualTotal / targetTotal) * 100))
          : null,
      target_sessions_completed_weeks: targetTotal,
      actual_sessions_completed_weeks: actualTotal,
    };
    if (!today)
      notes.push('No current date supplied — plan adherence and current week unavailable.');
  }

  return {
    from: rows.length ? rows[0].date.slice(0, 10) : null,
    to: rows.length ? rows[rows.length - 1].date.slice(0, 10) : null,
    totals: {
      sessions: rows.length,
      days_trained: allDays.size,
      by_mode,
      dives_by_type,
    },
    weeks,
    plan,
    notes,
  };
}

export const TRAINING_SUMMARY_TOOL = {
  name: 'get_training_summary',
  description:
    'Training balance and consistency over a date range: sessions and distinct days trained per ' +
    'week, mode mix (depth/pool/dry), dive-type (intensity) mix, and — when the user has an ' +
    'active plan — season/plan adherence (sessions done vs targeted over completed plan weeks). ' +
    'Use for "how consistent was my training", "how many days did I train", "am I on track with ' +
    'my plan". Aggregates whole sessions; use query_dives for per-dive metrics.',
  input_schema: {
    type: 'object',
    properties: {
      date_from: { type: 'string', description: 'ISO date, inclusive.' },
      date_to: { type: 'string', description: 'ISO date, inclusive.' },
    },
  },
} as const;
