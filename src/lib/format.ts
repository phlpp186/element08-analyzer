/**
 * Presentation helpers — pure formatters used across views.
 *
 * Kept here (not in components) so they can be unit-tested without touching
 * React, and so each component pulls the same single source of truth.
 */
import type { ParsedSession } from '../schema/backup';

const MODE_LABELS: Record<ParsedSession['mode'], string> = {
  dry: 'Dry',
  depth: 'Depth',
  pool: 'Pool',
};

const MODE_COLORS: Record<ParsedSession['mode'], string> = {
  dry: 'text-recover',     // green
  depth: 'text-accent',    // blue
  pool: 'text-highlight',  // pink
};

export function modeLabel(mode: ParsedSession['mode']): string {
  return MODE_LABELS[mode];
}

export function modeColorClass(mode: ParsedSession['mode']): string {
  return MODE_COLORS[mode];
}

/** Compact human-readable date: "May 13, 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** A short type-specific summary line for the session-list row. */
export function summaryLine(s: ParsedSession): string {
  if (s.mode === 'dry') {
    return `${s.cyclesCount} hold${s.cyclesCount === 1 ? '' : 's'} · ${s.duration}`;
  }
  if (s.mode === 'depth') {
    const diveCount = s.dives?.length ?? s.blocks;
    return `${diveCount} dive${diveCount === 1 ? '' : 's'} · max ${s.maxDepth}m · ${s.duration}`;
  }
  // pool
  const diveCount = s.dives?.length ?? s.blocks;
  return `${diveCount} dive${diveCount === 1 ? '' : 's'} · ${s.totalDistance}m · ${s.duration}`;
}
