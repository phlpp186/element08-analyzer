/**
 * Pool discipline bests — for each discipline (STA / DYN / DYNB / DNF /
 * other), find the longest hold (STA) or furthest distance (DYN-family),
 * plus when it happened.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

type PoolDiscipline = 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';

export interface BestRecord {
  discipline: PoolDiscipline;
  /** STA: hold time in seconds. DYN-family: distance in metres. */
  value: number;
  unit: 'sec' | 'm';
  /** ISO date string of the session this dive came from. */
  date: string;
  /** Session name for context in the UI ("Tuesday morning training"). */
  sessionName: string;
}

interface PoolDiveLite {
  discipline: PoolDiscipline;
  distance: number | null;
  diveTime: number;
  diveType?: string | null;
}

const ORDER: PoolDiscipline[] = ['STA', 'DYN', 'DYNB', 'DNF', 'other'];

/** Returns one entry per discipline that has at least one valid dive.
 *  Ordered by ORDER so the UI list reads consistently. */
export function disciplineBests(sessions: ParsedSession[]): BestRecord[] {
  // Per-discipline running best.
  const best = new Map<PoolDiscipline, BestRecord>();

  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    const sessionName = s.name || 'Pool session';
    const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];

    for (const d of dives) {
      // Warmup / safety / excluded dives shouldn't count as a PB.
      if (!includeDive(d.diveType)) continue;
      const disc = d.discipline;
      // STA uses time; everything else uses distance.
      const isSta = disc === 'STA';
      const value = isSta ? d.diveTime : (d.distance ?? 0);
      if (value <= 0) continue;

      const current = best.get(disc);
      if (!current || value > current.value) {
        best.set(disc, {
          discipline: disc,
          value,
          unit: isSta ? 'sec' : 'm',
          date: s.date,
          sessionName,
        });
      }
    }
  }

  return ORDER.filter((d) => best.has(d)).map((d) => best.get(d)!);
}

export function fmtBestValue(b: BestRecord): string {
  if (b.unit === 'sec') {
    const m = Math.floor(b.value / 60);
    const s = Math.round(b.value % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${b.value}m`;
}
