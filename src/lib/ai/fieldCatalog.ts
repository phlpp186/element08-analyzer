/**
 * Per-user field availability — "what does THIS user actually log?"
 *
 * The density guardrail (ai-assistant-design.md §2.1) hinges on the model not
 * offering to filter on dimensions the user never records. Rather than a second
 * tool round-trip, we compute a compact availability summary once and fold it
 * into the first system message: for each dataset the user has, how many rows
 * exist and, per queryable field, how many carry data (plus the distinct values
 * seen for low-cardinality categoricals).
 *
 * Pure, no RN imports.
 */
import type { Session } from './appTypes';
import { buildRows, getField, type Dataset, type Row } from './queryTools';

/** Fields worth advertising per dataset. `enumerate` = list the distinct values
 *  (for categoricals), so the model knows the exact chip vocabulary this user
 *  uses. Numeric fields just report a count. */
const FIELDS: Record<Dataset, { field: string; enumerate?: boolean }[]> = {
  depth: [
    { field: 'depth' },
    { field: 'diveTime' },
    { field: 'si' },
    { field: 'descentTime' },
    { field: 'ascentTime' },
    { field: 'hangTime' },
    { field: 'descentSpeed' },
    { field: 'ascentSpeed' },
    { field: 'hr' },
    { field: 'discipline', enumerate: true },
    { field: 'lungVol', enumerate: true },
    { field: 'diveType', enumerate: true },
    { field: 'rating' },
    { field: 'hypoxia' },
    { field: 'weightKg' },
    { field: 'weightDist.neck' },
    { field: 'weightDist.belt' },
    { field: 'weightDist.ankle' },
    { field: 'suit.mm' },
    { field: 'mfChargeDepth' },
    { field: 'contractionOnset.depth' },
    { field: 'targetDepth' },
    { field: 'earlyTurn' },
    { field: 'breathingStyle', enumerate: true },
    { field: 'location', enumerate: true },
    { field: 'waterType', enumerate: true },
    { field: 'waterTemp' },
    // Within-session position (fatigue analysis) — always present.
    { field: 'diveOrderInSession' },
    { field: 'divesInSession' },
    { field: 'isFirstInSession', enumerate: true },
    { field: 'isLastInSession', enumerate: true },
    // Position relative to the session's deepest dive.
    { field: 'rankInSession' },
    { field: 'isBestInSession', enumerate: true },
    { field: 'isAfterBestInSession', enumerate: true },
    { field: 'divesAfterBestInSession' },
    { field: 'advanced.wetsuit', enumerate: true },
    { field: 'advanced.waves', enumerate: true },
    { field: 'advanced.current', enumerate: true },
    { field: 'advanced.thermocline', enumerate: true },
    { field: 'advanced.pace', enumerate: true },
    { field: 'advanced.eq', enumerate: true },
    { field: 'advanced.mask', enumerate: true },
    { field: 'advanced.packs' },
  ],
  pool: [
    { field: 'discipline', enumerate: true },
    { field: 'distance' },
    { field: 'diveTime' },
    { field: 'si' },
    { field: 'speed' },
    { field: 'pace100' },
    { field: 'turns' },
    { field: 'lapCount' },
    { field: 'avgLapTime' },
    { field: 'bestLapTime' },
    { field: 'firstHalfAvgLap' },
    { field: 'secondHalfAvgLap' },
    { field: 'firstContractionSec' },
    { field: 'hrHighest' },
    { field: 'hrLowest' },
    { field: 'lungVol', enumerate: true },
    { field: 'diveType', enumerate: true },
    { field: 'rating' },
    { field: 'hypoxia' },
    { field: 'weightKg' },
    { field: 'suit.mm' },
    { field: 'poolType', enumerate: true },
    { field: 'totalDistance' },
    // Within-session position (fatigue analysis) — always present.
    { field: 'diveOrderInSession' },
    { field: 'divesInSession' },
    { field: 'isFirstInSession', enumerate: true },
    { field: 'isLastInSession', enumerate: true },
    // Position relative to the session's longest-distance dive.
    { field: 'rankInSession' },
    { field: 'isBestInSession', enumerate: true },
    { field: 'isAfterBestInSession', enumerate: true },
    { field: 'divesAfterBestInSession' },
    { field: 'advanced.wetsuit', enumerate: true },
    { field: 'advanced.pace', enumerate: true },
    { field: 'advanced.pool', enumerate: true },
    { field: 'advanced.glides' },
    { field: 'advanced.packs' },
  ],
  dry: [
    { field: 'holdSeconds' },
    { field: 'rating' },
    { field: 'lungVol', enumerate: true },
    { field: 'packs' },
    { field: 'dryActivity', enumerate: true },
    { field: 'minSpo2' },
    { field: 'spo2Baseline' },
    { field: 'spo2AtEnd' },
    { field: 'afterdrop' },
    { field: 'recoverySec' },
    { field: 'minHr' },
    { field: 'maxHr' },
    { field: 'avgHr' },
    { field: 'restingHr' },
    { field: 'diveReflexPct' },
    { field: 'hrDrop1min' },
    { field: 'hrAtFirstContraction' },
    { field: 'hrDropAfterContraction' },
    { field: 'contractionCount' },
    { field: 'firstContractionSec' },
    { field: 'avgContractionInterval' },
    { field: 'breathingStyle', enumerate: true },
    { field: 'advanced.environment', enumerate: true },
    { field: 'advanced.position', enumerate: true },
    { field: 'advanced.relaxation', enumerate: true },
  ],
};

