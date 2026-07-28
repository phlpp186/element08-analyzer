/**
 * Portable agent loop for the dive assistant.
 *
 * Runs on the CLIENT (app / analyzer): it drives the tool-use conversation and
 * EXECUTES the tools locally over the in-memory Session[]. The only thing that
 * leaves the device is the model call itself — the question plus the aggregated
 * tool RESULTS (never raw dives) — and that goes through the injected
 * `callModel` seam, which in production posts to the Supabase /ask proxy.
 *
 * `callModel` is the single provider-isolation point (design §6.1): swap the
 * proxy's model/vendor without touching this file. Tests inject a scripted
 * `callModel`, so the whole loop is verifiable with no network or API key.
 *
 * Pure (no RN imports); safe in app / Deno / browser.
 */
import type { Session } from './appTypes';
import { runQuery, QUERY_DIVES_TOOL, type QuerySpec } from './queryTools';
import { getDiveDetail, GET_DIVE_DETAIL_TOOL, type DiveDetailSpec } from './diveDetail';
import { listDives, LIST_DIVES_TOOL, type ListDivesSpec } from './listDives';
import {
  trainingSummary,
  TRAINING_SUMMARY_TOOL,
  type ToolContext,
  type TrainingSummarySpec,
} from './trainingSummary';
import { buildSystemPrompt } from './systemPrompt';

export type { ToolContext } from './trainingSummary';

// ─── Model wire types (Anthropic-shaped; the proxy adapts other vendors) ──────

export type Role = 'user' | 'assistant';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ModelMessage {
  role: Role;
  content: ContentBlock[];
}

export interface ModelResponse {
  content: ContentBlock[];
  stop_reason?: string | null;
}

export interface CallModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: readonly unknown[];
  /** True only on the FIRST round-trip of a user question (agent iteration 0).
   *  The proxy counts a metered call as one "question" toward the monthly
   *  quota; tool-continuation calls (meter=false) pass the gate without
   *  incrementing, so a multi-round answer still costs the user one question. */
  meter?: boolean;
}

/** The single provider seam. Production impl posts to the /ask proxy. */
export type CallModel = (req: CallModelRequest) => Promise<ModelResponse>;

export const TOOLS = [
  QUERY_DIVES_TOOL,
  LIST_DIVES_TOOL,
  GET_DIVE_DETAIL_TOOL,
  TRAINING_SUMMARY_TOOL,
] as const;

// ─── Chart directive (design §5 + v1.1 dive refs) ────────────────────────────

/** Series charts carry numbers the tools returned; dive charts only POINT at
 *  dives (by id) — the app renders them from local on-device profiles, so no
 *  profile data ever passes through the model. */
export interface SeriesChartDirective {
  type: 'bar' | 'line' | 'scatter' | 'histogram';
  title: string;
  series: { label: string; value: number; n?: number }[];
  /** How to format the values for display. 'mmss' renders seconds as m:ss
   *  (for pace / time series like pace100); omitted → a plain 1-decimal number. */
  format?: 'mmss';
}

export interface DiveRef {
  session_id: number;
  dive_index: number;
}

export interface DiveCompareDirective {
  type: 'dive_compare';
  title: string;
  dives: DiveRef[];
}

export interface DiveProfileDirective {
  type: 'dive_profile';
  title: string;
  dives: DiveRef[];
}

/** Per-depth-band avg speed breakdown (descent + ascent) for ONE dive. */
export interface DiveBandsDirective {
  type: 'dive_bands';
  title: string;
  dives: DiveRef[];
}

/** Instantaneous speed over dive time for 1-2 dives. */
export interface DiveSpeedDirective {
  type: 'dive_speed';
  title: string;
  dives: DiveRef[];
}

/** SpO2 + HR curves overlaid across 1-4 dry breath-holds. dive_index = the
 *  0-based Hold ordinal within the session. */
export interface HoldCompareDirective {
  type: 'hold_compare';
  title: string;
  dives: DiveRef[];
}

