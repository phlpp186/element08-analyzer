/**
 * Lap colours for the pool dive page: the dive's fastest lap green, its
 * slowest amber, the rest between. Shared by the chart's lap bands and the
 * lane strip above it so both read the same. PURE.
 */
import type { ChartTheme } from '../chartTheme';

/** '#rrggbb' between a and b; f = 0 is a. */
function mix(a: string, b: string, f: number): string {
  const ch = (i: number) => {
    const av = parseInt(a.slice(i, i + 2), 16);
    const bv = parseInt(b.slice(i, i + 2), 16);
    return Math.round(av + (bv - av) * f)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

/** One '#rrggbb' per lap. */
export function lapColors(seconds: number[], ct: ChartTheme): string[] {
  let lo = Infinity;
  let hi = 0;
  for (const s of seconds) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return seconds.map((s) => mix(ct.green, ct.amber, hi > lo ? (s - lo) / (hi - lo) : 0));
}

/** Each lap's split: the stored one when there is one per lap, else the
 *  span of its bounds. */
export function lapSplitSeconds(bounds: [number, number][], stored: number[]): number[] {
  return stored.length === bounds.length ? stored : bounds.map(([a, b]) => b - a);
}

/** The laps' start and end on the dive's clock: the stored lap times scaled
 *  to the dive time (manual MM:SS entries need not add up exactly), as the
 *  chart's turn lines are. */
export function lapBounds(lapEndTimes: number[], startT: number, endT: number): [number, number][] {
  const edges = [startT, ...lapEndTimes, endT];
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length - 1; i++) out.push([edges[i], edges[i + 1]]);
  return out;
}