const MAX_VALUES = 12;

export interface FieldStat {
  field: string;
  /** Rows that carry a non-null value for this field. */
  withData: number;
  /** Distinct values seen (categoricals only), capped. */
  values?: string[];
}

export interface DatasetAvailability {
  dataset: Dataset;
  /** Total rows (dives / holds). */
  total: number;
  /** Only fields the user actually logs at least once. */
  fields: FieldStat[];
}

function statFor(rows: Row[], field: string, enumerate: boolean): FieldStat {
  let withData = 0;
  const values = enumerate ? new Set<string>() : null;
  for (const r of rows) {
    const v = getField(r, field);
    if (v == null || v === '') continue;
    withData++;
    if (values && values.size < MAX_VALUES) values.add(String(v));
  }
  const stat: FieldStat = { field, withData };
  if (values && values.size > 0) stat.values = [...values].sort();
  return stat;
}

/** Availability for one dataset, or null when the user has no rows there. */
export function datasetAvailability(
  sessions: Session[],
  dataset: Dataset,
): DatasetAvailability | null {
  const rows = buildRows(sessions, dataset);
  if (rows.length === 0) return null;
  const fields = FIELDS[dataset]
    .map((f) => statFor(rows, f.field, !!f.enumerate))
    .filter((s) => s.withData > 0);
  return { dataset, total: rows.length, fields };
}

/** Availability across every dataset the user has data in. */
export function summarizeFields(sessions: Session[]): DatasetAvailability[] {
  return (['depth', 'pool', 'dry'] as Dataset[])
    .map((d) => datasetAvailability(sessions, d))
    .filter((a): a is DatasetAvailability => a !== null);
}

/** Compact human/model-readable rendering folded into the system prompt. */
export function renderAvailability(avail: DatasetAvailability[]): string {
  if (avail.length === 0) return 'This user has no logged sessions yet.';
  const lines: string[] = [];
  for (const a of avail) {
    lines.push(`## ${a.dataset} — ${a.total} ${a.dataset === 'dry' ? 'holds' : 'dives'}`);
    for (const f of a.fields) {
      const vals = f.values ? ` {${f.values.join(', ')}}` : '';
      lines.push(`- ${f.field}: ${f.withData}/${a.total}${vals}`);
    }
  }
  return lines.join('\n');
}
