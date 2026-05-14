/**
 * diveCatalog — flat, cross-session lists for the /compare/dives picker,
 * one builder per compare mode.
 *
 *   - depth: one entry per depth dive. Dives without a renderable profile
 *     are flagged `disabled` (nothing to overlay).
 *   - pool:  one entry per pool dive. Always selectable — even profile-less
 *     dives contribute distance / time / rating to the comparison.
 *   - holds: one entry per Hold block inside a dry session, found by
 *     walking blockTimeline. Always selectable — oximeter-less holds still
 *     contribute duration / contractions / rating.
 *
 * Every builder returns the same `CatalogEntry` shape so the picker UI is
 * mode-agnostic.
 */
import type { ParsedSession } from '../../schema/backup';
import type { CompareMode } from '../../stores/useDiveCompareStore';
import { formatDate } from '../format';

export interface CatalogEntry {
  sessionId: number;
  /** diveIdx for depth/pool, holdIdx for holds. */
  idx: number;
  date: string;
  /** Bold primary line, e.g. "CWT · 74m" or "Hold · 1:58". */
  line1: string;
  /** Dim secondary line, e.g. "Mar 16, 2026" or "Mar 16 · no profile". */
  line2: string;
  /** Lowercased haystack for free-text filtering. */
  search: string;
  /** True only when the entry can't be drawn (depth dive with no profile). */
  disabled: boolean;
}

export function buildCatalog(
  sessions: ParsedSession[],
  mode: CompareMode,
): CatalogEntry[] {
  const out =
    mode === 'depth'
      ? buildDepth(sessions)
      : mode === 'pool'
        ? buildPool(sessions)
        : buildHolds(sessions);
  // Most recent session first; original order preserved within a session.
  out.sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate !== 0 ? byDate : a.idx - b.idx;
  });
  return out;
}

function buildDepth(sessions: ParsedSession[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const session of sessions) {
    if (session.mode !== 'depth') continue;
    const dives = (session as { dives?: Record<string, unknown>[] }).dives;
    if (!dives) continue;
    dives.forEach((dive, idx) => {
      const profile = (dive as { profile?: unknown[] }).profile;
      const hasProfile = Array.isArray(profile) && profile.length >= 2;
      const discipline = (dive.discipline as string) || 'Depth dive';
      const depth = typeof dive.depth === 'number' ? dive.depth : 0;
      out.push({
        sessionId: session.id,
        idx,
        date: session.date,
        line1: `${discipline} · ${depth}m`,
        line2: `${formatDate(session.date)}${hasProfile ? '' : ' · no profile'}`,
        search: `${formatDate(session.date)} ${discipline} ${depth}m ${session.name}`.toLowerCase(),
        disabled: !hasProfile,
      });
    });
  }
  return out;
}

function buildPool(sessions: ParsedSession[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const session of sessions) {
    if (session.mode !== 'pool') continue;
    const dives = (session as { dives?: Record<string, unknown>[] }).dives;
    if (!dives) continue;
    dives.forEach((dive, idx) => {
      const discipline = (dive.discipline as string) || 'Pool dive';
      const distance = typeof dive.distance === 'number' ? dive.distance : null;
      const hasHr =
        Array.isArray((dive as { profile?: unknown[] }).profile) ||
        Array.isArray((dive as { hrProfile?: unknown[] }).hrProfile);
      const distLabel = distance != null ? `${distance}m` : 'static';
      out.push({
        sessionId: session.id,
        idx,
        date: session.date,
        line1: `${discipline} · ${distLabel}`,
        line2: `${formatDate(session.date)}${hasHr ? '' : ' · no HR'}`,
        search: `${formatDate(session.date)} ${discipline} ${distLabel} ${session.name}`.toLowerCase(),
        disabled: false,
      });
    });
  }
  return out;
}

function buildHolds(sessions: ParsedSession[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const session of sessions) {
    if (session.mode !== 'dry') continue;
    const timeline =
      (session as { blockTimeline?: { type?: string; seconds?: number }[] })
        .blockTimeline ?? [];
    const hasOxy =
      ((session as { oxyReadings?: unknown[] }).oxyReadings?.length ?? 0) > 0;
    let holdIdx = 0;
    for (const block of timeline) {
      if (block.type !== 'Hold') continue;
      const seconds = typeof block.seconds === 'number' ? block.seconds : 0;
      out.push({
        sessionId: session.id,
        idx: holdIdx,
        date: session.date,
        line1: `Hold ${holdIdx + 1} · ${fmtDur(seconds)}`,
        line2: `${formatDate(session.date)} · ${session.name}${hasOxy ? '' : ' · no oximeter'}`,
        search: `${formatDate(session.date)} hold ${fmtDur(seconds)} ${session.name}`.toLowerCase(),
        disabled: false,
      });
      holdIdx++;
    }
  }
  return out;
}

function fmtDur(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
