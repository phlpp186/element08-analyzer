/**
 * The Progress page's season story (Philipp's option A, 2026-10-22): the
 * last 12 months in one line (headline depth PB and its gain, longest
 * static, furthest pool dive, session count) and every PB of those months
 * on one timeline, all disciplines together. PURE.
 *
 * A PB is a new best for its discipline over the WHOLE logbook, so the
 * running best starts before the window: a dive in the window that only
 * beats this year's earlier dives is not a PB. A discipline's first result
 * sets the bar and is not a PB: a logbook started in May otherwise opened
 * with a run of trivial "PBs" (a first 1:00 static) that took the badges.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';
import { disciplineColor } from './depthInsights';

const DAY = 24 * 3600 * 1000;

export type PbKind = 'depth' | 'pool' | 'hold';

export interface PbEvent {
  /** ms */
  t: number;
  kind: PbKind;
  /** CWT, DYN, ... or STA for every breath hold. */
  discipline: string;
  value: number;
  text: string;
  color: string;
  /** The discipline's best to date: no later PB beat it. */
  current: boolean;
}

export interface SeasonStory {
  from: number;
  to: number;
  sessions: number;
  /** The depth discipline that gained most in the window. */
  depth: { discipline: string; best: number; gain: number | null } | null;
  /** Longest hold (dry or pool static) in the window. */
  hold: number | null;
  /** Furthest pool dive in the window. */
  pool: { discipline: string; best: number } | null;
  events: PbEvent[];
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

type Dive = { depth?: number; distance?: number | null; diveTime?: number; discipline?: string; diveType?: string | null };

/** Every candidate result, oldest first: one per counted dive or hold. */
function results(sessions: ParsedSession[]) {
  const out: { t: number; kind: PbKind; discipline: string; value: number }[] = [];
  for (const s of sessions) {
    const t = Date.parse(s.date);
    if (!Number.isFinite(t)) continue;
    if (s.mode === 'dry') {
      const tl = (s as { blockTimeline?: { type?: string; seconds?: number }[] }).blockTimeline ?? [];
      for (const b of tl) {
        if (b.type === 'Hold' && typeof b.seconds === 'number' && b.seconds > 0) {
          out.push({ t, kind: 'hold', discipline: 'STA', value: b.seconds });
        }
      }
      continue;
    }
    for (const d of (s as { dives?: Dive[] }).dives ?? []) {
      if (!includeDive(d.diveType) || !d.discipline) continue;
      if (s.mode === 'depth' && typeof d.depth === 'number' && d.depth > 0) {
        out.push({ t, kind: 'depth', discipline: d.discipline, value: d.depth });
      } else if (s.mode === 'pool') {
        if (d.discipline === 'STA' && typeof d.diveTime === 'number' && d.diveTime > 0) {
          out.push({ t, kind: 'hold', discipline: 'STA', value: d.diveTime });
        } else if (typeof d.distance === 'number' && d.distance > 0) {
          out.push({ t, kind: 'pool', discipline: d.discipline, value: d.distance });
        }
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The window ends at the latest session, or today if that is earlier. */
export function seasonStory(sessions: ParsedSession[], now = new Date()): SeasonStory {
  let latest = 0;
  for (const s of sessions) {
    const t = Date.parse(s.date);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  const to = latest > 0 ? Math.min(latest, now.getTime()) : now.getTime();
  const from = to - 365 * DAY;

  const best = new Map<string, number>();
  const bestBefore = new Map<string, number>();
  const events: PbEvent[] = [];
  let hold: number | null = null;
  let pool: { discipline: string; best: number } | null = null;
  const depthBest = new Map<string, number>();

  for (const r of results(sessions)) {
    const key = `${r.kind}:${r.discipline}`;
    const prev = best.get(key) ?? 0;
    // Margins against a re-logged equal value counting as a new best.
    const margin = r.kind === 'depth' ? 0.05 : 0.5;
    const inWindow = r.t >= from && r.t <= to;
    if (!inWindow && r.t < from) bestBefore.set(key, Math.max(bestBefore.get(key) ?? 0, r.value));
    if (r.value > prev + margin) {
      best.set(key, r.value);
      if (inWindow && prev > 0) {
        events.push({
          t: r.t,
          kind: r.kind,
          discipline: r.discipline,
          value: r.value,
          text: r.kind === 'hold' ? mmss(r.value) : `${Math.round(r.value * 10) / 10}m`,
          color: disciplineColor(r.discipline),
          current: false,
        });
      }
    }
    if (!inWindow) continue;
    if (r.kind === 'hold' && (hold == null || r.value > hold)) hold = r.value;
    if (r.kind === 'pool' && (pool == null || r.value > pool.best)) pool = { discipline: r.discipline, best: r.value };
    if (r.kind === 'depth') depthBest.set(r.discipline, Math.max(depthBest.get(r.discipline) ?? 0, r.value));
  }

  // The headline discipline: the biggest gain over the best before the
  // window; a discipline new this year counts by its own best.
  let depth: SeasonStory['depth'] = null;
  for (const [disc, b] of depthBest) {
    const before = bestBefore.get(`depth:${disc}`);
    const gain = before != null ? b - before : null;
    const score = gain ?? 0;
    const cur = depth ? (depth.gain ?? 0) : -Infinity;
    if (!depth || score > cur || (score === cur && b > depth.best)) {
      depth = { discipline: disc, best: b, gain };
    }
  }

  // Each discipline's last PB is its current best.
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const key = `${events[i].kind}:${events[i].discipline}`;
    if (!seen.has(key)) {
      seen.add(key);
      events[i].current = true;
    }
  }

  const sessionCount = sessions.filter((s) => {
    const t = Date.parse(s.date);
    return Number.isFinite(t) && t >= from && t <= to;
  }).length;

  return { from, to, sessions: sessionCount, depth, hold, pool, events };
}
