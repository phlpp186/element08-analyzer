/**
 * AI assistant query engine (v1) — the tool the model calls to get numbers.
 *
 * Pure filter + group + aggregate over the user's own sessions. The AI model
 * emits a `QuerySpec` (via the `query_dives` tool); this computes the exact
 * numbers and returns them with a sample size `n` per group. The model never
 * does arithmetic and never sees raw dives, only these results.
 *
 * No React Native / Expo imports: this module is safe to run in the app, in a
 * Deno edge function, and in the browser (analyzer website). It generalises the
 * existing src/lib/compare/* query helpers into one filter+group_by+metrics
 * shape, resolving session-default -> per-dive-override inheritance and always
 * returning `n`.
 *
 * See appstore/ai-assistant-design.md (§4) for the design.
 */
import type {
  Session,
  DepthSession,
  PoolSession,
  DrySession,
  Dive,
  PoolDive,
  BlockEntry,
  HoldStat,
  SuitThickness,
} from './appTypes';
import { peakSpeedsFromProfile } from './support/queryDives';
import { extractHoldStats } from './support/extractHoldStats';
import { resolveContractionMs } from './support/resolveContractionMs';
import { sessionDay } from '../sessionDay';
import type { ToolContext } from './trainingSummary';

export type Dataset = 'depth' | 'pool' | 'dry';

export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'exists';

export interface QueryFilter {
  /** Field path, e.g. "diveTime", "weightDist.neck", "advanced.waves". */
  field: string;
  op: FilterOp;
  /** Scalar, array (for `in`), or [lo, hi] (for `between`). Ignored for `exists`. */
  value?: unknown;
}

export type Agg = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'median' | 'stddev' | 'p90';

export interface QueryMetric {
  /** Field to aggregate. Use '*' with agg 'count' for a plain row count. */
  field: string;
  agg: Agg;
}

export interface QuerySpec {
  dataset: Dataset;
  /** AND-combined. */
  filters?: QueryFilter[];
  /** Optional single dimension to break the result down by. */
  group_by?: string;
  metrics: QueryMetric[];
  /** ISO date (inclusive) — filters the parent session's date. */
  date_from?: string;
  date_to?: string;
  /** When grouping, cap the number of groups returned (largest first). */
  limit?: number;
}

export interface QueryGroup {
  /** group_by value as a string, or null for the single ungrouped result. */
  key: string | null;
  /** Rows (dives / holds) in this group after filtering. */
  n: number;
  /** Keyed `${field}.${agg}` -> value (null when the group has no data for it). */
  metrics: Record<string, number | null>;
}

export interface QueryResult {
  /** Rows matching the filters, before grouping. */
  total_n: number;
  groups: QueryGroup[];
  /** Human-readable caveats (e.g. rows excluded from a breakdown for missing data). */
  notes: string[];
}

// ─── Row model ──────────────────────────────────────────────────────────────
// A "row" is the unit of aggregation: one depth dive, one pool dive, or one
// breath-hold (Hold block) for dry sessions.

interface DepthRow {
  dataset: 'depth';
  session: DepthSession;
  dive: Dive;
  diveIdx: number;
}
interface PoolRow {
  dataset: 'pool';
  session: PoolSession;
  dive: PoolDive;
  diveIdx: number;
}
interface DryRow {
  dataset: 'dry';
  session: DrySession;
  hold: BlockEntry;
  holdIdx: number;
}
export type Row = (DepthRow | PoolRow | DryRow) & {
  /** The USER's calendar day for this row's session (see sessionDay). Stamped
   *  once here rather than derived at every comparison: filtering, grouping and
   *  sorting all want the same answer, and formatting a zone-aware date per row
   *  per filter over a few thousand dives is not free. */
  day?: string;
};

function suitMm(s?: SuitThickness | null): number | null {
  if (!s) return null;
  return s.kind === 'none' ? 0 : s.mm;
}

/** Normalise a discipline so ' cwt ' / 'CWT' all compare equal. */
function normDiscipline(d: unknown): string | null {
  if (typeof d !== 'string') return null;
  const t = d.trim().toUpperCase();
  return t.length ? t : null;
}

