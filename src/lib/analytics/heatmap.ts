/**
 * Training-days heatmap — per-day session counts across the past N days.
 *
 * The mobile app shows a 12-week (84-day) heatmap on the Balance tab.
 * The analyzer takes advantage of the larger canvas and renders a full
 * 365-day grid by default — visually a year-at-a-glance like GitHub's
 * contribution heatmap.
 *
 * Output is a dense day-by-day series so the chart renderer doesn't have
 * to fill gaps. Date keys are local-day ISO strings (YYYY-MM-DD).
 */
import type { ParsedSession } from '../../schema/backup';

export interface HeatmapDay {
  /** ISO date YYYY-MM-DD (local). */
  date: string;
  /** Sessions completed that day across all modes. */
  count: number;
}

/** Returns a date → count map AND a dense day-by-day series spanning
 *  `days` ending today. The series is what the heatmap renders; the map
 *  is useful for any lookup logic the caller wants. */
export function trainingDaysHeatmap(
  sessions: ParsedSession[],
  days = 365,
): { series: HeatmapDay[]; map: Map<string, number> } {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const key = isoDateLocal(new Date(s.date));
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const series: HeatmapDay[] = [];
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = isoDateLocal(d);
    series.push({ date: key, count: map.get(key) ?? 0 });
  }
  return { series, map };
}

function isoDateLocal(d: Date): string {
  // YYYY-MM-DD in the user's LOCAL timezone — not UTC. A session at
  // 23:30 local on Monday should land on Monday's heatmap cell, not
  // Tuesday's. (toISOString uses UTC; we deliberately don't.)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
