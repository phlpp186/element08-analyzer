/**
 * insightHeadlines — the headline of each Insights tab: four stat blocks and
 * one plain sentence about what stands out (Philipp's option A, 2026-10-22).
 * PURE: built from the numbers the tab's charts already computed, so a block
 * never disagrees with the chart under it.
 */
import type { ParsedSession } from '../../schema/backup';
import type { DepthBin, DisciplineSeries, HangTimeStats, SpeedBand } from './depthInsights';
import type { HoldDurationSeries, RecoveryPoint } from './holdTrends';
import type { Spo2TrendData } from './spo2Zones';
import type { BestRecord } from './poolBests';
import type { DistanceBin } from './poolDistance';
import { parseDurationMinutes, type EffortCount, type TagCount } from './balance';

import type { Tone } from '../tones';

export interface Headline {
  value: string;
  label: string;
  tone: Tone;
}

export interface TabHeadline {
  blocks: Headline[];
  /** One sentence; null when the period has too little to say anything. */
  takeaway: string | null;
}

type T = (s: string) => string;

export type Period = '3m' | '12m' | 'all';

/** Start of the period (ms), or null for all time. */
export function periodStart(period: Period, now = new Date()): number | null {
  if (period === 'all') return null;
  const d = new Date(now);
  d.setMonth(d.getMonth() - (period === '3m' ? 3 : 12));
  return d.getTime();
}

export function sessionsInPeriod(sessions: ParsedSession[], period: Period): ParsedSession[] {
  const start = periodStart(period);
  if (start == null) return sessions;
  return sessions.filter((s) => {
    const t = Date.parse(s.date);
    return Number.isFinite(t) && t >= start;
  });
}

const DASH = '–';

function fmtHold(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);
}

function argmax<X>(xs: X[], key: (x: X) => number): X | null {
  let best: X | null = null;
  for (const x of xs) if (best == null || key(x) > key(best)) best = x;
  return best;
}

// ─── Depth ───────────────────────────────────────────────────────────────────

export function depthHeadline(
  t: T,
  d: {
    bins: DepthBin[];
    bands: SpeedBand[];
    hang: HangTimeStats;
    progression: DisciplineSeries[];
  },
): TabHeadline {
  let deepest: { depth: number; discipline: string } | null = null;
  for (const s of d.progression) {
    for (const p of s.points) {
      if (!deepest || p.depth > deepest.depth) deepest = { depth: p.depth, discipline: s.discipline };
    }
  }
  // Dive-weighted, so a band with one dive does not count as much as one with fifty.
  let speedSum = 0;
  let speedN = 0;
  for (const b of d.bands) {
    if (b.descentSpeed > 0) {
      speedSum += b.descentSpeed * b.count;
      speedN += b.count;
    }
  }
  const total = d.hang.totalDives;
  const blocks: Headline[] = [
    { value: String(total), label: t('Dives'), tone: 'amber' },
    {
      value: deepest ? `${deepest.depth}m` : DASH,
      label: deepest ? `${t('Deepest')} · ${deepest.discipline}` : t('Deepest'),
      tone: 'hero',
    },
    {
      value: speedN > 0 ? `${(speedSum / speedN).toFixed(2)} m/s` : DASH,
      label: t('Avg descent'),
      tone: 'profile',
    },
    {
      value: total > 0 ? `${Math.round((d.hang.divesWithHang / total) * 100)}%` : DASH,
      label: t('Dives with a hang'),
      tone: 'recover',
    },
  ];

  const topBin = argmax(d.bins, (b) => b.count);
  const fastest = argmax(
    d.bands.filter((b) => b.descentSpeed > 0),
    (b) => b.descentSpeed,
  );
  const takeaway =
    total >= 5 && topBin && topBin.count > 0 && fastest
      ? fill(t('Most dives end at {range}; your fastest average descent ({speed}) is on dives to {band}.'), {
          range: `${topBin.from}–${topBin.to} m`,
          speed: `${fastest.descentSpeed.toFixed(2)} m/s`,
          band: `${fastest.band}–${fastest.band + fastest.step} m`,
        })
      : null;
  return { blocks, takeaway };
}

// ─── Breath hold ─────────────────────────────────────────────────────────────