export function buildRows(sessions: Session[], dataset: Dataset, tz?: string): Row[] {
  const rows: Row[] = [];
  for (const s of sessions) {
    const day = s.date ? sessionDay(s.date, tz) : undefined;
    if (dataset === 'depth' && s.mode === 'depth') {
      s.dives.forEach((dive, diveIdx) =>
        rows.push({ dataset: 'depth', session: s, dive, diveIdx, day }),
      );
    } else if (dataset === 'pool' && s.mode === 'pool') {
      s.dives.forEach((dive, diveIdx) => rows.push({ dataset: 'pool', session: s, dive, diveIdx, day }));
    } else if (dataset === 'dry' && s.mode === 'dry') {
      // holdIdx is the Hold ORDINAL (0-based among Hold blocks), not the
      // blockTimeline position — that's what Contraction.holdIdx and
      // extractHoldStats key on, so per-hold joins line up.
      let hi = 0;
      for (const hold of s.blockTimeline) {
        if (hold.type === 'Hold') rows.push({ dataset: 'dry', session: s, hold, holdIdx: hi++, day });
      }
    }
  }
  return rows;
}

// ─── Within-session ranking (best-dive-relative position) ────────────────────
// Rank each dive within its own session by the dataset's PRIMARY performance
// metric — depth (depth dives) or distance (pool dives) — so the model can ask
// about position RELATIVE TO the session's best dive ("how many dives after my
// deepest?", "were the dives after it the same discipline?"). Cached on session
// identity: sessions are replaced (not mutated) on edit, so a WeakMap keyed on
// the object stays correct.

interface SessionRankInfo {
  /** 0-based index of the best (deepest/longest) dive; -1 if none carry the
   *  primary metric. Ties resolve to the earliest dive. */
  bestIdx: number;
  /** 1-based rank per dive index (1 = best). 0 = the dive has no primary metric
   *  logged, so it is unranked. */
  rank: number[];
}

const sessionRankCache = new WeakMap<object, SessionRankInfo>();

function sessionRanking(r: DepthRow | PoolRow): SessionRankInfo {
  const { session } = r;
  const cached = sessionRankCache.get(session);
  if (cached) return cached;
  const metricOf =
    r.dataset === 'depth'
      ? (i: number) => (session.dives[i] as Dive).depth ?? null
      : (i: number) => (session.dives[i] as PoolDive).distance ?? null;
  const n = session.dives.length;
  // Indices with a metric, sorted best-first; ties keep chronological order.
  const ordered = Array.from({ length: n }, (_, i) => i)
    .filter((i) => metricOf(i) != null)
    .sort((a, b) => metricOf(b)! - metricOf(a)! || a - b);
  const rank = new Array<number>(n).fill(0);
  ordered.forEach((i, pos) => (rank[i] = pos + 1));
  const info: SessionRankInfo = { bestIdx: ordered.length ? ordered[0] : -1, rank };
  sessionRankCache.set(session, info);
  return info;
}

// ─── Field resolution (nesting + session -> dive inheritance) ────────────────

function advancedField(adv: unknown, path: string): unknown {
  const key = path.slice('advanced.'.length);
  return (adv as Record<string, unknown> | undefined)?.[key] ?? null;
}

/** The user's day for a row — the stamp from buildRows, or the raw date part
 *  for a row built before the zone was known. */
export function dayOfRow(r: Row): string {
  return r.day ?? r.session.date.slice(0, 10);
}

export function getField(r: Row, path: string): unknown {
  // The USER's day (stamped in buildRows), not the timestamp: grouping and
  // selecting by date bucket by day, and that day has to be the one they see
  // in the session list. The UTC slice filed an early-morning session under
  // the day before.
  if (path === 'date') return dayOfRow(r);
  // Within-session position — shared by depth & pool (both carry diveIdx and a
  // `session.dives` array in chronological order). Lets the model answer
  // fatigue questions ("do my later dives get slower?") without eyeballing
  // list_dives. diveIdx is 0-based, so it IS the order within the session.
  if (r.dataset !== 'dry') {
    switch (path) {
      case 'diveOrderInSession':
        return r.diveIdx;
      case 'divesInSession':
        return r.session.dives.length;
      case 'isFirstInSession':
        return r.diveIdx === 0;
      case 'isLastInSession':
        return r.diveIdx === r.session.dives.length - 1;
      // Position RELATIVE TO the session's best (deepest/longest) dive.
      case 'rankInSession':
        return sessionRanking(r).rank[r.diveIdx] || null; // 0 (unranked) -> null
      case 'isBestInSession':
        return r.diveIdx === sessionRanking(r).bestIdx;
      case 'isAfterBestInSession': {
        const { bestIdx } = sessionRanking(r);
        return bestIdx >= 0 && r.diveIdx > bestIdx;
      }
      case 'divesAfterBestInSession': {
        const { bestIdx } = sessionRanking(r);
        return bestIdx >= 0 ? r.session.dives.length - 1 - bestIdx : null;
      }
    }
  }
  if (r.dataset === 'depth') return depthField(r, path);
  if (r.dataset === 'pool') return poolField(r, path);
  return dryField(r, path);
}