/** Lap pace (s per lap) overlaid across 1-4 pool dives. */
export interface PoolCompareDirective {
  type: 'pool_compare';
  title: string;
  dives: DiveRef[];
}

/** Pure "open this in the logbook" link — no chart. Works for ANY dataset
 *  (depth / pool / dry), needs no profile or device data, so it's the reliable
 *  way to point the user at a specific session when they ask for a link. */
export interface OpenDiveDirective {
  type: 'open_dive';
  title: string;
  dives: DiveRef[];
}

/** Depth-over-time timeline of the WHOLE logbook (optionally filtered) — the
 *  Insights "Depth Over Time" chart, drawn entirely from local data. Carries
 *  NO data points (the model never emits raw dives), only optional filters,
 *  so "show all my 500 dives" costs the same as "show 5". */
export interface DepthTimelineDirective {
  type: 'depth_timeline';
  title: string;
  /** Optional discipline filter, e.g. 'CWT'. */
  discipline?: string;
  /** Optional ISO YYYY-MM-DD range on the parent session date. */
  date_from?: string;
  date_to?: string;
}

/** Tappable "open the Insights tab" link — for pointing the user at the app's
 *  own analytics screens (no data passes through the model). */
export interface OpenInsightsDirective {
  type: 'open_insights';
  title: string;
  /** Which Insights tab to land on. */
  tab?: 'depth' | 'pool' | 'breathhold' | 'balance';
}

/** Distance-vs-time scatter of EVERY pool dive (optionally filtered), drawn
 *  from the local logbook — the pool analogue of depth_timeline. Carries NO
 *  data points; each dot is one dive (never a session total). */
export interface PoolScatterDirective {
  type: 'pool_scatter';
  title: string;
  /** Optional discipline filter, e.g. 'DYN' / 'DNF' / 'DYNB'. */
  discipline?: string;
  date_from?: string;
  date_to?: string;
}

/** Mean depth-vs-time curve across a FILTERED set of depth dives (the "average
 *  dive profile" ask). Like depth_timeline it carries only filters — the app
 *  resolves the matching dives from the local logbook and averages their
 *  on-device profiles, so 5 or 500 dives cost the model the same and no profile
 *  data ever passes through it. */
export interface ProfileAvgDirective {
  type: 'profile_avg';
  title: string;
  /** Optional discipline filter, e.g. 'CWT'. */
  discipline?: string;
  /** Optional dive-type filter, e.g. 'safety' | 'training' | 'warmup' |
   *  'competition'. Unlike depth_timeline this HONORS the type so "average
   *  profile of my safety dives" works. */
  diveType?: string;
  /** Optional ISO YYYY-MM-DD range on the parent session date. */
  date_from?: string;
  date_to?: string;
  /** Optional max-depth range on the dive (metres). */
  depth_min?: number;
  depth_max?: number;
}

/** Per-dive scatter of two numeric metrics (the "plot X vs Y across my dives"
 *  ask). Like depth_timeline/pool_scatter it carries only field paths + filters,
 *  never data points — the app resolves the matching dives from the local
 *  logbook and reads each metric via the same field vocabulary as query_dives,
 *  so one dot = one dive and no raw dives pass through the model. */
export interface DiveScatterDirective {
  type: 'dive_scatter';
  title: string;
  /** Which logbook to draw from — decides the field vocabulary. */
  dataset: 'depth' | 'pool' | 'dry';
  /** Field path for the x axis, e.g. 'depth' / 'diveTime' / 'minSpo2'. */
  x: string;
  /** Field path for the y axis. */
  y: string;
  /** Optional axis captions (default to the field names). */
  x_label?: string;
  y_label?: string;
  /** Optional discipline filter, e.g. 'CWT'. */
  discipline?: string;
  /** Optional ISO YYYY-MM-DD range on the parent session date. */
  date_from?: string;
  date_to?: string;
}

