/**
 * Zod schemas for the .e08backup.json file format.
 *
 * The contract is documented at docs/export-schema.md in the app repo. We
 * keep these schemas LOOSE for forward-compat — only the fields the
 * analyzer actually consumes are validated. Unknown fields pass through
 * untouched via `.passthrough()` (Zod's default for `z.object()` is to
 * strip unknown keys; we want to keep them in case downstream phases need
 * them).
 *
 * Three principles:
 *   1. Reject anything that isn't an ELEMENT | 08 backup (appId check).
 *   2. Reject a schemaVersion that's NEWER than what we know about. Older
 *      versions are accepted and missing fields default at consumer level.
 *   3. Within sessions/dives, validate only the fields we touch. Lots of
 *      optional/nullable fields — the export captures more than any single
 *      view needs.
 */
import { z } from 'zod';

export const MAX_SUPPORTED_SCHEMA = 3;

// ─── Primitives ─────────────────────────────────────────────────────────────

const sessionTagSchema = z.enum([
  'co2_table',
  'o2_table',
  'comfy',
  'pb_attempt',
  'recovery',
]);

const effortRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ─── Session base ───────────────────────────────────────────────────────────

const baseSessionShape = {
  id: z.number(),
  date: z.string(),
  name: z.string(),
  blocks: z.number(),
  duration: z.string(),
  remarks: z.string().nullable().optional(),
  rating: effortRatingSchema.nullable().optional(),
  sessionTag: sessionTagSchema.nullable().optional(),
  breathingStyle: z.string().nullable().optional(),
};

const drySessionSchema = z
  .object({
    ...baseSessionShape,
    mode: z.literal('dry'),
    cyclesCount: z.number(),
  })
  .passthrough();

const depthSessionSchema = z
  .object({
    ...baseSessionShape,
    mode: z.literal('depth'),
    maxDepth: z.number(),
    discipline: z.string().optional(),
    location: z.string().optional(),
    dives: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

const poolSessionSchema = z
  .object({
    ...baseSessionShape,
    mode: z.literal('pool'),
    totalDistance: z.number(),
    poolType: z.enum(['25m', '50m', '-']).optional(),
    dives: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

export const sessionSchema = z.discriminatedUnion('mode', [
  drySessionSchema,
  depthSessionSchema,
  poolSessionSchema,
]);

export type ParsedSession = z.infer<typeof sessionSchema>;

// ─── Top-level backup file ──────────────────────────────────────────────────

export const backupFileSchema = z
  .object({
    appId: z.literal('element08'),
    schemaVersion: z.number(),
    appVersion: z.string().optional(),
    buildNumber: z.string().optional(),
    exportedAt: z.string().optional(),
    data: z
      .object({
        sessions: z.array(sessionSchema),
        // settings, programs, plans, customCharts: kept as arbitrary objects.
        // Forward-compat: never reject on these; consume what we know.
        settings: z.object({}).passthrough().optional(),
        programs: z.array(z.unknown()).optional(),
        plans: z.array(z.unknown()).optional(),
        season: z.array(z.unknown()).optional(), // v2 legacy alias for plans
        customCharts: z.array(z.unknown()).optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((b, ctx) => {
    if (b.schemaVersion > MAX_SUPPORTED_SCHEMA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Backup schema v${b.schemaVersion} is newer than this analyzer supports (max v${MAX_SUPPORTED_SCHEMA}). Update the analyzer or re-export from an older app build.`,
      });
    }
  });

export type ParsedBackup = z.infer<typeof backupFileSchema>;
