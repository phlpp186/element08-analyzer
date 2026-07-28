/**
 * Non-spread min/max. `Math.max(...arr)` / `Math.min(...arr)` overflow the call
 * stack once `arr` has tens of thousands of elements (e.g. all profile points
 * across thousands of dives), and are risky even at a few thousand. These loop
 * instead, so they're safe at any size.
 *
 *   maxOf(arr)        ≡ Math.max(...arr)        (-Infinity when empty)
 *   maxOf(arr, 1)     ≡ Math.max(...arr, 1)     (floor of 1)
 *   maxOf(arr, 60)    ≡ Math.max(60, ...arr)
 *   minOf(arr)        ≡ Math.min(...arr)        (Infinity when empty)
 *   minOf(arr, 0)     ≡ Math.min(...arr, 0)
 */
export function maxOf(values: number[], floor = -Infinity): number {
  let m = floor;
  for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

export function minOf(values: number[], ceil = Infinity): number {
  let m = ceil;
  for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

/**
 * Evenly thin `arr` down to at most `maxN` items, preserving order and always
 * keeping the first and last element. Used by per-dive charts: rendering one
 * SVG node per dive freezes at thousands of dives, but a ~280px-wide plot can
 * only show ~280 distinct x-positions anyway, so a uniform sample across the
 * FULL history is visually identical to drawing every dot while spanning the
 * whole date range (unlike a tail slice, which hides the early career).
 *
 *   strideSample([a,b,c,d], 10) → [a,b,c,d]   (already under the cap)
 *   strideSample(0..999, 100)   → 100 evenly spaced values incl. 0 and 999
 */
export function strideSample<T>(arr: T[], maxN: number): T[] {
  if (maxN <= 0) return [];
  if (arr.length <= maxN) return arr;
  const stride = arr.length / maxN;
  const out: T[] = [];
  for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * stride)]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
