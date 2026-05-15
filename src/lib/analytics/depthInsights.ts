/**
 * Depth-tab analytics — aggregates across all depth dives in the backup.
 *
 *   - depthDistribution: histogram of max depth per dive.
 *   - speedPerDepthBand: avg descent + ascent speed grouped by the dive's
 *     max-depth band (matches the mobile app: dive-level speeds bucketed,
 *     no per-profile band traversal).
 *   - hangTimeDistribution: how long the diver typically spends at the
 *     bottom; bucketed durations + "% of dives with a hang" stat.
 *   - disciplineProgression: running max depth over time, one series per
 *     discipline, step-line at every PB.
 *
 * Warm-up / safety / excluded dives are filtered out via includeDive so
 * the aggregates reflect deliberate performance work.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

interface DepthDiveLite {
  depth: number;
  diveTime: number;
  hangTime?: number;
  descentSpeed?: number;
  ascentSpeed?: number;
  discipline?: string | null;
  diveType?: string | null;
}

interface DiveRow {
  dive: DepthDiveLite;
  date: Date;
}

function collectDives(sessions: ParsedSession[]): DiveRow[] {
  const out: DiveRow[] = [];
  for (const s of sessions) {
    if (s.mode !== 'depth') continue;
    const dives = (s as { dives?: DepthDiveLite[] }).dives;
    if (!dives) continue;
    const date = new Date(s.date);
    if (Number.isNaN(date.getTime())) continue;
    for (const dive of dives) {
      if (!includeDive(dive.diveType)) continue;
      out.push({ dive, date });
    }
  }
  return out;
}

// ─── 1. Depth distribution ──────────────────────────────────────────────────

export interface DepthBin {
  /** Lower bound (m), inclusive. */
  from: number;
  /** Upper bound (m), exclusive. */
  to: number;
  count: number;
}

export function depthDistribution(
  sessions: ParsedSession[],
  binSize = 5,
): DepthBin[] {
  const depths: number[] = [];
  for (const { dive } of collectDives(sessions)) {
    if (typeof dive.depth === 'number' && dive.depth > 0) depths.push(dive.depth);
  }
  if (depths.length === 0) return [];
  const max = Math.max(...depths);
  const lastStart = Math.floor(max / binSize) * binSize;
  const bins: DepthBin[] = [];
  for (let start = 0; start <= lastStart; start += binSize) {
    bins.push({ from: start, to: start + binSize, count: 0 });
  }
  for (const d of depths) {
    const idx = Math.min(Math.floor(d / binSize), bins.length - 1);
    bins[idx].count++;
  }
  return bins;
}

// ─── 2. Avg speed per depth band ────────────────────────────────────────────

export type BandStep = 5 | 10 | 20;

export interface SpeedBand {
  /** Lower bound of the band (m). */
  band: number;
  /** Band height (m) — `band + step` is the upper bound. */
  step: number;
  descentSpeed: number;
  ascentSpeed: number;
  /** Number of dives whose max-depth fell in this band. */
  count: number;
}

