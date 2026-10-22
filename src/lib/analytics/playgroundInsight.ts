/**
 * The Playground's answer line and its "compared with" period (Philipp's
 * options A + C, 2026-10-22). PURE: the facts only; the page words them.
 *
 *   - lead:   categories, highest bar vs the runner-up
 *   - trend:  ordered groups (dates, numbers), first bar vs last
 *   - most:   counting, the biggest bar
 *   - change: with a comparison, the bar that moved most
 *   - spread: histogram, where the middle half sits
 *   - cell:   heatmap, the highest cell
 */
import type { PivotBucket } from './playgroundPivot';

export type Takeaway =
  | { kind: 'lead'; top: string; value: number; second: string; diff: number }
  | { kind: 'trend'; first: string; last: string; from: number; to: number }
  | { kind: 'most'; top: string; n: number }
  | { kind: 'change'; bucket: string; then: number; now: number }
  | { kind: 'spread'; q1: number; q3: number }
  | { kind: 'cell'; x: string; y: string; value: number };

/** Value at fraction p of sorted points, interpolated. */
export function quantile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** The headline for bars (and box plots, whose value is the median). */
export function bucketTakeaway(
  buckets: PivotBucket[],
  opts: { ordered: boolean; counting: boolean; value?: (b: PivotBucket) => number },
): Takeaway | null {
  if (buckets.length === 0) return null;
  const val = opts.value ?? ((b: PivotBucket) => b.value);
  if (opts.counting) {
    let top = buckets[0];
    for (const b of buckets) if (b.n > top.n) top = b;
    return { kind: 'most', top: top.label, n: top.n };
  }
  if (buckets.length < 2) return null;
  if (opts.ordered) {
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    return { kind: 'trend', first: first.label, last: last.label, from: val(first), to: val(last) };
  }
  const sorted = [...buckets].sort((a, b) => val(b) - val(a));
  return {
    kind: 'lead',
    top: sorted[0].label,
    value: val(sorted[0]),
    second: sorted[1].label,
    diff: val(sorted[0]) - val(sorted[1]),
  };
}

/** The bar that moved most between the compared period and now. */
export function changeTakeaway(now: PivotBucket[], then: PivotBucket[]): Takeaway | null {
  const before = new Map(then.map((b) => [b.key, b.value] as const));
  let best: Takeaway | null = null;
  let bestAbs = -1;
  for (const b of now) {
    const v = before.get(b.key);
    if (v == null) continue;
    const abs = Math.abs(b.value - v);
    if (abs > bestAbs) {
      bestAbs = abs;
      best = { kind: 'change', bucket: b.label, then: v, now: b.value };
    }
  }
  return best;
}

export function spreadTakeaway(buckets: PivotBucket[]): Takeaway | null {
  const all = buckets.flatMap((b) => b.points).sort((a, b) => a - b);
  if (all.length < 4) return null;
  return { kind: 'spread', q1: quantile(all, 0.25), q3: quantile(all, 0.75) };
}

// ── The compared period ─────────────────────────────────────────────────────

export type CompareWith = 'none' | 'prev' | 'year';

function shiftIso(iso: string, days: number, years = 0): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y + years, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** The earlier range to compare [from, to] with (ISO days, inclusive), or
 *  null without a closed range. 'prev' is the same length right before it,
 *  'year' the same dates a year earlier. */
export function compareRange(
  from: string | null,
  to: string | null,
  how: CompareWith,
): { from: string; to: string } | null {
  if (how === 'none' || !from || !to || from > to) return null;
  if (how === 'year') return { from: shiftIso(from, 0, -1), to: shiftIso(to, 0, -1) };
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1;
  return { from: shiftIso(from, -days), to: shiftIso(from, -1) };
}
