/**
 * How the app groups a depth dive by technique, mirrored here so the analyzer
 * never pools what the app keeps apart (app: src/lib/lungFill.ts,
 * algorithms/mouthfill.ts, models/chipOptions.ts).
 *
 *   - A partial inhale is stored as lungVol 'FL' + lungFillPct and is its own
 *     group, not a Full Lungs dive.
 *   - A half mouthfill or N-charge reaches a different depth from the same
 *     charge than a full mouthfill; a charge without a type is a full one.
 *   - A dive can have several EQ outcomes: advanced.eq holds one, eqAll all.
 */
export type MouthfillType = 'mouthfill' | 'half' | 'ncharge';
export const MOUTHFILL_TYPES: MouthfillType[] = ['mouthfill', 'half', 'ncharge'];
export const MOUTHFILL_TYPE_LABEL: Record<MouthfillType, string> = {
  mouthfill: 'Mouthfill',
  half: 'Half-Mouthfill',
  ncharge: 'N-Charge',
};

const EQ_ORDER = ['held', 'leaking', 'swallowing', 'frenzel-failure'];

type Loose = Record<string, unknown> | null | undefined;

export function mouthfillTypeOf(dive: Loose): MouthfillType {
  const ty = dive?.mfType;
  return ty === 'half' || ty === 'ncharge' ? ty : 'mouthfill';
}

export function partialFillPct(dive: Loose): number | null {
  const pct = dive?.lungFillPct;
  if (dive?.lungVol !== 'FL' || typeof pct !== 'number') return null;
  return pct > 0 && pct < 100 ? pct : null;
}

/** 'FL' | 'PARTIAL' | 'FRC' | 'RV', or null when no lung volume is logged. */
export function lungGroupOf(dive: Loose): string | null {
  const lv = dive?.lungVol;
  if (typeof lv !== 'string' || !lv) return null;
  return partialFillPct(dive) != null ? 'PARTIAL' : lv;
}

export function eqOutcomesOf(dive: Loose): string[] {
  const adv = dive?.advanced as { eq?: unknown; eqAll?: unknown } | null | undefined;
  const all = Array.isArray(adv?.eqAll) && adv.eqAll.length ? adv.eqAll : adv?.eq ? [adv.eq] : [];
  return EQ_ORDER.filter((id) => all.includes(id));
}