export function speedPerDepthBand(
  sessions: ParsedSession[],
  step: BandStep,
): SpeedBand[] {
  // Bucket dive-level descent/ascent speeds by the band their max-depth
  // falls into. Matches the mobile app's Insights behavior — no per-profile
  // band traversal here.
  const buckets = new Map<number, { desc: number[]; asc: number[] }>();
  for (const { dive } of collectDives(sessions)) {
    const ds = dive.descentSpeed;
    const as = dive.ascentSpeed;
    if (typeof ds !== 'number' || ds <= 0) continue;
    if (typeof as !== 'number' || as <= 0) continue;
    const band = Math.floor(dive.depth / step) * step;
    const b = buckets.get(band) ?? { desc: [], asc: [] };
    b.desc.push(ds);
    b.asc.push(as);
    buckets.set(band, b);
  }
  const out: SpeedBand[] = [];
  for (const [band, { desc, asc }] of buckets) {
    // Need at least 2 samples per band so a single dive doesn't define the
    // average — matches the app.
    if (desc.length < 2) continue;
    out.push({
      band,
      step,
      descentSpeed: avg(desc),
      ascentSpeed: avg(asc),
      count: desc.length,
    });
  }
  return out.sort((a, b) => a.band - b.band);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ─── 3. Hang time distribution ──────────────────────────────────────────────

export interface HangBin {
  label: string;
  /** Lower bound (s), inclusive. */
  from: number;
  /** Upper bound (s), exclusive. Infinity for the open top bucket. */
  to: number;
  count: number;
}

export interface HangTimeStats {
  bins: HangBin[];
  totalDives: number;
  divesWithHang: number;
  longestHangSec: number;
}

// Buckets tuned to typical depth-diving hangs: most are 0s, the long tail
// is in the 10-30s range.
const HANG_BUCKETS: Omit<HangBin, 'count'>[] = [
  { label: '0s',     from: 0,  to: 1 },
  { label: '1-3s',   from: 1,  to: 4 },
  { label: '4-6s',   from: 4,  to: 7 },
  { label: '7-10s',  from: 7,  to: 11 },
  { label: '11-20s', from: 11, to: 21 },
  { label: '21s+',   from: 21, to: Infinity },
];

export function hangTimeDistribution(sessions: ParsedSession[]): HangTimeStats {
  const bins: HangBin[] = HANG_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let totalDives = 0;
  let divesWithHang = 0;
  let longestHangSec = 0;

  for (const { dive } of collectDives(sessions)) {
    totalDives++;
    const h = Math.max(0, typeof dive.hangTime === 'number' ? dive.hangTime : 0);
    if (h >= 1) divesWithHang++;
    if (h > longestHangSec) longestHangSec = h;
    const bin = bins.find((b) => h >= b.from && h < b.to);
    if (bin) bin.count++;
  }
  return { bins, totalDives, divesWithHang, longestHangSec };
}

// ─── 4. Discipline progression ──────────────────────────────────────────────

export interface ProgressionPoint {
  /** ISO date string (YYYY-MM-DD, local). */
  date: string;
  /** New running max depth at this date (m, one decimal). */
  depth: number;
}

export interface DisciplineSeries {
  discipline: string;
  color: string;
  /** Personal-best progression. Only includes dives that set a new PB
   *  for this discipline; ECharts step-line draws the plateaus. */
  points: ProgressionPoint[];
}

const DISCIPLINE_COLORS: Record<string, string> = {
  CWT:  '#4fc3f7', // blue (matches the depth accent)
  CWTB: '#a89fff', // violet
  FIM:  '#66bb6a', // green
  CNF:  '#ffa726', // amber
  VWT:  '#ff5f9e', // pink (rare, just in case)
  NLT:  '#ef5350', // red (rare)
};

export function disciplineProgression(
  sessions: ParsedSession[],
): DisciplineSeries[] {
  const byDisc = new Map<string, { date: Date; depth: number }[]>();
  for (const { dive, date } of collectDives(sessions)) {
    const disc = (dive.discipline ?? '').toString().toUpperCase().trim() || 'OTHER';
    const list = byDisc.get(disc) ?? [];
    list.push({ date, depth: dive.depth });
    byDisc.set(disc, list);
  }

  const out: DisciplineSeries[] = [];
  for (const [discipline, all] of byDisc) {
    all.sort((a, b) => a.date.getTime() - b.date.getTime());
    let runningMax = 0;
    const points: ProgressionPoint[] = [];
    for (const { date, depth } of all) {
      if (depth > runningMax + 0.05) {
        runningMax = depth;
        points.push({ date: isoLocal(date), depth: Math.round(depth * 10) / 10 });
      }
    }
    if (points.length === 0) continue;
    // Extend the line to today so the current PB reads as a plateau, not
    // a line that just stops weeks ago.
    const today = isoLocal(new Date());
    const last = points[points.length - 1];
    if (last.date !== today) {
      points.push({ date: today, depth: last.depth });
    }
    out.push({
      discipline,
      color: DISCIPLINE_COLORS[discipline] ?? '#9a9a9e',
      points,
    });
  }
  // Most active discipline first so its legend item / colour reads naturally.
  return out.sort((a, b) => b.points.length - a.points.length);
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
