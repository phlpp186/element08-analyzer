/**
 * The calendar day a session BELONGS TO, from the diver's point of view.
 *
 * A `Session.date` is a full UTC timestamp, and the shortcut for its day was
 * `date.slice(0, 10)` — which is its day in UTC, not the diver's. Here in UTC+8
 * a 07:00 pool session is stored on the previous UTC day, so the logbook (which
 * renders the timestamp locally, and is right) said the 18th while grouping,
 * "sessions per day", the AI's date filters and the streak counter all said the
 * 17th. One session, two days, depending on which code looked at it.
 *
 * The AI tools carry an explicit `tz` from the caller — use it when present, so
 * a tool answers in the same zone the model was told "today" in. Everything
 * else runs on the device the diver is holding, where local IS their day.
 *
 * Pure: no RN imports (this runs in the app, the analyzer and Deno).
 */

/** Local YYYY-MM-DD of a Date, built from local parts (never toISOString). */
export function localDayOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * The diver's calendar day for a stored session timestamp.
 *
 * `tz` (an IANA name) pins the answer to a specific zone; without it the
 * device's own zone is used. An unparseable date falls back to the raw first
 * ten characters, which is what every caller used to do unconditionally — a
 * malformed row should not throw inside a chart.
 */
// Building an Intl.DateTimeFormat costs real time, and this runs once per row
// per query over thousands of dives. One formatter per zone, kept.
const FMT_BY_TZ = new Map<string, Intl.DateTimeFormat | null>();

function fmtFor(tz: string): Intl.DateTimeFormat | null {
  const hit = FMT_BY_TZ.get(tz);
  if (hit !== undefined) return hit;
  let f: Intl.DateTimeFormat | null = null;
  try {
    // en-CA formats as YYYY-MM-DD, which is the shape we want back.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    f = null; // an unknown zone name: remembered, so we try it only once
  }
  FMT_BY_TZ.set(tz, f);
  return f;
}

/** Today, on the user's own calendar (never the UTC date). */
export function todayLocalIso(): string {
  return localDayOf(new Date());
}

export function sessionDay(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const f = tz ? fmtFor(tz) : null;
  return f ? f.format(d) : localDayOf(d);
}
