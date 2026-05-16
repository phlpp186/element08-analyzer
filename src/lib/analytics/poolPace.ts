/**
 * Pool pace progression — average pace (seconds per 100 m) per training
 * dive, over time, grouped by discipline.
 *
 * STA dives (no distance) and warmup/safety/excluded dives are skipped.
 * One series per discipline that has at least one valid dive. Lower
 * values = faster pace; the chart caller should label this clearly.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

type PoolDiscipline = 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';

interface PoolDiveLite {
  discipline: PoolDiscipline;
  distance: number | null;
  diveTime: number;
  diveType?: string | null;
}

export interface PacePoint {
  /** ISO date string. */
  date: string;
  /** Seconds per 100 m. */
  pace: number;
  distance: number;
  diveTime: number;
}

export interface PaceSeries {
  discipline: PoolDiscipline;
  /** ECharts-compatible colour per discipline; matches the palette
   *  conventions used elsewhere (DisciplineProgressionChart etc.). */
  color: string;
  points: PacePoint[];
}

const COLORS: Record<PoolDiscipline, string> = {
  STA:   '#ffd166',
  DYN:   '#00e5cc',
  DYNB:  '#9aa5ff',
  DNF:   '#ff5f9e',
  other: '#888888',
};

const ORDER: PoolDiscipline[] = ['DYN', 'DYNB', 'DNF', 'other'];

export function poolPaceProgression(sessions: ParsedSession[]): PaceSeries[] {
  const buckets = new Map<PoolDiscipline, PacePoint[]>();

  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    const dives = (s as unknown as { dives?: PoolDiveLite[] }).dives ?? [];
    for (const d of dives) {
      if (!includeDive(d.diveType)) continue;
      if (d.discipline === 'STA') continue;
      if (!d.distance || d.distance <= 0 || d.diveTime <= 0) continue;
      const pace = d.diveTime / (d.distance / 100);
      const arr = buckets.get(d.discipline) ?? [];
      arr.push({ date: s.date, pace, distance: d.distance, diveTime: d.diveTime });
      buckets.set(d.discipline, arr);
    }
  }

  // Sort each series chronologically.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  return ORDER.filter((d) => buckets.has(d)).map((d) => ({
    discipline: d,
    color: COLORS[d],
    points: buckets.get(d)!,
  }));
}