/** Split per literal so TS can narrow the ChartDirective union by `type`. */
export type DiveChartDirective =
  | DiveCompareDirective
  | DiveProfileDirective
  | DiveBandsDirective
  | DiveSpeedDirective
  | HoldCompareDirective
  | PoolCompareDirective
  | OpenDiveDirective;

export type ChartDirective =
  | SeriesChartDirective
  | DiveChartDirective
  | DepthTimelineDirective
  | PoolScatterDirective
  | ProfileAvgDirective
  | DiveScatterDirective
  | OpenInsightsDirective;

/** Most dives the app will overlay in one dive_compare chart. Raised from 4:
 *  users routinely want to eyeball many profiles at once, and CompareDiveChart
 *  colours each entry from an 8-hue overlay palette so the legend stays legible. */
export const MAX_COMPARE_DIVES = 8;

/** Per-type cap on how many dive refs a directive may carry. Curve overlays
 *  (hold_compare draws 2 lines/hold, pool_compare a lap trace/dive) get busy
 *  faster than a depth profile, so they cap lower than dive_compare. */
const DIVE_CAPS: Record<DiveChartDirective['type'], number> = {
  dive_compare: MAX_COMPARE_DIVES,
  dive_profile: 1,
  dive_bands: 1,
  dive_speed: 2,
  hold_compare: 6,
  pool_compare: 6,
  open_dive: MAX_COMPARE_DIVES,
};

const CHART_FENCE = /```chart\s*\n([\s\S]*?)\n```/;
/** Global variant used to STRIP every fence from the displayed prose — the
 *  model sometimes emits more than one ```chart block, and any un-stripped
 *  fence would leak raw JSON into the answer text (we still only render one). */
const CHART_FENCE_ALL = /```chart\s*\n[\s\S]*?\n```/g;

function isDiveRef(d: unknown): d is DiveRef {
  const r = d as DiveRef;
  return (
    !!r &&
    typeof r.session_id === 'number' &&
    typeof r.dive_index === 'number' &&
    Number.isInteger(r.dive_index) &&
    r.dive_index >= 0
  );
}

/** Pull a trailing ```chart fenced directive out of the answer, if valid. */
export function extractChart(text: string): { text: string; chart: ChartDirective | null } {
  const m = text.match(CHART_FENCE);
  if (!m) return { text: text.trim(), chart: null };
  let chart: ChartDirective | null = null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && typeof parsed.title === 'string') {
      if (
        ['bar', 'line', 'scatter', 'histogram'].includes(parsed.type) &&
        Array.isArray(parsed.series)
      ) {
        chart = {
          ...parsed,
          format: parsed.format === 'mmss' ? 'mmss' : undefined,
        } as SeriesChartDirective;
      } else if (
        parsed.type in DIVE_CAPS &&
        Array.isArray(parsed.dives) &&
        parsed.dives.length > 0 &&
        parsed.dives.every(isDiveRef)
      ) {
        const cap = DIVE_CAPS[parsed.type as DiveChartDirective['type']];
        chart = { ...parsed, dives: parsed.dives.slice(0, cap) } as DiveChartDirective;
      } else if (parsed.type === 'depth_timeline' || parsed.type === 'pool_scatter') {
        // Filters are optional; anything malformed is dropped field-by-field
        // (the chart itself survives — it needs no data from the model).
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        chart = {
          type: parsed.type,
          title: parsed.title,
          discipline: str(parsed.discipline),
          date_from: str(parsed.date_from),
          date_to: str(parsed.date_to),
        };
      } else if (parsed.type === 'profile_avg') {
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        chart = {
          type: 'profile_avg',
          title: parsed.title,
          discipline: str(parsed.discipline),
          diveType: str(parsed.diveType),
          date_from: str(parsed.date_from),
          date_to: str(parsed.date_to),
          depth_min: num(parsed.depth_min),
          depth_max: num(parsed.depth_max),
        };
      } else if (parsed.type === 'dive_scatter') {
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        const ds = str(parsed.dataset);
        const x = str(parsed.x);
        const y = str(parsed.y);
        // Needs a valid dataset and both axis fields; otherwise drop the chart
        // (the app can't resolve which metric to plot).
        if ((ds === 'depth' || ds === 'pool' || ds === 'dry') && x && y) {
          chart = {
            type: 'dive_scatter',
            title: parsed.title,
            dataset: ds,
            x,
            y,
            x_label: str(parsed.x_label),
            y_label: str(parsed.y_label),
            discipline: str(parsed.discipline),
            date_from: str(parsed.date_from),
            date_to: str(parsed.date_to),
          };
        }
      } else if (parsed.type === 'open_insights') {
        const TABS = ['depth', 'pool', 'breathhold', 'balance'] as const;
        chart = {
          type: 'open_insights',
          title: parsed.title,
          tab: TABS.includes(parsed.tab) ? (parsed.tab as OpenInsightsDirective['tab']) : undefined,
        };
      }
    }
  } catch {
    /* malformed chart JSON → drop the chart, keep the prose */
  }
  // Strip EVERY fence (not just the rendered one) so a second/leftover ```chart
  // block never shows as raw JSON in the answer.
  const stripped = text.replace(CHART_FENCE_ALL, '').trim();
  return { text: stripped, chart };
}

