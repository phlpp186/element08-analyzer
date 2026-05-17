/**
 * Playground pivot — cross-cut training data by any dimension.
 *
 * The old playground only grouped sessions by time bucket. This module
 * adds the "What × By × Stat" pivot: a per-dive (or per-session) metric
 * on the Y axis, grouped by any dimension (chip values, lung vol, date
 * bucket, etc.) on the X axis, summarised by a statistic.
 *
 * Both render modes — grouped bars + box plot — share the same bucket
 * output. The chart picks visual based on the toggle the user flips.
 *
 * Dimensions and metrics are typed by which session modes they apply
 * to; the Playground UI filters its picker lists by the active mode so
 * users only see what makes sense.
 */
import type { ParsedSession } from '../../schema/backup';

export type SessionMode = 'dry' | 'depth' | 'pool';
export type Stat = 'avg' | 'median' | 'max' | 'min' | 'count';

export interface PivotItem {
  date: string;
  mode: SessionMode;
  session: ParsedSession;
  /** Present for depth/pool items; absent for dry items (where the
   *  session itself is the unit). */
  dive?: unknown;
}

export interface PivotMetric {
  id: string;
  label: string;
  unit: string;
  /** Modes for which this metric is defined. Empty = all modes. */
  modes: SessionMode[];
  extract: (item: PivotItem) => number | null;
}

export interface PivotDimension {
  id: string;
  label: string;
  /** Section heading in the picker. */
  group: 'Time' | 'Equipment' | 'Conditions' | 'Body' | 'Mode' | 'Numeric';
  /** Modes for which this dimension is defined. Empty = all modes. */
  modes: SessionMode[];
  /** Returns the bucket key for this item, or null to skip. */
  extract: (item: PivotItem) => string | null;
  /** Optional explicit ordering for chip-style enums; otherwise sorted
   *  alphabetically. */
  order?: string[];
}

export interface PivotBucket {
  key: string;
  label: string;
  n: number;
  /** All metric values that landed in this bucket — kept so box plots
   *  can derive median / IQR / whiskers without re-iterating. */
  points: number[];
  /** Pre-computed summary statistic per the requested `stat`. */
  value: number;
}

// ── Flatten ─────────────────────────────────────────────────────────────────

export function flatten(sessions: ParsedSession[]): PivotItem[] {
  const out: PivotItem[] = [];
  for (const s of sessions) {
    if (s.mode === 'dry') {
      out.push({ date: s.date, mode: 'dry', session: s });
    } else if (s.mode === 'depth' || s.mode === 'pool') {
      const dives = (s as unknown as { dives?: unknown[] }).dives ?? [];
      for (const d of dives) {
        out.push({ date: s.date, mode: s.mode, session: s, dive: d });
      }
    }
  }
  return out;
}

// ── Pivot ───────────────────────────────────────────────────────────────────

export function pivot(
  items: PivotItem[],
  dim: PivotDimension,
  metric: PivotMetric,
  stat: Stat,
): PivotBucket[] {
  const buckets = new Map<string, number[]>();
  for (const it of items) {
    if (metric.modes.length > 0 && !metric.modes.includes(it.mode)) continue;
    if (dim.modes.length > 0 && !dim.modes.includes(it.mode)) continue;
    const key = dim.extract(it);
    if (key == null) continue;
    const v = metric.extract(it);
    if (v == null) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(v);
    buckets.set(key, arr);
  }

  const out: PivotBucket[] = [];
  for (const [key, points] of buckets.entries()) {
    out.push({
      key,
      label: key,
      n: points.length,
      points,
      value: computeStat(points, stat),
    });
  }

  // Ordering: explicit dim.order wins, otherwise alpha. Time buckets are
  // already keyed by ISO date strings so alpha = chronological.
  if (dim.order) {
    const orderIdx = new Map(dim.order.map((k, i) => [k, i] as const));
    out.sort((a, b) => (orderIdx.get(a.key) ?? 999) - (orderIdx.get(b.key) ?? 999));
  } else {
    out.sort((a, b) => a.key.localeCompare(b.key));
  }
  return out;
}

