/**
 * Public surface of the AI dive-assistant library, ported from the ELEMENT | 08
 * app (src/lib/ai). The agent loop and tools run entirely in the browser over
 * the in-memory sessions; only the model call leaves the tab, via the
 * createProxyCallModel seam (Supabase /ask Edge Function).
 *
 * Typical use:
 *   const callModel = createProxyCallModel(getAccessToken);
 *   const res = await runAgent({ sessions: asAiSessions(parsed), question, callModel });
 */
import type { ParsedSession } from '../../schema/backup';
import type { Session } from './appTypes';

// ─── Agent loop + tools ──────────────────────────────────────────────────────
export { runAgent, runTool, extractChart, trimHistory, TOOLS, MAX_COMPARE_DIVES } from './agent';
export type {
  AgentOptions,
  AgentResult,
  CallModel,
  CallModelRequest,
  ModelMessage,
  ModelResponse,
  ContentBlock,
  Role,
  ToolContext,
  ChartDirective,
  DiveChartDirective,
  SeriesChartDirective,
  DiveCompareDirective,
  DiveProfileDirective,
  DiveBandsDirective,
  DiveSpeedDirective,
  HoldCompareDirective,
  PoolCompareDirective,
  OpenDiveDirective,
  DepthTimelineDirective,
  PoolScatterDirective,
  ProfileAvgDirective,
  DiveScatterDirective,
  OpenInsightsDirective,
  DiveRef,
} from './agent';

// Individual tools (schemas + executors), for narrowing the offered tool set.
export { runQuery, QUERY_DIVES_TOOL } from './queryTools';
export type { QuerySpec, QueryResult, QueryFilter, QueryMetric, Dataset } from './queryTools';
export { listDives, LIST_DIVES_TOOL, MAX_ROWS } from './listDives';
export type { ListDivesSpec, ListDivesResult } from './listDives';
export { getDiveDetail, GET_DIVE_DETAIL_TOOL } from './diveDetail';
export type { DiveDetailSpec, DiveDetailResult } from './diveDetail';
export { trainingSummary, TRAINING_SUMMARY_TOOL } from './trainingSummary';
export type { TrainingSummarySpec, TrainingSummaryResult, PlanLike } from './trainingSummary';
export { buildSystemPrompt } from './systemPrompt';
export { summarizeFields, renderAvailability } from './fieldCatalog';

// ─── Model transport ─────────────────────────────────────────────────────────
export { createProxyCallModel, AskError } from './callModel';
export type { AskErrorKind } from './callModel';

// ─── Types boundary ──────────────────────────────────────────────────────────
export type { Session } from './appTypes';

/**
 * Adapt the analyzer's parsed backup sessions to the AI library's app types.
 *
 * The analyzer validates backups with LOOSE zod schemas (`.passthrough()` in
 * src/schema/backup.ts): only the handful of fields each view touches are
 * declared, but every other field the app exported — dives, blockTimeline,
 * oxyReadings, contractions, advanced chips, … — passes through untouched on
 * the same objects. So a ParsedSession IS structurally an app `Session` at
 * runtime; TypeScript just can't see past the zod inference. Rather than
 * duplicating the full app model as zod schemas (a maintenance trap), we make
 * that structural-compat claim explicit in ONE place with a single cast. The
 * AI tools are defensive about missing/undefined fields (they treat absent
 * values as "not logged"), so older or partial backups degrade gracefully
 * instead of throwing.
 */
export function asAiSessions(sessions: ParsedSession[]): Session[] {
  return sessions as unknown as Session[];
}
