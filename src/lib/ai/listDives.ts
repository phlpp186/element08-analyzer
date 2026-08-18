/**
 * list_dives — the matching ROWS behind an aggregate, never the raw samples.
 *
 * `query_dives` returns numbers; this returns the identities: each matching
 * row's `{ session_id, dive_index, date }` plus a per-dataset set of DERIVED
 * summary fields (depth, times, speeds, ballast, key advanced.* chips). That
 * lets the model go from "6 dives match" to the specific dives — reference
 * them, hand one to `get_dive_detail`, or point a dive_compare / dive_profile
 * chart directive at them.
 *
 * Heavy per-sample arrays (profile / hrProfile / oxyReadings / lapTimes) are
 * structurally excluded: rows are built from an explicit field whitelist via
 * `getField`, so nothing outside it can leak. Results are capped at MAX_ROWS
 * with an `omitted` count, so a broad filter can't flood the prompt.
 *
 * Pure, no RN imports (runs in app / Deno / browser).
 */
import type { Session } from './appTypes';
import {
  applyFilter,
  buildRows,
  dayOfRow,
  getField,
  type Dataset,
  type QueryFilter,
  type Row,
} from './queryTools';
import type { ToolContext } from './trainingSummary';

export const MAX_ROWS = 25;

export interface ListDivesSpec {
  dataset: Dataset;
  /** AND-combined; same field/op surface as query_dives. */
  filters?: QueryFilter[];
  /** ISO date (inclusive) — filters the parent session's date. */
  date_from?: string;
  date_to?: string;
  /** Field to sort by (default 'date'). */
  sort?: string;
  /** 'desc' (default) or 'asc'. */
  sort_dir?: 'asc' | 'desc';
  /** Rows to return, clamped to 1..MAX_ROWS (default MAX_ROWS). */
  limit?: number;
}

export interface ListDivesResult {
  /** Rows matching the filters, before the cap. */
  total_n: number;
  rows: Record<string, unknown>[];
  /** Matching rows NOT returned because of the cap. */
  omitted: number;
  notes: string[];
}

/** Derived summary fields per dataset — the whitelist that defines a row.
 *  All resolved through getField, so session→dive inheritance (ballast, suit)
 *  and normalisation match query_dives exactly. */
const ROW_FIELDS: Record<Dataset, string[]> = {
  depth: [
    'depth',
    'diveTime',
    'si',
    'descentTime',
    'ascentTime',
    'hangTime',
    'descentSpeed',
    'ascentSpeed',
    'discipline',
    'lungVol',
    'diveType',
    'rating',
    'hypoxia',
    'earlyTurn',
    'targetDepth',
    'weightKg',
    'weightDist.neck',
    'weightDist.belt',
    'weightDist.ankle',
    'suit.mm',
    'contractionOnset.depth',
    'location',
    'waterType',
    'advanced.waves',
    'advanced.current',
    'advanced.pace',
    'advanced.eq',
  ],
  pool: [
    'discipline',
    'distance',
    'diveTime',
    'si',
    'speed',
    'pace100',
    'turns',
    'lapCount',
    'avgLapTime',
    'bestLapTime',
    'firstHalfAvgLap',
    'secondHalfAvgLap',
    'firstContractionSec',
    'hrHighest',
    'hrLowest',
    'lungVol',
    'diveType',
    'rating',
    'hypoxia',
    'weightKg',
    'suit.mm',
    'poolType',
    'advanced.pace',
    'advanced.pool',
  ],
  dry: [
    'holdSeconds',
    'rating',
    'lungVol',
    'packs',
    'dryActivity',
    'breathingStyle',
    'minSpo2',
    'spo2Baseline',
    'spo2AtEnd',
    'afterdrop',
    'recoverySec',
    'minHr',
    'maxHr',
    'restingHr',
    'diveReflexPct',
    'hrDrop1min',
    'hrAtFirstContraction',
    'contractionCount',
    'firstContractionSec',
    'avgContractionInterval',
  ],
};

