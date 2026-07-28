import type { Contraction, BlockEntry } from '../appTypes';

/**
 * Resolve a contraction's absolute timestamp in ms within a session.
 * Handles both new format (elapsed is session-absolute) and old format
 * (elapsed is block-local).
 */
export function resolveContractionMs(c: Contraction, blockTimeline: BlockEntry[]): number {
  if (!blockTimeline || !blockTimeline.length) return c.elapsed * 1000;

  let cursor = 0;
  let holdIdx = 0;
  for (const b of blockTimeline) {
    // Real-time block span includes any pause that happened during the
    // block — block.seconds alone counts only running-timer time.
    const blockSpanSec = b.seconds + (b.pausedMs ?? 0) / 1000;
    const startMs = cursor * 1000;
    const endMs = (cursor + blockSpanSec) * 1000;
    if (b.type === 'Hold') {
      if (holdIdx === c.holdIdx) {
        const TOL = 5000;
        // If elapsed*1000 falls within the hold window → new format
        if (c.elapsed * 1000 >= startMs - TOL && c.elapsed * 1000 <= endMs + TOL) {
          return c.elapsed * 1000;
        }
        // Otherwise old format: elapsed is block-local, add hold startMs
        return startMs + c.elapsed * 1000;
      }
      holdIdx++;
    }
    cursor += blockSpanSec;
  }
  return c.elapsed * 1000; // fallback
}
