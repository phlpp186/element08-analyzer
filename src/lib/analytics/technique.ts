/**
 * Technique analytics — early turns and mouthfill, ported from the mobile app.
 *
 *   - earlyTurnStats: how often the diver turns before target, why, and how
 *     many metres short (from per-dive earlyTurn / earlyTurnReason / targetDepth).
 *   - mouthfillStats: mouthfill factor (pressure ratio) + reach, and a
 *     consistency score (stdev of factor within ±2 m charge-depth brackets),
 *     from the per-dive mfChargeDepth.
 *
 * Both read fields the diver logs by hand; dives without them are simply
 * excluded, so the denominators stay honest. Warm-up / safety / excluded
 * dives are filtered out via includeDive, matching the other depth cards.
 */
import type { ParsedSession } from '../../schema/backup';
import { includeDive } from './diveFilter';

interface TechDive {
  depth: number;
  diveType?: string | null;
  earlyTurn?: boolean;
  targetDepth?: number | null;
  earlyTurnReason?: string | null;
  mfChargeDepth?: number | null;
  // Legacy location for early-turn fields (pre-promotion), kept as a fallback.
  advanced?: { earlyTurn?: boolean; targetDepth?: number; earlyTurnReason?: string } | null;
}

function depthDives(sessions: ParsedSession[]): TechDive[] {
  const out: TechDive[] = [];
  for (const s of sessions) {
    if (s.mode !== 'depth') continue;
    const dives = (s as { dives?: TechDive[] }).dives;
    if (!dives) continue;
    for (const d of dives) if (includeDive(d.diveType)) out.push(d);
  }
  return out;
}

// ─── Early turn ──────────────────────────────────────────────────────────────

export const EARLY_TURN_REASONS = [
  { id: 'squeeze', label: 'Squeeze', color: '#ef5350' },
  { id: 'eq', label: 'Equalization', color: '#ff9800' },
  { id: 'hypoxia', label: 'Hypoxia', color: '#ab47bc' },
  { id: 'mental', label: 'Mental', color: '#42a5f5' },
  { id: 'time-safety', label: 'Time / safety', color: '#78909c' },
] as const;

export interface EarlyTurnReasonBand {
  id: string;
  label: string;
  color: string;
  count: number;
}

export interface EarlyTurnStats {
  /** Dives where earlyTurn was explicitly logged (true or false). */
  loggedTotal: number;
  earlyCount: number;
  hitCount: number;
  earlyPct: number;
  reasons: EarlyTurnReasonBand[];
  shortfall: { count: number; avg: number; worst: number };
}

export function earlyTurnStats(sessions: ParsedSession[]): EarlyTurnStats {
  let loggedTotal = 0;
  let earlyCount = 0;
  let hitCount = 0;
  const reasonCounts: Record<string, number> = {};
  const shortfalls: number[] = [];

  for (const d of depthDives(sessions)) {
    const early = d.earlyTurn ?? d.advanced?.earlyTurn;
    if (typeof early !== 'boolean') continue;
    loggedTotal++;
    if (early) {
      earlyCount++;
      const reason = d.earlyTurnReason ?? d.advanced?.earlyTurnReason ?? null;
      if (reason) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      const target = d.targetDepth ?? d.advanced?.targetDepth ?? null;
      if (target != null && target > d.depth) shortfalls.push(target - d.depth);
    } else {
      hitCount++;
    }
  }

  const reasons = EARLY_TURN_REASONS.map((r) => ({
    ...r,
    count: reasonCounts[r.id] ?? 0,
  })).filter((r) => r.count > 0);

  const shortfall =
    shortfalls.length > 0
      ? {
          count: shortfalls.length,
          avg: shortfalls.reduce((a, b) => a + b, 0) / shortfalls.length,
          worst: Math.max(...shortfalls),
        }
      : { count: 0, avg: 0, worst: 0 };

  return {
    loggedTotal,
    earlyCount,
    hitCount,
    earlyPct: loggedTotal > 0 ? Math.round((earlyCount / loggedTotal) * 100) : 0,
    reasons,
    shortfall,
  };
}

// ─── Mouthfill ───────────────────────────────────────────────────────────────

/** MF = P_max / P_charge (bar absolute); reach = metres from charge to bottom.
 *  Null when the charge depth is missing or not between 0 and max depth. */
export function calcMouthfillFactor(
  maxDepthM: number,
  chargeDepthM: number,
): { factor: number; reachM: number } | null {
  if (!Number.isFinite(maxDepthM) || !Number.isFinite(chargeDepthM)) return null;
  if (chargeDepthM <= 0 || chargeDepthM >= maxDepthM) return null;
  return {
    factor: (maxDepthM / 10 + 1) / (chargeDepthM / 10 + 1),
    reachM: maxDepthM - chargeDepthM,
  };
}

export interface MouthfillBracket {
  /** Charge depth bracket centre (m), rounded to the nearest 2 m. */
  bracketM: number;
  mean: number;
  stdev: number;
  count: number;
}

export interface MouthfillStats {
  /** Dives with a usable logged charge depth. */
  count: number;
  avgFactor: number;
  avgReachM: number;
  brackets: MouthfillBracket[];
}

export function mouthfillStats(sessions: ParsedSession[]): MouthfillStats {
  const factors: number[] = [];
  const reaches: number[] = [];
  const byBracket = new Map<number, number[]>();

  for (const d of depthDives(sessions)) {
    if (d.mfChargeDepth == null) continue;
    const r = calcMouthfillFactor(d.depth, d.mfChargeDepth);
    if (!r) continue;
    factors.push(r.factor);
    reaches.push(r.reachM);
    const bracket = Math.round(d.mfChargeDepth / 2) * 2;
    const list = byBracket.get(bracket) ?? [];
    list.push(r.factor);
    byBracket.set(bracket, list);
  }

  const brackets: MouthfillBracket[] = [];
  for (const [bracketM, fs] of byBracket.entries()) {
    const mean = fs.reduce((a, b) => a + b, 0) / fs.length;
    const variance =
      fs.length > 1 ? fs.reduce((s, x) => s + (x - mean) ** 2, 0) / fs.length : 0;
    brackets.push({ bracketM, mean, stdev: Math.sqrt(variance), count: fs.length });
  }
  brackets.sort((a, b) => a.bracketM - b.bracketM);

  return {
    count: factors.length,
    avgFactor: factors.length ? factors.reduce((a, b) => a + b, 0) / factors.length : 0,
    avgReachM: reaches.length ? reaches.reduce((a, b) => a + b, 0) / reaches.length : 0,
    brackets,
  };
}