function rowIndex(r: Row): number {
  return r.dataset === 'dry' ? r.holdIdx : r.diveIdx;
}

/** Sort comparator over a resolved field: numbers numerically, everything else
 *  as strings; rows missing the field sort last regardless of direction. */
function compareBy(field: string, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: Row, b: Row): number => {
    const va = getField(a, field);
    const vb = getField(b, field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb));
  };
}

export function listDives(
  sessions: Session[],
  spec: ListDivesSpec,
  ctx: ToolContext = {},
): ListDivesResult {
  const notes: string[] = [];
  const noun = spec.dataset === 'dry' ? 'holds' : 'dives';

  let rows = buildRows(sessions, spec.dataset, ctx.tz);
  // Compare on the user's DAY (see sessionDay), not the stored UTC timestamp:
  // a date_to of "2026-07-09" must include a dive stamped 2026-07-09T00:54Z,
  // and one stamped 2026-07-10T00:54Z that they did on the 9th.
  if (spec.date_from) rows = rows.filter((r) => dayOfRow(r) >= spec.date_from!);
  if (spec.date_to) rows = rows.filter((r) => dayOfRow(r) <= spec.date_to!);
  for (const f of spec.filters ?? []) {
    rows = rows.filter((r) => applyFilter(getField(r, f.field), f.op, f.value));
  }

  const total_n = rows.length;

  const sortField = spec.sort || 'date';
  const dir = spec.sort_dir === 'asc' ? 'asc' : 'desc';
  rows = [...rows].sort(compareBy(sortField, dir));

  const cap = Math.max(1, Math.min(MAX_ROWS, spec.limit ?? MAX_ROWS));
  const kept = rows.slice(0, cap);
  const omitted = total_n - kept.length;
  if (omitted > 0) {
    notes.push(
      `Showing ${kept.length} of ${total_n} matching ${noun} (sorted by ${sortField} ${dir}). ` +
        `Tell the user the list is truncated, or narrow the filters.`,
    );
  }

  const fields = ROW_FIELDS[spec.dataset];
  const out = kept.map((r) => {
    const row: Record<string, unknown> = {
      session_id: r.session.id,
      dive_index: rowIndex(r),
      // The user's day — the exact local time comes from get_dive_detail;
      // a raw UTC timestamp here just invites mis-conversion.
      date: dayOfRow(r),
    };
    for (const f of fields) {
      const v = getField(r, f);
      if (v !== null && v !== undefined && v !== '') row[f] = v;
    }
    return row;
  });

  return { total_n, rows: out, omitted, notes };
}

export const LIST_DIVES_TOOL = {
  name: 'list_dives',
  description:
    'List the individual dives/holds matching a filter, as rows of derived summary fields ' +
    '(never raw profile samples). Each row carries session_id + dive_index, which you can pass ' +
    'to get_dive_detail or reference in a dive_compare / dive_profile chart directive. Returns ' +
    `at most ${MAX_ROWS} rows plus an omitted count — always tell the user when the list is ` +
    'truncated. Use query_dives when only aggregate numbers are needed.',
  input_schema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', enum: ['depth', 'pool', 'dry'] },
      filters: {
        type: 'array',
        description: 'AND-combined conditions; same fields and ops as query_dives.',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            op: {
              type: 'string',
              enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'exists'],
            },
            value: {},
          },
          required: ['field', 'op'],
        },
      },
      date_from: { type: 'string', description: 'ISO date, inclusive.' },
      date_to: { type: 'string', description: 'ISO date, inclusive.' },
      sort: { type: 'string', description: "Field to sort by (default 'date')." },
      sort_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Default desc.' },
      limit: { type: 'integer', description: `Rows to return, max ${MAX_ROWS}.` },
    },
    required: ['dataset'],
  },
} as const;
