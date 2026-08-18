/**
 * get_dive_detail — full detail for ONE dive, including free-text `remarks`.
 *
 * The `query_dives` aggregation tool deliberately never exposes `remarks` (it is
 * unstructured and must not be filtered on, see ai-assistant-design.md §2.4).
 * This tool is the escape hatch for "tell me about my deepest dive" style
 * questions: the model asks for one specific dive and gets its full record,
 * including remarks, as context.
 *
 * Pure, no RN imports (runs in app / Deno / browser).
 */
import type { DrySession, Session } from './appTypes';
import type { ToolContext } from './trainingSummary';
import { extractHoldStats } from './support/extractHoldStats';
import { sessionDay } from '../sessionDay';

/** Format a UTC ISO timestamp as "YYYY-MM-DD HH:MM" in the user's timezone, so
 *  the model reports LOCAL time instead of doing (error-prone) UTC math itself.
 *  Returns null when the tz is unknown or the date is unparseable. */
function localDateTime(iso: string, tz?: string): string | null {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = get('hour') === '24' ? '00' : get('hour'); // some ICU emit 24
    return `${date} ${hour}:${get('minute')}`;
  } catch {
    return null;
  }
}

export interface DiveDetailSpec {
  /** Session.id of the parent session. */
  session_id: number;
  /** 0-based dive index within the session (ignored for dry — returns the session). */
  dive_index?: number;
}

export interface DiveDetailResult {
  found: boolean;
  detail?: Record<string, unknown>;
  error?: string;
}

/** Strip null/undefined so the model sees only fields that carry data. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

export function getDiveDetail(
  sessions: Session[],
  spec: DiveDetailSpec,
  ctx?: ToolContext,
): DiveDetailResult {
  const s = sessions.find((x) => x.id === spec.session_id);
  if (!s) return { found: false, error: `No session with id ${spec.session_id}.` };

  // Present the date/time in the user's LOCAL timezone (stored value is UTC).
  const local = localDateTime(s.date, ctx?.tz);
  const base = compact({
    session_id: s.id,
    // Without a tz from the caller, the device's own zone — still the user's
    // day, never UTC's (which is what the raw slice gave).
    date: local ? local.slice(0, 10) : sessionDay(s.date),
    logged_at_local: local, // "YYYY-MM-DD HH:MM" local — report this time verbatim
    mode: s.mode,
    location: (s as { location?: string }).location,
    remarks: s.remarks,
    rating: s.rating,
  });

  if (s.mode === 'dry') {
    // Dry sessions have no per-dive rows; return the session-level record
    // plus a per-hold breakdown (oximeter stats when the device logged them;
    // HR-only straps record SpO2 as a constant 0, so those fields are
    // withheld for them).
    const dry = s as DrySession;
    const stats = extractHoldStats([dry]);
    const spo2Ok = (dry.deviceType ?? 'oximeter') === 'oximeter';
    const holds = (dry.blockTimeline ?? [])
      .filter((b) => b.type === 'Hold')
      .slice(0, 20)
      .map((b, i) => {
        const st = stats.find((h) => h.holdIdx === i);
        return compact({
          hold_index: i,
          seconds: b.seconds,
          rating: b.rating,
          lungVol: b.lungVol ?? dry.lungVol,
          note: b.note,
          minSpo2: spo2Ok ? st?.minSpo2 : undefined,
          spo2Baseline: spo2Ok ? st?.baseline : undefined,
          spo2AtEnd: spo2Ok ? st?.atEnd : undefined,
          recoverySec: spo2Ok ? st?.recovSec : undefined,
          restingHr: st?.hrBaseline,
          minHr: st?.hrMin,
          maxHr: st?.hrMax,
          diveReflexPct: st?.diveReflexPct,
          hrAtFirstContraction: st?.hrAtFirstContraction,
          contractionCount: (dry.contractions ?? []).filter((c) => c.holdIdx === i).length,
        });
      });
    return {
      found: true,
      detail: compact({
        ...base,
        dryActivity: dry.dryActivity,
        cyclesCount: dry.cyclesCount,
        lungVol: dry.lungVol,
        breathingStyle: dry.breathingStyle,
        holds,
      }),
    };
  }

  const idx = spec.dive_index ?? 0;
  const dive = (s as { dives?: unknown[] }).dives?.[idx];
  if (!dive) {
    return { found: false, error: `Session ${spec.session_id} has no dive at index ${idx}.` };
  }

  return {
    found: true,
    detail: {
      ...base,
      dive_index: idx,
      // The full dive record minus its heavy 1 Hz profile arrays (the model
      // reasons over the summary fields, not raw samples).
      dive: compact(stripHeavy(dive as Record<string, unknown>)),
    },
  };
}

/** Drop the multi-KB per-sample arrays; keep every summary/annotation field. */
function stripHeavy(dive: Record<string, unknown>): Record<string, unknown> {
  const { profile, hrProfile, oxyReadings, lapTimes, ...rest } = dive;
  void profile;
  void hrProfile;
  void oxyReadings;
  void lapTimes;
  return rest;
}

export const GET_DIVE_DETAIL_TOOL = {
  name: 'get_dive_detail',
  description:
    'Get the full record for ONE specific dive, including free-text remarks. Use for questions ' +
    'about a particular dive (e.g. "tell me about my deepest dive") after query_dives has ' +
    'identified it. Never use it to scan many dives — use query_dives for aggregation.',
  input_schema: {
    type: 'object',
    properties: {
      session_id: { type: 'integer', description: 'Session.id of the parent session.' },
      dive_index: { type: 'integer', description: '0-based dive index within the session.' },
    },
    required: ['session_id'],
  },
} as const;