function computeStat(points: number[], stat: Stat): number {
  if (points.length === 0) return 0;
  if (stat === 'count') return points.length;
  if (stat === 'max') return Math.max(...points);
  if (stat === 'min') return Math.min(...points);
  if (stat === 'avg') return points.reduce((a, b) => a + b, 0) / points.length;
  // median
  const sorted = [...points].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Metrics ─────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const PIVOT_METRICS: PivotMetric[] = [
  // ─ Per-dive (depth) ─
  { id: 'depth.maxDepth',     label: 'Max depth',     unit: 'm',   modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { depth?: number }).depth) : null },
  { id: 'depth.diveTime',     label: 'Dive time',     unit: 's',   modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { diveTime?: number }).diveTime) : null },
  { id: 'depth.descentSpeed', label: 'Descent speed', unit: 'm/s', modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { descentSpeed?: number }).descentSpeed) : null },
  { id: 'depth.ascentSpeed',  label: 'Ascent speed',  unit: 'm/s', modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { ascentSpeed?: number }).ascentSpeed) : null },
  { id: 'depth.hangTime',     label: 'Hang time',     unit: 's',   modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { hangTime?: number }).hangTime) : null },
  { id: 'depth.avgHr',        label: 'Avg HR',        unit: 'bpm', modes: ['depth'],
    extract: (i) => i.dive ? num((i.dive as { hr?: number }).hr) : null },

  // ─ Per-dive (pool) ─
  { id: 'pool.distance', label: 'Distance', unit: 'm', modes: ['pool'],
    extract: (i) => i.dive ? num((i.dive as { distance?: number }).distance) : null },
  { id: 'pool.diveTime', label: 'Dive time', unit: 's', modes: ['pool'],
    extract: (i) => i.dive ? num((i.dive as { diveTime?: number }).diveTime) : null },
  { id: 'pool.pace100',  label: 'Pace (s/100 m)', unit: 's/100m', modes: ['pool'],
    extract: (i) => {
      const d = i.dive as { diveTime?: number; distance?: number } | undefined;
      if (!d || !d.diveTime || !d.distance || d.distance <= 0) return null;
      return d.diveTime / (d.distance / 100);
    } },
  { id: 'pool.avgHr',    label: 'Avg HR', unit: 'bpm', modes: ['pool'],
    extract: (i) => i.dive ? num((i.dive as { hr?: number }).hr) : null },

  // ─ Per-session (dry) ─
  { id: 'dry.longestHold', label: 'Longest hold', unit: 's', modes: ['dry'],
    extract: (i) => {
      const timeline = (i.session as unknown as { blockTimeline?: { type: string; seconds: number }[] }).blockTimeline ?? [];
      let m = 0;
      for (const b of timeline) if (b.type === 'Hold' && b.seconds > m) m = b.seconds;
      return m > 0 ? m : null;
    } },
  { id: 'dry.cyclesCount', label: 'Hold count', unit: 'holds', modes: ['dry'],
    extract: (i) => num((i.session as unknown as { cyclesCount?: number }).cyclesCount) },
];

// ── Dimensions ──────────────────────────────────────────────────────────────

const chipDim = (
  id: string,
  label: string,
  modes: SessionMode[],
  group: PivotDimension['group'],
  field: string,
  source: 'dive' | 'session',
  order?: string[],
): PivotDimension => ({
  id,
  label,
  group,
  modes,
  order,
  extract: (it) => {
    const root = source === 'dive' ? it.dive : it.session;
    if (!root) return null;
    const adv = (root as { advanced?: Record<string, unknown> }).advanced;
    if (!adv) return null;
    const v = adv[field];
    if (v == null || v === '') return null;
    return String(v);
  },
});

