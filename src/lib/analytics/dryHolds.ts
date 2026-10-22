/**
 * The holds of a dry session for its player page: each hold's time, when the
 * first contraction came, and how low SpO₂ went (Philipp's option A,
 * 2026-10-22). PURE.
 *
 * The lowest SpO₂ looks 30 s past the hold's end: saturation keeps falling
 * after the first breaths (the afterdrop), the same window the Insights
 * "min SpO₂ vs hold" chart uses.
 */
import type { DrySessionData } from './drySessionProfile';

export const AFTERDROP_S = 30;

/** SpO₂ zones, as in the app's oximeter views. */
export const SPO2_ZONES = { ok: 89, mild: 75 } as const;

export interface DryHold {
  /** 0-based among the session's holds. */
  idx: number;
  startT: number;
  endT: number;
  seconds: number;
  /** Seconds into the hold of its first contraction, or null. */
  firstContraction: number | null;
  contractions: number;
  /** Lowest SpO₂ over the hold and its afterdrop, and when. */
  minSpo2: { t: number; v: number } | null;
}

export function dryHolds(data: DrySessionData): DryHold[] {
  const holds = data.blocks.filter((b) => b.type === 'Hold');
  return holds.map((b, idx) => {
    // Contractions carry their hold's index; fall back to the time window
    // for older sessions whose index is missing or off.
    const mine = data.contractions.filter(
      (c) => c.holdIdx === idx || (c.holdIdx == null && c.t >= b.startT && c.t <= b.endT),
    );
    const first = mine.length > 0 ? Math.min(...mine.map((c) => c.t)) : null;
    let min: { t: number; v: number } | null = null;
    for (const [t, v] of data.spo2Series) {
      if (t < b.startT || t > b.endT + AFTERDROP_S) continue;
      if (!min || v < min.v) min = { t, v };
    }
    return {
      idx,
      startT: b.startT,
      endT: b.endT,
      seconds: b.endT - b.startT,
      firstContraction: first != null ? Math.max(0, first - b.startT) : null,
      contractions: mine.length,
      minSpo2: min,
    };
  });
}

/** Which zone an SpO₂ reading falls in. */
export function spo2Zone(v: number): 'ok' | 'mild' | 'low' {
  return v >= SPO2_ZONES.ok ? 'ok' : v >= SPO2_ZONES.mild ? 'mild' : 'low';
}