function depthField(r: DepthRow, path: string): unknown {
  const { dive, session } = r;
  switch (path) {
    case 'location':
      return session.location ?? null;
    case 'waterType':
      return session.waterType ?? null;
    case 'waterTemp':
      return session.waterTemp;
    case 'tempSurface':
      return dive.tempSurface ?? session.tempSurface;
    case 'tempDepth':
      return dive.tempDepth ?? session.tempDepth;
    case 'sessionType':
      return session.sessionType ?? null;
    case 'deviceName':
      return session.deviceName ?? null;
    case 'discipline':
      return normDiscipline(dive.discipline);
    // Ballast + suit: dive override falls back to the session default.
    case 'weightKg':
      return dive.weightKg ?? session.weightKg ?? null;
    case 'weightDist.neck':
      return dive.weightDist?.neck ?? session.weightDist?.neck ?? null;
    case 'weightDist.belt':
      return dive.weightDist?.belt ?? session.weightDist?.belt ?? null;
    case 'weightDist.ankle':
      return dive.weightDist?.ankle ?? session.weightDist?.ankle ?? null;
    case 'suit.mm':
      return suitMm(dive.suit ?? session.suit);
    case 'peakDescentSpeed':
      return peakSpeedsFromProfile(dive).peakDescent;
    case 'peakAscentSpeed':
      return peakSpeedsFromProfile(dive).peakAscent;
    case 'contractionOnset.depth':
      return dive.contractionOnset?.depth ?? null;
    case 'contractionOnset.direction':
      return dive.contractionOnset?.direction ?? null;
    default:
      if (path.startsWith('advanced.')) return advancedField(dive.advanced, path);
      return (dive as unknown as Record<string, unknown>)[path] ?? null;
  }
}

/** First/second-half average lap time. Odd lap counts drop the middle lap so
 *  the halves compare like for like. Needs >= 2 laps. */
