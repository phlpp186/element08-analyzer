/**
 * poolTrace — the per-dive MOTION signal (the app's "A-channel") that an
 * ELEMENT | 08 watch sends alongside a pool dive, prepared for the coach's
 * read-only view.
 *
 * This is the half of a pool dive the portal could never show. The HR chart
 * beside it answers "how hard was that"; this answers "what did they actually
 * do" — where the turns were, how the strokes were spaced, whether the heading
 * stepped cleanly at each wall. On a DNF it is the whole dive.
 *
 * THE TIMEBASE IS NOT THE HR TIMEBASE. Channel sample `i` sits at `i / hz`
 * seconds from the WINDOW start, and the window is padded around the dive, so
 * these seconds are offset from the dive-relative `t` in `profile`/`hrProfile`.
 * The two must never share an axisPointer link — see PoolSignalTracks, which
 * connects the signal tracks to their own chart group.
 *
 * Marks follow the mobile app's rule: the diver's own corrections win, and the
 * detector's marks only show while the diver has not made any (`traceEdits`
 * absent). Detected STROKES are not surfaced at all, matching the app's V1
 * gate — the detector cannot tell an arm stroke from a kick, so its stroke
 * marks are the app's least trustworthy output and the athlete cannot see them
 * either.
 */

/** `PoolDive.trace` as it arrives in an attached-session blob (the wire's
 *  DiveSignalTrace). Every field optional: old builds sent fewer. */
export interface DiveSignalTraceLike {
  accel?: number[];
  gyro?: number[];
  heading?: number[];
  /** Tilt-compensated magnetometer heading. FIT imports only. */
  magHeading?: number[];
  turns?: number[];
  strokes?: number[];
  kicks?: number[];
  hz?: number;
  /** 1 = the heading channel is compass, absent = integrated gyro (drifts). */
  hs?: number;
  magQ?: { stability: number; horizontal: number; usable: boolean; reason: string };
}

/** `PoolDive.traceEdits` — what the diver said, in window-relative seconds. */
export interface TraceEditsLike {
  startT: number;
  endT: number;
  turns: number[];
  strokes: number[];
  kicks: number[];
}

export interface TraceDiveLike {
  trace?: DiveSignalTraceLike | null;
  traceEdits?: TraceEditsLike | null;
}

export interface PoolTraceData {
  accel: [number, number][];
  gyro: [number, number][];
  heading: [number, number][];
  magHeading: [number, number][];
  turns: number[];
  strokes: number[];
  kicks: number[];
  /** True when the marks are the diver's own confirmed ones. False = the
   *  detector's proposal, which the charts draw dashed. */
  confirmed: boolean;
  /** The diver's corrected dive bracket, when they trimmed one. Everything
   *  outside it is shaded: it is window padding, not dive. */
  bracket: { start: number; end: number } | null;
  /** Full window, seconds. */
  startT: number;
  endT: number;
  /** What drew the heading channel. A gyro heading drifts 9-17 deg/s, so a
   *  slanting baseline there is the instrument, not the diver. */
  headingSource: 'compass' | 'gyro';
  magQ?: DiveSignalTraceLike['magQ'];
}

/** Channel samples -> [seconds, value] pairs on the window timebase. */
function toSeries(ch: number[] | undefined, hz: number): [number, number][] {
  if (!Array.isArray(ch) || ch.length < 2) return [];
  const out: [number, number][] = new Array(ch.length);
  for (let i = 0; i < ch.length; i++) out[i] = [i / hz, ch[i]];
  return out;
}

function cleanMarks(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && n >= 0) : [];
}

/**
 * Returns null when there is nothing trustworthy to draw.
 *
 * A trace with no usable `hz` is one of those cases, and deliberately so: the
 * marks are in real seconds while the channels are in samples, so guessing a
 * rate would draw turn lines that land in the wrong place on a chart that
 * otherwise looks perfectly convincing. A missing chart is obvious; a
 * plausible wrong one is not.
 */
export function extractPoolTraceData(dive: TraceDiveLike): PoolTraceData | null {
  const tr = dive.trace;
  if (!tr) return null;
  const hz = tr.hz;
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) return null;

  const accel = toSeries(tr.accel, hz);
  const gyro = toSeries(tr.gyro, hz);
  const heading = toSeries(tr.heading, hz);
  const magHeading = toSeries(tr.magHeading, hz);
  if (accel.length === 0 && gyro.length === 0 && heading.length === 0 && magHeading.length === 0) {
    return null;
  }

  const endT = Math.max(
    accel.length > 0 ? accel[accel.length - 1][0] : 0,
    gyro.length > 0 ? gyro[gyro.length - 1][0] : 0,
    heading.length > 0 ? heading[heading.length - 1][0] : 0,
    magHeading.length > 0 ? magHeading[magHeading.length - 1][0] : 0,
  );

  const edits = dive.traceEdits ?? null;
  const confirmed = edits != null;

  return {
    accel,
    gyro,
    heading,
    magHeading,
    // null vs [] matters: a diver who corrected a dive to zero turns has said
    // something, and the detector's marks must not come back to contradict it.
    turns: confirmed ? cleanMarks(edits!.turns) : cleanMarks(tr.turns),
    // Diver-placed only. The detector's strokes stay hidden here exactly as
    // they are in the app.
    strokes: confirmed ? cleanMarks(edits!.strokes) : [],
    kicks: confirmed ? cleanMarks(edits!.kicks) : [],
    confirmed,
    bracket:
      edits && Number.isFinite(edits.startT) && Number.isFinite(edits.endT) && edits.endT > edits.startT
        ? { start: edits.startT, end: edits.endT }
        : null,
    startT: 0,
    endT,
    headingSource: tr.hs === 1 ? 'compass' : 'gyro',
    magQ: tr.magQ,
  };
}
