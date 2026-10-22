/**
 * Quick picks for the Compare pages: one tap fills a comparison (Philipp's
 * option B, 2026-10-22). PURE.
 *
 * Dives: built from the picker's own catalog, so a quick pick never offers
 * what the picker could not draw (a depth dive without a profile).
 * Seasons: period pairs anchored on the latest session (or today, if
 * earlier), so a logbook that stopped in May still compares May.
 */
import type { ParsedSession } from '../../schema/backup';
import type { CompareMode } from '../../stores/useDiveCompareStore';
import type { CatalogEntry } from './diveCatalog';
import type { Period } from './periodCompare';

export interface Pick {
  sessionId: number;
  idx: number;
}

export interface DiveQuickPick {
  id: string;
  label: string;
  picks: Pick[];
}

type T = (s: string) => string;

const toPick = (e: CatalogEntry): Pick => ({ sessionId: e.sessionId, idx: e.idx });

function topBy(entries: CatalogEntry[], n: number): CatalogEntry[] {
  return entries
    .filter((e) => e.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, n);
}

/** The latest session's entries, best first, at most `n`. */
function lastSession(entries: CatalogEntry[], n: number): CatalogEntry[] {
  let latest: CatalogEntry | null = null;
  for (const e of entries) if (!latest || e.date > latest.date) latest = e;
  if (!latest) return [];
  const id = latest.sessionId;
  return topBy(
    entries.filter((e) => e.sessionId === id),
    n,
  );
}

/** In the most-logged discipline: its latest PB and the PB before it. */
function latestPbPair(entries: CatalogEntry[]): CatalogEntry[] {
  const disc = mostLogged(entries);
  const chrono = entries
    .filter((e) => e.discipline === disc && e.value != null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx);
  const pbs: CatalogEntry[] = [];
  let best = 0;
  for (const e of chrono) {
    if ((e.value ?? 0) > best + 0.05) {
      best = e.value ?? 0;
      pbs.push(e);
    }
  }
  return pbs.length >= 2 ? [pbs[pbs.length - 2], pbs[pbs.length - 1]] : [];
}

function mostLogged(entries: CatalogEntry[]): string | null {
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.discipline, (count.get(e.discipline) ?? 0) + 1);
  let disc: string | null = null;
  for (const [d, n] of count) if (disc == null || n > (count.get(disc) ?? 0)) disc = d;
  return disc;
}

export function diveQuickPicks(
  catalog: CatalogEntry[],
  mode: CompareMode,
  max: number,
  t: T,
): DiveQuickPick[] {
  const usable = catalog.filter((e) => !e.disabled);
  const out: DiveQuickPick[] = [];
  const add = (id: string, label: string, entries: CatalogEntry[]) => {
    if (entries.length >= 2) out.push({ id, label, picks: entries.map(toPick) });
  };
  if (mode === 'depth') {
    const disc = mostLogged(usable);
    if (disc) {
      add(
        'deepest',
        t('My 3 deepest {disc}').replace('{disc}', disc),
        topBy(
          usable.filter((e) => e.discipline === disc),
          3,
        ),
      );
    }
    add('pb', t('Latest PB vs the one before'), latestPbPair(usable));
    add('last', t('Last session’s dives'), lastSession(usable, max));
  } else if (mode === 'pool') {
    add('longest', t('My 3 longest dives'), topBy(usable, 3));
    add('pb', t('Latest PB vs the one before'), latestPbPair(usable));
    add('last', t('Last session’s dives'), lastSession(usable, max));
  } else {
    add('longest', t('My 3 longest holds'), topBy(usable, 3));
    add('last', t('Last session’s holds'), lastSession(usable, max));
  }
  return out;
}

// ─── Seasons ─────────────────────────────────────────────────────────────────

export type SeasonPreset = 'last12' | 'year' | 'months3';

const DAY = 24 * 3600 * 1000;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The latest session's day, or today when that is earlier. */
export function anchorDay(sessions: ParsedSession[], now = new Date()): Date {
  let latest = 0;
  for (const s of sessions) {
    const t = Date.parse(s.date);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  const a = new Date(latest > 0 ? Math.min(latest, now.getTime()) : now.getTime());
  return new Date(a.getFullYear(), a.getMonth(), a.getDate());
}

function shiftYears(d: Date, years: number): Date {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}

/** The two periods of a preset: the recent one first (the scoreboard's
 *  "now"), the one it is measured against second. */
export function seasonPreset(
  sessions: ParsedSession[],
  preset: SeasonPreset,
  t: T,
  now = new Date(),
): Period[] {
  const a = anchorDay(sessions, now);
  const mk = (id: string, label: string, color: string, anchor: Date, weeks: number): Period => ({
    id,
    label,
    color,
    anchorDate: iso(anchor),
    weeksBefore: weeks,
  });
  if (preset === 'year') {
    // The year so far against the same weeks of the year before.
    const jan1 = new Date(a.getFullYear(), 0, 1);
    const weeks = Math.max(1, Math.ceil((a.getTime() - jan1.getTime() + DAY) / (7 * DAY)));
    return [
      mk('year-now', t('{year} so far').replace('{year}', String(a.getFullYear())), '#1bafe0', a, weeks),
      mk(
        'year-before',
        t('{year}, same weeks').replace('{year}', String(a.getFullYear() - 1)),
        '#8a5fd6',
        shiftYears(a, -1),
        weeks,
      ),
    ];
  }
  if (preset === 'months3') {
    return [
      mk('m3-now', t('Last 3 months'), '#1bafe0', a, 13),
      mk('m3-before', t('Same months last year'), '#8a5fd6', shiftYears(a, -1), 13),
    ];
  }
  return [
    mk('l12-now', t('Last 12 weeks'), '#1bafe0', a, 12),
    mk('l12-before', t('The 12 weeks before'), '#8a5fd6', new Date(a.getTime() - 84 * DAY), 12),
  ];
}