function halfLapAvg(laps: number[], half: 'first' | 'second'): number | null {
  if (!laps || laps.length < 2) return null;
  const n = Math.floor(laps.length / 2);
  const slice = half === 'first' ? laps.slice(0, n) : laps.slice(laps.length - n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function poolField(r: PoolRow, path: string): unknown {
  const { dive, session } = r;
  switch (path) {
    case 'location':
      return session.location ?? null;
    case 'poolType':
      return session.poolType;
    case 'waterTemp':
      return session.waterTemp;
    case 'totalDistance':
      return session.totalDistance;
    case 'startTime':
      return session.startTime;
    case 'sessionType':
      return session.sessionType ?? null;
    case 'discipline':
      return dive.discipline;
    // Derived pace — the model never does arithmetic, so expose both forms.
    case 'speed': // m/s
      return dive.distance != null && dive.distance > 0 && dive.diveTime > 0
        ? dive.distance / dive.diveTime
        : null;
    case 'pace100': // seconds per 100 m
      return dive.distance != null && dive.distance > 0 && dive.diveTime > 0
        ? (dive.diveTime / dive.distance) * 100
        : null;
    // Lap-split summaries (never the raw lapTimes array).
    case 'lapCount':
      return dive.lapTimes?.length || null;
    case 'avgLapTime':
      return dive.lapTimes?.length
        ? dive.lapTimes.reduce((a, b) => a + b, 0) / dive.lapTimes.length
        : null;
    case 'bestLapTime':
      return dive.lapTimes?.length
        ? dive.lapTimes.reduce((a, b) => (b < a ? b : a), dive.lapTimes[0])
        : null;
    case 'firstHalfAvgLap':
      return halfLapAvg(dive.lapTimes ?? [], 'first');
    case 'secondHalfAvgLap':
      return halfLapAvg(dive.lapTimes ?? [], 'second');
    // Seconds from dive start to the first contraction.
    case 'firstContractionSec':
      return dive.contractions?.length
        ? dive.contractions.reduce((a, b) => (b < a ? b : a), dive.contractions[0])
        : null;
    case 'weightKg':
      return dive.weightKg ?? session.weightKg ?? null;
    case 'weightDist.neck':
      return dive.weightDist?.neck ?? session.weightDist?.neck ?? null;
    case 'weightDist.belt':
      return dive.weightDist?.belt ?? session.weightDist?.belt ?? null;
    case 'weightDist.ankle':
      return dive.weightDist?.ankle ?? session.weightDist?.ankle ?? null;
    case 'suit.mm':
      return suitMm(dive.suit ?? session.suit);
    default:
      if (path.startsWith('advanced.')) return advancedField(dive.advanced, path);
      return (dive as unknown as Record<string, unknown>)[path] ?? null;
  }
}

// Per-hold oximeter stats are derived from the session's 1 Hz oxyReadings by
// extractHoldStats — an O(readings) walk we must not repeat for every
// getField call. Cache per session object; sessions are replaced (not
// mutated) on edit, so a WeakMap keyed on identity stays correct.
const holdStatsCache = new WeakMap<DrySession, Map<number, HoldStat>>();

function holdStatFor(session: DrySession, holdIdx: number): HoldStat | null {
  let byIdx = holdStatsCache.get(session);
  if (!byIdx) {
    byIdx = new Map();
    for (const h of extractHoldStats([session])) byIdx.set(h.holdIdx, h);
    holdStatsCache.set(session, byIdx);
  }
  return byIdx.get(holdIdx) ?? null;
}

/** HR-only straps log a constant SpO2 of 0 — their SpO2-derived stats are
 *  meaningless and must read as "not logged". */
function hasSpo2(session: DrySession): boolean {
  return (session.deviceType ?? 'oximeter') === 'oximeter';
}

/** Hold-relative contraction times (s, ascending) for one hold. Computed from
 *  the tap log directly, so it works with or without an oximeter.
 *  resolveContractionMs is PLAY-relative, so subtract the PLAY-relative hold
 *  start (block spans include pauses) — see feedback_contraction_timebase. */
function dryContractionTimes(session: DrySession, holdIdx: number): number[] {
  const cs = (session.contractions ?? []).filter((c) => c.holdIdx === holdIdx);
  if (!cs.length) return [];
  let cursor = 0;
  let hi = 0;
  let holdStart: number | null = null;
  for (const b of session.blockTimeline ?? []) {
    if (b.type === 'Hold') {
      if (hi === holdIdx) {
        holdStart = cursor;
        break;
      }
      hi++;
    }
    cursor += b.seconds + (b.pausedMs ?? 0) / 1000;
  }
  if (holdStart === null) return [];
  return cs
    .map((c) => resolveContractionMs(c, session.blockTimeline) / 1000 - holdStart!)
    .filter((t) => t >= -2)
    .map((t) => Math.max(0, t))
    .sort((a, b) => a - b);
}

function dryField(r: DryRow, path: string): unknown {
  const { hold, session } = r;
  switch (path) {
    // Canonical hold-time field for the dry dataset.
    case 'holdSeconds':
      return hold.seconds;
    case 'rating':
      return hold.rating ?? session.rating;
    case 'lungVol':
      return hold.lungVol ?? session.lungVol;
    case 'packs':
      return hold.packs ?? session.advanced?.packs ?? null;
    case 'dryActivity':
      return session.dryActivity ?? null;
    case 'breathingStyle':
      return session.breathingStyle ?? null;
    case 'holdIdx':
      return r.holdIdx;
    // Contractions are tap-logged and exist without any oximeter.
    case 'contractionCount':
      return (session.contractions ?? []).filter((c) => c.holdIdx === r.holdIdx).length;
    case 'firstContractionSec': {
      const t = dryContractionTimes(session, r.holdIdx);
      return t.length ? t[0] : null;
    }
    case 'avgContractionInterval': {
      const t = dryContractionTimes(session, r.holdIdx);
      if (t.length < 2) return null;
      const ivs: number[] = [];
      for (let i = 1; i < t.length; i++) ivs.push(t[i] - t[i - 1]);
      return ivs.reduce((a, v) => a + v, 0) / ivs.length;
    }
    // Oximeter-derived per-hold stats (SpO2 % / HR bpm / seconds).
    case 'minSpo2':
      return hasSpo2(session) ? (holdStatFor(session, r.holdIdx)?.minSpo2 ?? null) : null;
    case 'spo2Baseline':
      return hasSpo2(session) ? (holdStatFor(session, r.holdIdx)?.baseline ?? null) : null;
    case 'spo2AtEnd':
      return hasSpo2(session) ? (holdStatFor(session, r.holdIdx)?.atEnd ?? null) : null;
    case 'afterdrop':
      return hasSpo2(session) ? (holdStatFor(session, r.holdIdx)?.adMag ?? null) : null;
    case 'recoverySec':
      return hasSpo2(session) ? (holdStatFor(session, r.holdIdx)?.recovSec ?? null) : null;
    case 'minHr':
      return holdStatFor(session, r.holdIdx)?.hrMin ?? null;
    case 'maxHr':
      return holdStatFor(session, r.holdIdx)?.hrMax ?? null;
    case 'avgHr':
      return holdStatFor(session, r.holdIdx)?.hrAvg ?? null;
    // Dive-reflex HR analytics (need HR before + during the hold).
    case 'restingHr':
      return holdStatFor(session, r.holdIdx)?.hrBaseline ?? null;
    case 'diveReflexPct':
      return holdStatFor(session, r.holdIdx)?.diveReflexPct ?? null;
    case 'hrDrop1min':
      return holdStatFor(session, r.holdIdx)?.diveReflex1minPct ?? null;
    case 'hrAtFirstContraction':
      return holdStatFor(session, r.holdIdx)?.hrAtFirstContraction ?? null;
    case 'hrDropAfterContraction':
      return holdStatFor(session, r.holdIdx)?.diveReflexPostContractionPct ?? null;
    default:
      // Dry advanced chips live at the session level, not per-hold.
      if (path.startsWith('advanced.')) return advancedField(session.advanced, path);
      return (hold as unknown as Record<string, unknown>)[path] ?? null;
  }
}

// ─── Filtering ───────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

/** Numeric when both coerce to numbers, else case-insensitive trimmed string. */
function equalLoose(a: unknown, b: unknown): boolean {
  const na = toNum(a);
  const nb = toNum(b);
  if (na != null && nb != null) return na === nb;
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function applyFilter(value: unknown, op: FilterOp, target: unknown): boolean {
  switch (op) {
    case 'exists':
      return value != null;
    case 'eq':
      return equalLoose(value, target);
    case 'ne':
      return !equalLoose(value, target);
    case 'in':
      return Array.isArray(target) && target.some((t) => equalLoose(value, t));
    case 'between': {
      const n = toNum(value);
      if (n == null || !Array.isArray(target) || target.length < 2) return false;
      const lo = toNum(target[0]);
      const hi = toNum(target[1]);
      return lo != null && hi != null && n >= lo && n <= hi;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const n = toNum(value);
      const t = toNum(target);
      if (n == null || t == null) return false;
      if (op === 'gt') return n > t;
      if (op === 'gte') return n >= t;
      if (op === 'lt') return n < t;
      return n <= t;
    }
    default:
      return false;
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────
// min/max use reduce, never Math.min(...spread) — spreading a large profile-
// derived array has crashed us before (see reference_ota_hotfix).

function aggregate(vals: number[], agg: Agg): number | null {
  if (!vals.length) return null;
  switch (agg) {
    case 'sum':
      return vals.reduce((a, b) => a + b, 0);
    case 'avg':
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    case 'min':
      return vals.reduce((a, b) => (b < a ? b : a), vals[0]);
    case 'max':
      return vals.reduce((a, b) => (b > a ? b : a), vals[0]);
    case 'median': {
      const s = [...vals].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    case 'p90': {
      const s = [...vals].sort((a, b) => a - b);
      // Type-7 interpolated percentile (matches strokeDetection.quantileSorted /
      // computeBoxStats), so the assistant's p90 agrees with every other
      // percentile surface instead of quoting a nearest-rank outlier.
      const pos = (s.length - 1) * 0.9;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return lo === hi ? s[lo] : s[lo] + (pos - lo) * (s[hi] - s[lo]);
    }
    case 'stddev': {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const varc = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
      return Math.sqrt(varc);
    }
    default:
      return null;
  }
}

function computeMetrics(rows: Row[], metrics: QueryMetric[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of metrics) {
    const label = `${m.field}.${m.agg}`;
    if (m.agg === 'count') {
      out[label] =
        m.field === '*' ? rows.length : rows.filter((r) => getField(r, m.field) != null).length;
      continue;
    }
    const vals: number[] = [];
    for (const r of rows) {
      const n = toNum(getField(r, m.field));
      if (n != null) vals.push(n);
    }
    out[label] = aggregate(vals, m.agg);
  }
  return out;
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function runQuery(sessions: Session[], spec: QuerySpec, ctx: ToolContext = {}): QueryResult {
  const notes: string[] = [];
  const noun = spec.dataset === 'dry' ? 'holds' : 'dives';

  let rows = buildRows(sessions, spec.dataset, ctx.tz);

  // Compare on the user's DAY, not the stored timestamp: a date_to of
  // "2026-07-09" must include a dive stamped 2026-07-09T00:54Z, and a dive
  // stamped 2026-07-10T00:54Z that they did on the evening of the 9th.
  if (spec.date_from) rows = rows.filter((r) => dayOfRow(r) >= spec.date_from!);
  if (spec.date_to) rows = rows.filter((r) => dayOfRow(r) <= spec.date_to!);

  for (const f of spec.filters ?? []) {
    rows = rows.filter((r) => applyFilter(getField(r, f.field), f.op, f.value));
  }

  const total_n = rows.length;

  let groups: QueryGroup[];
  if (spec.group_by) {
    const gkey = spec.group_by;
    const buckets = new Map<string, Row[]>();
    let missing = 0;
    for (const r of rows) {
      const v = getField(r, gkey);
      if (v == null || v === '') {
        missing++;
        continue;
      }
      const k = String(v);
      const arr = buckets.get(k);
      if (arr) arr.push(r);
      else buckets.set(k, [r]);
    }
    if (missing > 0) {
      notes.push(
        `${missing} ${noun} had no ${gkey} logged and were excluded from the ${gkey} breakdown.`,
      );
    }
    groups = [...buckets.entries()].map(([key, rs]) => ({
      key,
      n: rs.length,
      metrics: computeMetrics(rs, spec.metrics),
    }));
    // Largest group first, so a `limit` keeps the most-supported buckets.
    groups.sort((a, b) => b.n - a.n);
    if (spec.limit != null && spec.limit >= 0) groups = groups.slice(0, spec.limit);
  } else {
    groups = [{ key: null, n: rows.length, metrics: computeMetrics(rows, spec.metrics) }];
  }

  return { total_n, groups, notes };
}

// ─── Tool schema (the model calls this) ──────────────────────────────────────

export const QUERY_DIVES_TOOL = {
  name: 'query_dives',
  description:
    "Filter and aggregate the user's own logged dives and return exact numbers with a sample " +
    'size n per group. Use two separate calls to compare two different conditions. Always report ' +
    'n to the user and do not over-claim on small samples.',
  input_schema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', enum: ['depth', 'pool', 'dry'] },
      filters: {
        type: 'array',
        description: 'AND-combined conditions.',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            op: {
              type: 'string',
              enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'exists'],
            },
            value: {},
          },
          required: ['field', 'op'],
        },
      },
      group_by: {
        type: 'string',
        description: 'Optional single dimension to break results down by.',
      },
      metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: "Field to aggregate, or '*' with agg 'count'." },
            agg: {
              type: 'string',
              enum: ['avg', 'min', 'max', 'sum', 'count', 'median', 'stddev', 'p90'],
            },
          },
          required: ['field', 'agg'],
        },
      },
      date_from: { type: 'string', description: 'ISO date, inclusive.' },
      date_to: { type: 'string', description: 'ISO date, inclusive.' },
      limit: {
        type: 'integer',
        description: 'When grouping, cap the number of groups (largest first).',
      },
    },
    required: ['dataset', 'metrics'],
  },
} as const;
