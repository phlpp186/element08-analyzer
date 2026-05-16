/**
 * Breath-hold trend analytics.
 *
 * Each function takes the full session list and returns a tidy data
 * structure for one chart on the Breath Hold tab. Time alignment uses
 * extractDrySessionData so the timeline / oxy / contractions agree.
 */
import type { ParsedSession } from '../../schema/backup';
import { extractDrySessionData } from './drySessionProfile';

type SessionTag = 'co2_table' | 'o2_table' | 'comfy' | 'pb_attempt' | 'recovery';

const TAG_LABELS: Record<SessionTag, string> = {
  co2_table:  'CO₂ table',
  o2_table:   'O₂ table',
  comfy:      'Comfortable',
  pb_attempt: 'Max attempt',
  recovery:   'Recovery',
};
const TAG_COLORS: Record<SessionTag, string> = {
  co2_table:  '#ff5f9e',
  o2_table:   '#00e5cc',
  comfy:      '#9aa5ff',
  pb_attempt: '#ffa726',
  recovery:   '#66bb6a',
};

// ── Hold Duration trend ─────────────────────────────────────────────────────

export interface HoldDurationPoint {
  date: string;
  /** Longest Hold block in the session, seconds. */
  longestHoldSec: number;
}

export interface HoldDurationSeries {
  tag: SessionTag;
  label: string;
  color: string;
  points: HoldDurationPoint[];
}

export function holdDurationTrend(sessions: ParsedSession[]): HoldDurationSeries[] {
  const bucketsByTag = new Map<SessionTag, HoldDurationPoint[]>();
  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    const tag = (s as unknown as { sessionTag?: SessionTag }).sessionTag;
    if (!tag) continue;
    const data = extractDrySessionData(s as never);
    const holds = data.blocks.filter((b) => b.type === 'Hold');
    if (holds.length === 0) continue;
    const longest = holds.reduce((m, h) => Math.max(m, h.endT - h.startT), 0);
    if (longest <= 0) continue;
    const arr = bucketsByTag.get(tag) ?? [];
    arr.push({ date: s.date, longestHoldSec: longest });
    bucketsByTag.set(tag, arr);
  }
  const order: SessionTag[] = ['pb_attempt', 'o2_table', 'co2_table', 'comfy', 'recovery'];
  for (const arr of bucketsByTag.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return order
    .filter((t) => bucketsByTag.has(t))
    .map((t) => ({
      tag: t,
      label: TAG_LABELS[t],
      color: TAG_COLORS[t],
      points: bucketsByTag.get(t)!,
    }));
}

// ── Contractions per 30s band ───────────────────────────────────────────────

export interface ContractionBand {
  /** Lower edge, seconds since hold start (inclusive). */
  from: number;
  /** Upper edge, seconds since hold start (exclusive). */
  to: number;
  count: number;
}

const BAND_WIDTH = 30;

/** Bucket every recorded contraction by how many seconds into its hold it
 *  fired. Aggregates across all dry sessions and all holds. Empty bands
 *  between min and max are kept so the histogram x-axis is continuous. */
export function contractionsPerBand(sessions: ParsedSession[]): ContractionBand[] {
  const elapsedWithinHold: number[] = [];
  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    const data = extractDrySessionData(s as never);
    const holds = data.blocks.filter((b) => b.type === 'Hold');
    for (const c of data.contractions) {
      const hold = holds[c.holdIdx];
      if (!hold) continue;
      const within = c.t - hold.startT;
      if (within < 0) continue;
      elapsedWithinHold.push(within);
    }
  }
  if (elapsedWithinHold.length === 0) return [];
  const max = Math.max(...elapsedWithinHold);
  const bandCount = Math.floor(max / BAND_WIDTH) + 1;
  const bands: ContractionBand[] = [];
  for (let i = 0; i < bandCount; i++) {
    bands.push({ from: i * BAND_WIDTH, to: (i + 1) * BAND_WIDTH, count: 0 });
  }
  for (const e of elapsedWithinHold) {
    const idx = Math.min(Math.floor(e / BAND_WIDTH), bands.length - 1);
    bands[idx].count++;
  }
  return bands;
}

// ── Recovery Time per Hold ──────────────────────────────────────────────────

export interface RecoveryPoint {
  date: string;
  /** Seconds from hold end to first SpO₂ sample back at-or-above the
   *  pre-hold baseline minus 1 percentage point. Null when never recovers
   *  within the recover/rest window (kept out of the series). */
  recoverySec: number;
  /** Longest hold in that session — useful as a colour/size encoding so
   *  shorter holds don't drown out the trend. */
  holdSec: number;
}

const RECOVERY_WINDOW = 180; // seconds after hold end to search