export const PIVOT_DIMENSIONS: PivotDimension[] = [
  // ─ Mode-level ─
  { id: 'mode.discipline', label: 'Discipline', group: 'Mode', modes: ['depth', 'pool'],
    extract: (i) => {
      const d = (i.dive ?? i.session) as { discipline?: string } | undefined;
      return d?.discipline ?? null;
    } },
  { id: 'mode.diveType', label: 'Dive type', group: 'Mode', modes: ['depth', 'pool'],
    extract: (i) => {
      const d = i.dive as { diveType?: string } | undefined;
      return d?.diveType ?? 'training';
    },
    order: ['warmup', 'training', 'competition', 'safety'] },
  { id: 'mode.sessionTag', label: 'Session tag', group: 'Mode', modes: ['dry'],
    extract: (i) => (i.session as unknown as { sessionTag?: string }).sessionTag ?? null,
    order: ['comfy', 'co2_table', 'o2_table', 'pb_attempt', 'recovery'] },
  { id: 'mode.lungVol', label: 'Lung volume', group: 'Mode', modes: ['dry'],
    extract: (i) => (i.session as unknown as { lungVol?: string }).lungVol ?? null,
    order: ['FL', 'FRC', 'RV'] },
  { id: 'mode.poolType', label: 'Pool length', group: 'Mode', modes: ['pool'],
    extract: (i) => (i.session as unknown as { poolType?: string }).poolType ?? null,
    order: ['25m', '50m'] },
  { id: 'mode.sessionType', label: 'Pool session type', group: 'Mode', modes: ['pool'],
    extract: (i) => (i.session as unknown as { sessionType?: string }).sessionType ?? null,
    order: ['VOL', 'CO2', 'O2', 'SP', 'TE', 'MAX', 'FUN', 'RC'] },

  // ─ Equipment (Depth) ─
  chipDim('eq.fins',      'Fins',        ['depth'], 'Equipment', 'fins',      'dive'),
  chipDim('eq.mask',      'Mask',        ['depth'], 'Equipment', 'mask',      'dive'),
  chipDim('eq.suit',      'Suit',        ['depth'], 'Equipment', 'suit',      'dive'),
  chipDim('eq.weights',   'Weights',     ['depth'], 'Equipment', 'weights',   'dive'),

  // ─ Equipment (Pool) ─
  chipDim('eq.poolWetsuit','Wetsuit',     ['pool'], 'Equipment', 'wetsuit',   'dive'),
  chipDim('eq.poolWeights','Pool weights',['pool'], 'Equipment', 'weights',   'dive'),
  chipDim('eq.poolPool',  'Pool',        ['pool'], 'Equipment', 'pool',      'dive'),

  // ─ Conditions (Depth) ─
  chipDim('cond.waves',       'Waves',       ['depth'], 'Conditions', 'waves',       'dive'),
  chipDim('cond.current',     'Current',     ['depth'], 'Conditions', 'current',     'dive'),
  chipDim('cond.thermocline', 'Thermocline', ['depth'], 'Conditions', 'thermocline', 'dive'),
  chipDim('cond.eq',          'Equalization',['depth'], 'Conditions', 'eq',          'dive'),
  chipDim('cond.pace',        'Pace',        ['depth'], 'Conditions', 'pace',        'dive'),
  chipDim('cond.earlyTurn',   'Early turn',  ['depth'], 'Conditions', 'earlyTurn',   'dive'),

  // ─ Conditions (Pool) ─
  chipDim('cond.poolNoise', 'Pool noise',  ['pool'], 'Conditions', 'noise',  'dive'),
  chipDim('cond.poolPace',  'Pool pace',   ['pool'], 'Conditions', 'pace',   'dive'),
  chipDim('cond.poolGlides','Glides',      ['pool'], 'Conditions', 'glides', 'dive'),

  // ─ Body (Dry) ─
  chipDim('body.nose',       'Nose',        ['dry'], 'Body', 'nose',       'session'),
  chipDim('body.eyes',       'Eyes',        ['dry'], 'Body', 'eyes',       'session'),
  chipDim('body.external',   'External',    ['dry'], 'Body', 'external',   'session'),
  chipDim('body.place',      'Place',       ['dry'], 'Body', 'place',      'session'),
  chipDim('body.indoor',     'Indoor',      ['dry'], 'Body', 'indoor',     'session'),
  chipDim('body.ambient',    'Ambient',     ['dry'], 'Body', 'ambient',    'session'),
  chipDim('body.position',   'Position',    ['dry'], 'Body', 'position',   'session'),
  chipDim('body.relaxation', 'Relaxation',  ['dry'], 'Body', 'relaxation', 'session'),
];
