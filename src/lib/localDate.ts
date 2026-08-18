/**
 * The user's own calendar day.
 *
 * `new Date().toISOString().slice(0, 10)` is today in UTC, which is a different
 * day from the user's for most of the world for part of every day: still
 * yesterday all morning east of Greenwich, already tomorrow all evening west of
 * it. Anything that answers "what is today" for a person must be built from the
 * local parts (2026-08-18 audit).
 */
export function localIso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayLocalIso(): string {
  return localIso(new Date());
}