export function recoveryTimePerHold(sessions: ParsedSession[]): RecoveryPoint[] {
  const out: RecoveryPoint[] = [];
  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    const data = extractDrySessionData(s as never);
    if (!data.hasOxy || data.spo2Series.length === 0) continue;
    const holds = data.blocks.filter((b) => b.type === 'Hold');
    for (const h of holds) {
      const baseline = nearest(data.spo2Series, h.startT - 5) ?? nearest(data.spo2Series, h.startT);
      if (baseline == null) continue;
      const target = baseline - 1;
      const recoverTime = firstAtOrAbove(data.spo2Series, h.endT, h.endT + RECOVERY_WINDOW, target);
      if (recoverTime == null) continue;
      const recovery = recoverTime - h.endT;
      if (recovery <= 0) continue;
      out.push({
        date: s.date,
        recoverySec: recovery,
        holdSec: h.endT - h.startT,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ── Dive Reflex: First Minute ───────────────────────────────────────────────

export interface FirstMinutePoint {
  /** Seconds since hold start, 0..60. */
  t: number;
  /** Average HR across all holds at this second. */
  hr: number;
  /** Hold count that contributed at this second (drops near 60s as short
   *  holds end early). Caller can fade the line where this is low. */
  n: number;
}

const FIRST_MINUTE_BIN = 5; // seconds per bin

export function diveReflexFirstMinute(sessions: ParsedSession[]): FirstMinutePoint[] {
  // For each hold, sample HR every FIRST_MINUTE_BIN seconds over [0..60]
  // and accumulate into running sums.
  const slots = Math.floor(60 / FIRST_MINUTE_BIN) + 1; // 0,5,10,…,60
  const sums = new Array(slots).fill(0);
  const counts = new Array(slots).fill(0);

  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    const data = extractDrySessionData(s as never);
    if (!data.hasOxy || data.hrSeries.length === 0) continue;
    const holds = data.blocks.filter((b) => b.type === 'Hold');
    for (const h of holds) {
      const dur = h.endT - h.startT;
      if (dur < 30) continue; // too short to read a dive reflex
      for (let i = 0; i < slots; i++) {
        const t = i * FIRST_MINUTE_BIN;
        if (t > dur) break;
        const hr = nearest(data.hrSeries, h.startT + t);
        if (hr == null || hr <= 0) continue;
        sums[i] += hr;
        counts[i]++;
      }
    }
  }

  const out: FirstMinutePoint[] = [];
  for (let i = 0; i < slots; i++) {
    if (counts[i] === 0) continue;
    out.push({ t: i * FIRST_MINUTE_BIN, hr: sums[i] / counts[i], n: counts[i] });
  }
  return out;
}

// ── HR Drop after Contractions ──────────────────────────────────────────────

export interface HrAroundContraction {
  /** Seconds relative to contraction, -10..+20. */
  t: number;
  /** Average delta (bpm) versus the per-contraction baseline (HR at t=0). */
  delta: number;
  /** Number of contractions that contributed at this second. */
  n: number;
}

const PRE_SEC = 10;
const POST_SEC = 20;

/** For every contraction with enough surrounding HR data, compute the
 *  HR-vs-baseline delta in a [-10, +20] s window and average across all
 *  contractions. A negative delta after t=0 = HR drop (dive reflex
 *  asserting through the contraction); positive = HR ticking up. */
export function hrAroundContractions(sessions: ParsedSession[]): HrAroundContraction[] {
  const span = PRE_SEC + POST_SEC + 1;
  const sums = new Array(span).fill(0);
  const counts = new Array(span).fill(0);

  for (const s of sessions) {
    if (s.mode !== 'dry') continue;
    const data = extractDrySessionData(s as never);
    if (!data.hasOxy || data.hrSeries.length === 0) continue;
    for (const c of data.contractions) {
      const baseline = nearest(data.hrSeries, c.t);
      if (baseline == null || baseline <= 0) continue;
      for (let i = 0; i < span; i++) {
        const dt = i - PRE_SEC;
        const hr = nearest(data.hrSeries, c.t + dt);
        if (hr == null || hr <= 0) continue;
        sums[i] += hr - baseline;
        counts[i]++;
      }
    }
  }

  const out: HrAroundContraction[] = [];
  for (let i = 0; i < span; i++) {
    if (counts[i] === 0) continue;
    out.push({ t: i - PRE_SEC, delta: sums[i] / counts[i], n: counts[i] });
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function nearest(series: [number, number][], t: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [pt, v] of series) {
    const d = Math.abs(pt - t);
    if (d < bestDist) { bestDist = d; best = v; }
  }
  return bestDist <= 5 ? best : null;
}

function firstAtOrAbove(
  series: [number, number][],
  fromT: number,
  toT: number,
  target: number,
): number | null {
  for (const [t, v] of series) {
    if (t < fromT) continue;
    if (t > toT) return null;
    if (v >= target) return t;
  }
  return null;
}
