/**
 * Balance-tab analytics — training-mix views over the whole backup.
 *
 *   - sessionTagDistribution: how the user's tagged sessions split across
 *     the five session tags. Untagged sessions are excluded so the chart
 *     reflects deliberate planning, not raw volume (matches the app).
 *   - effortDistribution: count of sessions per 1-5 self-rated effort.
 *   - weeklyVolume: total session minutes per week over a recent window.
 */
import type { ParsedSession } from '../../schema/backup';

type SessionTag = 'co2_table' | 'o2_table' | 'comfy' | 'pb_attempt' | 'recovery';

const TAG_ORDER: { tag: SessionTag; label: string }[] = [
  { tag: 'co2_table', label: 'CO₂ Table' },
  { tag: 'o2_table', label: 'O₂ Table' },
  { tag: 'comfy', label: 'Comfy' },
  { tag: 'pb_attempt', label: 'PB Attempt' },
  { tag: 'recovery', label: 'Recovery' },
];

export interface TagCount {
  tag: SessionTag;
  label: string;
  count: number;
}

/** Count of tagged sessions per session tag, in a fixed order. Untagged
 *  sessions are skipped. Empty array when nothing is tagged at all. */
export function sessionTagDistribution(sessions: ParsedSession[]): TagCount[] {
  const counts = new Map<SessionTag, number>();
  for (const s of sessions) {
    const tag = s.sessionTag;
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  return TAG_ORDER.map(({ tag, label }) => ({ tag, label, count: counts.get(tag) ?? 0 }));
}

export interface EffortCount {
  rating: 1 | 2 | 3 | 4 | 5;
  count: number;
}

/** Count of sessions per 1-5 effort rating. Unrated sessions are skipped.
 *  Empty array when nothing is rated. */
export function effortDistribution(sessions: ParsedSession[]): EffortCount[] {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let any = false;
  for (const s of sessions) {
    const r = s.rating;
    if (r != null && r >= 1 && r <= 5) {
      counts[r]++;
      any = true;
    }
  }
  if (!any) return [];
  return ([1, 2, 3, 4, 5] as const).map((rating) => ({ rating, count: counts[rating] }));
}

export interface WeekVolume {
  /** Monday of the week, ISO YYYY-MM-DD (local). */
  weekStart: string;
  minutes: number;
  sessions: number;
}

/** Total session minutes per week over the last `weeks` weeks ending this
 *  week. Dense — weeks with no training are included as zeros. */
export function weeklyVolume(sessions: ParsedSession[], weeks = 26): WeekVolume[] {
  const byWeek = new Map<string, { minutes: number; sessions: number }>();
  for (const s of sessions) {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = isoLocal(startOfWeek(d));
    const bucket = byWeek.get(key) ?? { minutes: 0, sessions: 0 };
    bucket.minutes += parseDurationMinutes(s.duration);
    bucket.sessions += 1;
    byWeek.set(key, bucket);
  }

  const thisWeekStart = startOfWeek(new Date());
  const series: WeekVolume[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeekStart);
    d.setDate(d.getDate() - i * 7);
    const key = isoLocal(d);
    const b = byWeek.get(key);
    series.push({ weekStart: key, minutes: b?.minutes ?? 0, sessions: b?.sessions ?? 0 });
  }
  return series;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Monday 00:00 (local) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const daysSinceMonday = (copy.getDay() + 6) % 7; // getDay: 0=Sun..6=Sat
  copy.setDate(copy.getDate() - daysSinceMonday);
  return copy;
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "1h 12m" → 72, "19m 25s" → 19.42. Returns 0 on unparseable input. */
function parseDurationMinutes(s: string | undefined): number {
  if (!s) return 0;
  let total = 0;
  const hour = /(\d+)\s*h/.exec(s);
  if (hour) total += parseInt(hour[1], 10) * 60;
  const min = /(\d+)\s*m(?!s)/.exec(s); // m, but not ms
  if (min) total += parseInt(min[1], 10);
  const sec = /(\d+)\s*s/.exec(s);
  if (sec) total += parseInt(sec[1], 10) / 60;
  return total;
}