export function breathHoldHeadline(
  t: T,
  d: {
    sessions: ParsedSession[];
    holds: HoldDurationSeries[];
    spo2: Spo2TrendData;
    recovery: RecoveryPoint[];
  },
): TabHeadline {
  const drySessions = d.sessions.filter((s) => s.mode === 'dry').length;
  let longest: { sec: number; date: string } | null = null;
  for (const s of d.holds) {
    for (const p of s.points) {
      if (!longest || p.longestHoldSec > longest.sec) longest = { sec: p.longestHoldSec, date: p.date };
    }
  }
  let lowest: number | null = null;
  for (const p of d.spo2.points) if (lowest == null || p.lowest < lowest) lowest = p.lowest;
  const avgRecovery =
    d.recovery.length > 0
      ? d.recovery.reduce((sum, p) => sum + p.recoverySec, 0) / d.recovery.length
      : null;

  const blocks: Headline[] = [
    { value: String(drySessions), label: t('Dry sessions'), tone: 'highlight' },
    { value: longest ? fmtHold(longest.sec) : DASH, label: t('Longest hold'), tone: 'hero' },
    { value: lowest != null ? `${Math.round(lowest)}%` : DASH, label: t('Lowest SpO₂'), tone: 'red' },
    {
      value: avgRecovery != null ? `${Math.round(avgRecovery)}s` : DASH,
      label: t('Avg recovery'),
      tone: 'recover',
    },
  ];
  const takeaway = longest
    ? fill(t('Your longest hold in this period: {time} on {date}.'), {
        time: fmtHold(longest.sec),
        date: fmtDay(longest.date),
      })
    : null;
  return { blocks, takeaway };
}

// ─── Pool ────────────────────────────────────────────────────────────────────

export function poolHeadline(
  t: T,
  d: { sessions: ParsedSession[]; bests: BestRecord[]; bins: DistanceBin[] },
): TabHeadline {
  let dives = 0;
  let metres = 0;
  for (const s of d.sessions) {
    if (s.mode !== 'pool') continue;
    const list = (s as { dives?: { distance?: unknown }[] }).dives ?? [];
    dives += list.length;
    for (const dv of list) if (typeof dv.distance === 'number' && dv.distance > 0) metres += dv.distance;
  }
  const longest = argmax(
    d.bests.filter((b) => b.unit === 'm'),
    (b) => b.value,
  );
  const sta = d.bests.find((b) => b.unit === 'sec');

  const blocks: Headline[] = [
    { value: String(dives), label: t('Pool dives'), tone: 'highlight' },
    {
      value: longest ? `${Math.round(longest.value)}m` : DASH,
      label: longest ? `${t('Longest dive')} · ${longest.discipline}` : t('Longest dive'),
      tone: 'hero',
    },
    {
      value: metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)}m`,
      label: t('Total distance'),
      tone: 'profile',
    },
    { value: sta ? fmtHold(sta.value) : DASH, label: t('Best static'), tone: 'amber' },
  ];
  const topBin = argmax(d.bins, (b) => b.count);
  const takeaway =
    dives >= 5 && topBin && topBin.count > 0 && longest
      ? fill(t('Most pool dives are {range}; your longest is {dist} ({disc}).'), {
          range: `${topBin.from}–${topBin.to} m`,
          dist: `${Math.round(longest.value)} m`,
          disc: longest.discipline,
        })
      : null;
  return { blocks, takeaway };
}

// ─── Balance ─────────────────────────────────────────────────────────────────

export function balanceHeadline(
  t: T,
  d: {
    sessions: ParsedSession[];
    tags: TagCount[];
    effort: EffortCount[];
    /** Start of the period (ms), null for all time. */
    start: number | null;
    now?: number;
  },
): TabHeadline {
  // Counted from the period's own sessions: the heatmap and weekly-volume
  // charts cover fixed windows (365 days, 26 weeks) that need not match it.
  const days = new Set<string>();
  let minutes = 0;
  let first = Infinity;
  for (const s of d.sessions) {
    const t = Date.parse(s.date);
    if (!Number.isFinite(t)) continue;
    const day = new Date(t);
    days.add(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`);
    minutes += parseDurationMinutes(s.duration);
    if (t < first) first = t;
  }
  const trainingDays = days.size;
  let effortSum = 0;
  let effortN = 0;
  for (const e of d.effort) {
    effortSum += e.rating * e.count;
    effortN += e.count;
  }
  const avgEffort = effortN > 0 ? effortSum / effortN : null;
  // Over every week of the period, quiet ones included; for all time, from
  // the first session on.
  const from = d.start ?? first;
  const weeks = Number.isFinite(from)
    ? Math.max(1, ((d.now ?? Date.now()) - from) / (7 * 24 * 3600 * 1000))
    : 0;
  const perWeek = weeks > 0 ? minutes / weeks : null;

  const blocks: Headline[] = [
    { value: String(d.sessions.length), label: t('Sessions'), tone: 'highlight' },
    { value: String(trainingDays), label: t('Training days'), tone: 'accent' },
    { value: avgEffort != null ? `${avgEffort.toFixed(1)}/10` : DASH, label: t('Avg effort'), tone: 'amber' },
    { value: perWeek != null ? `${Math.round(perWeek)} min` : DASH, label: t('Minutes per week'), tone: 'profile' },
  ];
  const topTag = argmax(d.tags, (x) => x.count);
  const takeaway =
    topTag && topTag.count > 0 && avgEffort != null
      ? fill(t('Your most common session type: {tag}; average effort {effort}/10.'), {
          tag: t(topTag.label),
          effort: avgEffort.toFixed(1),
        })
      : null;
  return { blocks, takeaway };
}