// ─── Tool dispatch ───────────────────────────────────────────────────────────

export function runTool(
  sessions: Session[],
  name: string,
  input: unknown,
  ctx?: ToolContext,
): unknown {
  if (name === 'query_dives') return runQuery(sessions, input as QuerySpec);
  if (name === 'list_dives') return listDives(sessions, input as ListDivesSpec);
  if (name === 'get_dive_detail') return getDiveDetail(sessions, input as DiveDetailSpec, ctx);
  if (name === 'get_training_summary')
    return trainingSummary(sessions, input as TrainingSummarySpec, ctx);
  return { error: `Unknown tool: ${name}` };
}

// ─── The loop ────────────────────────────────────────────────────────────────

export interface AgentOptions {
  sessions: Session[];
  question: string;
  callModel: CallModel;
  /** Prior turns (for a multi-message chat). Omit for a one-shot question. */
  history?: ModelMessage[];
  /** Cost guard: max model round-trips (design §6). */
  maxIterations?: number;
  /** How many most-recent prior turns keep their tool payloads in history;
   *  older turns are trimmed to text only. Default 1. */
  keepToolTurns?: number;
  /** Tools offered to the model. Defaults to all of TOOLS; the Ask screen
   *  narrows this per the aiDataAccess setting. Tool RESULTS still come from
   *  runTool, so a tool not in this list is simply never called. */
  tools?: readonly unknown[];
  /** Extra system-prompt line(s) appended after the availability tail — used
   *  for the data-access note so the model knows why a tool is missing. */
  systemExtra?: string;
  /** App-side data for tools the model can't supply itself: today's date,
   *  week-start setting, the active plan. Also surfaces today's date to the
   *  model so "last week" / "this month" resolve correctly. */
  toolContext?: ToolContext;
}

export interface AgentResult {
  answer: string;
  chart: ChartDirective | null;
  /** Every tool the model invoked, in order (for telemetry / debugging). */
  toolCalls: { name: string; input: unknown }[];
  iterations: number;
  /** Set when the loop hit maxIterations without a final text answer. */
  stopped?: 'max_iterations';
  /** Full transcript (for a follow-up turn). */
  messages: ModelMessage[];
}

function isToolUse(b: ContentBlock): b is Extract<ContentBlock, { type: 'tool_use' }> {
  return b.type === 'tool_use';
}

/**
 * Trim tool payloads out of PRIOR turns so a long chat doesn't re-send every
 * old aggregate on each new question — the single biggest lever on multi-turn
 * cost. The model keeps its own text answers (which already state the numbers),
 * so dropping the bulky tool_use/tool_result blocks from old turns barely
 * affects quality while cutting input tokens sharply.
 *
 * `keepToolTurns` most-recent turns are left fully intact (so immediate
 * follow-ups still see the last tool data); everything older is reduced to its
 * text blocks. A "turn" starts at a user TEXT message (the question); we cut
 * only on those boundaries, so tool_use/tool_result pairs are never split
 * (which the API would reject). Pure.
 */
