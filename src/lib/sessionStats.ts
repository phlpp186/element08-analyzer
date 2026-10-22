/**
 * The session page's figures: six blocks per mode, the gear line and the
 * per-item bars (Philipp's option A with the overlay, 2026-10-22). PURE.
 */
import type { ParsedSession } from '../schema/backup';
import { includeDive } from './analytics/diveFilter';
import type { Tone } from './tones';
import { sessionBest } from './sessionMonth';

type T = (s: string) => string;

export interface StatBlock {
  label: string;
  value: string;
  tone: Tone;
}

type Dive = {
  depth?: number;
  distance?: number | null;
  diveTime?: number;
  descentSpeed?: number | null;
  si?: number | null;
  discipline?: string;
  diveType?: string | null;
};

export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function allDives(s: ParsedSession): Dive[] {
  return (s as { dives?: Dive[] }).dives ?? [];
}

/** The dives the averages count: warm-ups and safeties left out. */
function counted(s: ParsedSession): Dive[] {
  return allDives(s).filter((d) => includeDive(d.diveType));
}

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Surface intervals: the first dive's is the time before it, not a rest
 *  between dives, so it stays out of the average. */
function avgSi(dives: Dive[]): number | null {
  return mean(
    dives
      .slice(1)
      .map((d) => d.si)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );
}

export function holds(s: ParsedSession): number[] {
  const tl = (s as { blockTimeline?: { type?: string; seconds?: number }[] }).blockTimeline ?? [];
  return tl.filter((b) => b.type === 'Hold' && typeof b.seconds === 'number').map((b) => b.seconds as number);
}

export function sessionBlocks(s: ParsedSession, t: T): StatBlock[] {
  const effort: StatBlock = { label: t('Effort'), value: s.rating != null ? `${s.rating}/10` : '–', tone: 'amber' };
  const time: StatBlock = { label: t('Session'), value: s.duration || '–', tone: 'recover' };
  const best = sessionBest(s);
  if (s.mode === 'depth') {
    const dives = counted(s);
    const desc = mean(dives.map((d) => d.descentSpeed).filter((v): v is number => typeof v === 'number' && v > 0));
    // Rest between dives includes the warm-ups, so the interval uses them all.
    const si = avgSi(allDives(s));
    return [
      // Every dive the list shows, warm-ups too.
      { label: t('Dives'), value: String(allDives(s).length), tone: 'highlight' },
      { label: t('Deepest'), value: best?.text ?? '–', tone: 'hero' },
      time,
      { label: t('Avg descent'), value: desc != null ? `${desc.toFixed(2)} m/s` : '–', tone: 'profile' },
      { label: t('Avg SI'), value: si != null ? clock(si) : '–', tone: 'accent' },
      effort,
    ];
  }
  if (s.mode === 'pool') {
    const dives = counted(s);
    const swims = (list: Dive[]) =>
      list.filter((d) => d.discipline !== 'STA' && typeof d.distance === 'number' && d.distance > 0);
    // The total is everything swum (as the session list says); the pace
    // only the counted dives, warm-ups are slow on purpose.
    const metres = swims(allDives(s)).reduce((a, d) => a + (d.distance ?? 0), 0);
    const moving = swims(dives);
    const paceM = moving.reduce((a, d) => a + (d.distance ?? 0), 0);
    const secs = moving.reduce((a, d) => a + (d.diveTime ?? 0), 0);
    const si = avgSi(allDives(s));
    return [
      { label: t('Dives'), value: String(allDives(s).length), tone: 'highlight' },
      { label: t('Longest'), value: best?.text ?? '–', tone: 'hero' },
      { label: t('Total distance'), value: metres > 0 ? `${Math.round(metres)}m` : '–', tone: 'profile' },
      { label: t('Avg pace'), value: paceM > 0 && secs > 0 ? `${clock((secs / paceM) * 100)}/100m` : '–', tone: 'accent' },
      { label: t('Avg SI'), value: si != null ? clock(si) : '–', tone: 'recover' },
      effort,
    ];
  }
  const hs = holds(s);
  const avgHold = mean(hs);
  return [
    { label: t('Holds'), value: String(hs.length), tone: 'highlight' },
    { label: t('Longest hold'), value: best?.text ?? '–', tone: 'hero' },
    time,
    { label: t('Avg hold'), value: avgHold != null ? clock(avgHold) : '–', tone: 'profile' },
    { label: t('Breathing'), value: s.breathingStyle ? t(s.breathingStyle) : '–', tone: 'accent' },
    effort,
  ];
}

/** Gear and place as short chips: "3 mm wetsuit", "2 kg", "Blue Hole". */
export function sessionGear(s: ParsedSession, t: T): string[] {
  const out: string[] = [];
  const loc = (s as { location?: string | null }).location?.trim();
  if (loc) out.push(loc);
  const suit = (s as { suit?: { kind?: string; mm?: number } | null }).suit;
  if (suit && (suit.mm != null || suit.kind)) {
    out.push([suit.mm != null ? `${suit.mm} mm` : '', suit.kind ? t(suit.kind) : ''].filter(Boolean).join(' '));
  }
  const kg = (s as { weightKg?: number | null }).weightKg;
  if (typeof kg === 'number' && kg > 0) out.push(`${kg} kg`);
  if (s.sessionTag) out.push(s.sessionTag.replace(/_/g, ' '));
  return out;
}
