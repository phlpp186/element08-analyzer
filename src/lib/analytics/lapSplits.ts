/**
 * lapSplits — one pool dive broken into its laps: how long each took, and how
 * many strokes went into it.
 *
 * This is the number a coach actually wants from a dynamic. A 100 m DNF in
 * 1:52 says almost nothing; the same dive as 26 s / 27 s / 28 s / 31 s says
 * where it went, and adding 14 / 14 / 15 / 18 strokes says whether the last lap
 * was slower because the stroke rate fell or because each stroke stopped
 * carrying as far. Neither is visible in any total.
 *
 * WHERE THE TWO HALVES COME FROM, AND WHY THEY ARE GATED SEPARATELY:
 *
 *   · LAP TIMES come from `dive.lapTimes`, the app's own splits. They are the
 *     authority, whether the watch measured them or the diver typed them.
 *
 *   · STROKE COUNTS come from the motion trace, and ONLY when two conditions
 *     hold. The diver must have confirmed their marks (`traceEdits`), because
 *     the detector cannot tell an arm stroke from a kick and its raw stroke
 *     marks are hidden everywhere else in the app for exactly that reason. And
 *     the confirmed turn count must MATCH the lap count, because strokes are
 *     assigned to laps positionally: if the two disagree about how many laps
 *     there were, every count after the disagreement lands on the wrong lap. A
 *     missing stroke count is obvious; a plausible wrong one is not, and this
 *     codebase has paid for that distinction before (fitParser `distsAligned`).
 */

export interface LapSplit {
  /** 1-based lap number. */
  lap: number;
  seconds: number;
  /** Arm strokes inside this lap, or null when they could not be attributed. */
  strokes: number | null;
}

interface LapDiveLike {
  lapTimes?: number[];
  traceEdits?: { startT: number; endT: number; turns: number[]; strokes: number[] } | null;
}

/** Count marks in [from, to). The final lap takes its upper bound inclusive so
 *  a stroke exactly on the dive's last sample is not silently dropped. */
function countBetween(marks: number[], from: number, to: number, last: boolean): number {
  return marks.filter((m) => m >= from && (last ? m <= to : m < to)).length;
}

export function lapSplits(dive: LapDiveLike): LapSplit[] {
  const times = Array.isArray(dive.lapTimes)
    ? dive.lapTimes.filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    : [];
  if (times.length === 0) return [];

  const edits = dive.traceEdits ?? null;
  const turns = edits?.turns ?? [];
  const strokes = edits?.strokes ?? [];
  // One turn between each pair of laps, so n laps need n-1 turns to align.
  const aligned = edits != null && turns.length === times.length - 1 && strokes.length > 0;

  const bounds: number[] = aligned
    ? [edits!.startT, ...[...turns].sort((a, b) => a - b), edits!.endT]
    : [];

  return times.map((seconds, i) => ({
    lap: i + 1,
    seconds,
    strokes: aligned
      ? countBetween(strokes, bounds[i], bounds[i + 1], i === times.length - 1)
      : null,
  }));
}
