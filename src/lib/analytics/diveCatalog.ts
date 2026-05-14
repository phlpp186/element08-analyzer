/**
 * diveCatalog — flat, cross-session list of every depth dive in the loaded
 * backup, for the /compare/dives picker.
 *
 * Each entry carries enough to label and select a dive without re-walking
 * the session tree. Dives without a usable profile (<2 points) are still
 * listed but flagged `hasProfile: false` so the picker can disable them —
 * they can't be drawn on the overlay.
 */
import type { ParsedSession } from '../../schema/backup';
import { formatDate } from '../format';

export interface CatalogDive {
  sessionId: number;
  diveIdx: number;
  sessionName: string;
  /** ISO date string from the parent session. */
  date: string;
  discipline: string;
  depth: number;
  diveTime: number;
  /** False when the dive has no renderable depth profile. */
  hasProfile: boolean;
}

export function buildDiveCatalog(sessions: ParsedSession[]): CatalogDive[] {
  const out: CatalogDive[] = [];
  for (const session of sessions) {
    if (session.mode !== 'depth') continue;
    const dives = (session as { dives?: Record<string, unknown>[] }).dives;
    if (!dives) continue;
    dives.forEach((dive, diveIdx) => {
      const profile = (dive as { profile?: unknown[] }).profile;
      out.push({
        sessionId: session.id,
        diveIdx,
        sessionName: session.name || 'Session',
        date: session.date,
        discipline: (dive.discipline as string) || 'Depth dive',
        depth: typeof dive.depth === 'number' ? dive.depth : 0,
        diveTime: typeof dive.diveTime === 'number' ? dive.diveTime : 0,
        hasProfile: Array.isArray(profile) && profile.length >= 2,
      });
    });
  }
  // Most recent session first; dive order preserved within a session.
  out.sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate !== 0 ? byDate : a.diveIdx - b.diveIdx;
  });
  return out;
}

/** Short one-line label: "May 16, 2026 · CWT · 74m". */
export function formatDiveLabel(d: CatalogDive): string {
  return `${formatDate(d.date)} · ${d.discipline} · ${d.depth}m`;
}

/** Lowercased haystack for free-text filtering in the picker. */
export function diveSearchText(d: CatalogDive): string {
  return `${formatDate(d.date)} ${d.discipline} ${d.depth}m ${d.sessionName}`.toLowerCase();
}
