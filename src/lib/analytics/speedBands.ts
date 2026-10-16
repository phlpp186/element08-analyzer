/**
 * speedBands: per-depth-band pacing for one dive, the analyzer's take on the
 * app's depth pills: for each 5 / 10 / 20 m band, the average vertical speed
 * and the time spent inside the band, split into descent and ascent.
 *
 * Honest numbers, matching the app's band conventions:
 *   - Hang segments are EXCLUDED: a pause at 30 m must not make the
 *     25–30 m band look slow.
 *   - The dive splits into descent/ascent at its deepest sample.
 *   - Speed = vertical metres actually covered inside the band ÷ time in
 *     band (so kick-glide oscillation doesn't fake extra speed).
 *   - The last band is partial ("30–32m") when the dive doesn't fill it.
 */
import type { DepthDiveData, HangSegment } from './diveProfile';

export type BandSize = 5 | 10 | 20;

export interface PhaseAgg {
  time: number;
  dist: number;
}

export interface BandRow {
  lo: number;
  hi: number;
  desc: PhaseAgg;
  asc: PhaseAgg;
}

export function computeBands(data: DepthDiveData, size: BandSize): BandRow[] {
  const points = data.points;
  if (points.length < 2 || data.maxDepth <= 0) return [];

  // Deepest sample = descent/ascent split.
  let splitT = points[0].t;
  let deepest = -Infinity;
  for (const p of points) {
    if (p.d > deepest) {
      deepest = p.d;
      splitT = p.t;
    }
  }

  const hangs = data.hangs as HangSegment[];
  const inHang = (tm: number) => hangs.some((h) => tm >= h.startT && tm <= h.endT);

  const bands: BandRow[] = [];
  for (let lo = 0; lo < data.maxDepth; lo += size) {
    bands.push({
      lo,
      hi: Math.min(lo + size, data.maxDepth),
      desc: { time: 0, dist: 0 },
      asc: { time: 0, dist: 0 },
    });
  }
  if (bands.length === 0) return [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    if (inHang(a.t) || inHang(b.t)) continue;
    const mid = (a.d + b.d) / 2;
    const idx = Math.min(bands.length - 1, Math.max(0, Math.floor(mid / size)));
    const phase: 'desc' | 'asc' = b.t <= splitT ? 'desc' : 'asc';
    bands[idx][phase].time += dt;
    bands[idx][phase].dist += Math.abs(b.d - a.d);
  }

  // Keep only bands the dive actually moved through.
  return bands.filter((bd) => bd.desc.time > 0 || bd.asc.time > 0);
}

/** Speed inside one band, or null when the dive barely moved through it
 *  (the same threshold the table uses to print a dash). */
export function bandSpeed(agg: PhaseAgg): number | null {
  if (agg.time <= 0 || agg.dist <= 0.1) return null;
  return agg.dist / agg.time;
}

export function bandLabel(r: BandRow): string {
  return `${r.lo}–${Number.isInteger(r.hi) ? r.hi : r.hi.toFixed(1)}m`;
}