export function trimHistory(messages: ModelMessage[], keepToolTurns = 1): ModelMessage[] {
  const turnStarts: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'user' && m.content.some((b) => b.type === 'text')) turnStarts.push(i);
  });
  if (turnStarts.length <= keepToolTurns) return messages;
  const cutoff = turnStarts[turnStarts.length - keepToolTurns];
  const out: ModelMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (i >= cutoff) {
      out.push(messages[i]);
      continue;
    }
    // Older turn: keep only its text, drop tool_use / tool_result blocks.
    const text = messages[i].content.filter((b) => b.type === 'text');
    if (text.length) out.push({ role: messages[i].role, content: text });
  }
  return out;
}

export async function runAgent(opts: AgentOptions): Promise<AgentResult> {
  const { sessions, question, callModel, history = [], maxIterations = 8, tools = TOOLS } = opts;
  const system =
    buildSystemPrompt(sessions) +
    (opts.toolContext?.todayIso ? `\n\nToday's date: ${opts.toolContext.todayIso}.` : '') +
    (opts.toolContext?.tz
      ? `\n\nThe user's timezone is ${opts.toolContext.tz}. Dates from the tools are already the user's LOCAL date; for a specific clock time use get_dive_detail's \`logged_at_local\` verbatim. Never compute a time yourself or mention "UTC" unless the user explicitly asks.`
      : '') +
    (opts.systemExtra ? `\n\n${opts.systemExtra}` : '');
  // Strip old tool payloads from prior turns before sending (cost control).
  const messages: ModelMessage[] = [
    ...trimHistory(history, opts.keepToolTurns ?? 1),
    { role: 'user', content: [{ type: 'text', text: question }] },
  ];
  const toolCalls: { name: string; input: unknown }[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // Meter only the first round-trip so one user question = one quota unit,
    // regardless of how many tool rounds it takes.
    const res = await callModel({ system, messages, tools, meter: i === 0 });
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter(isToolUse);
    if (toolUses.length === 0) {
      const { text: answer, chart } = extractChart(textOf(res.content));
      return { answer, chart, toolCalls, iterations: i + 1, messages };
    }

    const results: ContentBlock[] = toolUses.map((tu) => {
      toolCalls.push({ name: tu.name, input: tu.input });
      try {
        return {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(runTool(sessions, tu.name, tu.input, opts.toolContext)),
        };
      } catch (e) {
        return {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
          is_error: true,
        };
      }
    });
    messages.push({ role: 'user', content: results });
  }

  // Cap hit. Rather than return a blank answer (a bad UX the eval caught), make
  // ONE final tool-free call so the model MUST answer from what it already
  // gathered. tools:[] removes the option to call another tool; meter=false
  // because iteration 0 already counted this question toward the quota.
  messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: "You've used all available tool calls. Answer the question now using ONLY the numbers already returned above; do not ask to run more queries. If what you gathered can't fully answer it, say what the data does show and what's missing.",
      },
    ],
  });
  try {
    const finalRes = await callModel({ system, messages, tools: [], meter: false });
    messages.push({ role: 'assistant', content: finalRes.content });
    const { text: answer, chart } = extractChart(textOf(finalRes.content));
    if (answer.trim())
      return {
        answer,
        chart,
        toolCalls,
        iterations: maxIterations,
        stopped: 'max_iterations',
        messages,
      };
  } catch {
    // fall through to the static fallback below — never return blank
  }
  return {
    answer:
      'I found several relevant figures but ran out of steps to finish the analysis. Try narrowing the question to one comparison at a time (for example, a single depth range or one date range).',
    chart: null,
    toolCalls,
    iterations: maxIterations,
    stopped: 'max_iterations',
    messages,
  };
}

/** Join the text blocks of a model response (dropping tool_use / tool_result). */
function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
