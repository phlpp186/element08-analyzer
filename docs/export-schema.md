# ELEMENT | 08 — Export Schema

**Current version: v3** (will be re-released as **public v1** when the web analyzer ships)

This document is the contract between the ELEMENT | 08 app and any external
tool that reads exported data — most notably the web analyzer at
`analyze.element08.io`. Any field documented here is guaranteed to remain
present (or be gracefully fallback-handled) in future versions of the app.
Fields not documented here are internal and may change without notice.

The source of truth for the TypeScript types is
[`src/lib/models/types.ts`](../src/lib/models/types.ts). This file is the
human-readable contract; it should match the code.

---

## 1. File envelope

The export is a single JSON file: `element08-backup-YYYY-MM-DD-HHMMSS.json`.

```json
{
  "appId": "element08",
  "schemaVersion": 3,
  "appVersion": "1.0.0",
  "buildNumber": "20",
  "exportedAt": "2026-05-13T10:34:00.000Z",
  "data": { … }
}
```

| Field | Type | Notes |
|---|---|---|
| `appId` | `"element08"` | Must equal `"element08"`. Reject everything else. |
| `schemaVersion` | `number` | Currently `3`. Readers MUST accept any value ≤ their own max; reject newer. |
| `appVersion` | `string` | Semver of the app that produced the file. Informational. |
| `buildNumber` | `string` | iOS buildNumber at the moment of export. Informational. |
| `exportedAt` | `ISO 8601` | UTC timestamp of export. |
| `data` | `object` | The payload. See § 2. |

### Versioning rules

- **Major (breaking)**: increment `schemaVersion`. Older readers refuse to load.
- **Minor (additive)**: add new optional fields. Older readers ignore them; newer readers fall back when absent.
- **Field rename**: keep the old field readable for at least one major version. Example precedent: v2's `data.season` was renamed to `data.plans` in v3; current readers still accept either (see `readPlansFromBackup` in [src/lib/backup/index.ts](../src/lib/backup/index.ts)).

---

## 2. `data` payload

```ts
data: {
  sessions: Session[];      // training sessions (dry / depth / pool)
  settings: AppSettings;    // user preferences — informative for analyzer
  programs: SavedProgram[]; // custom Free Training programs
  plans: Plan[];            // training + season plans
  customCharts?: CustomChart[]; // user-built insight charts (optional, v2+)
}
```

The web analyzer primarily reads `sessions`. The other arrays are optional
to render but useful for coach views (plans, adherence).

---

## 3. Sessions

`Session` is a discriminated union on `mode`:

```ts
type Session = DrySession | DepthSession | PoolSession;
```

All sessions share these fields (from `BaseSession`):

| Field | Type | Notes |
|---|---|---|
| `id` | `number` | `Date.now()` at creation. Unique per app install. |
| `date` | `ISO 8601` | When the session was recorded. |
| `name` | `string` | User-editable or auto-generated. |
| `blocks` | `number` | Count of blocks (dry) or dives (depth/pool). |
| `duration` | `string` | Pre-formatted, e.g. `"12m 30s"`. |
| `remarks` | `string \| null` | Free-text notes. |
| `rating` | `1\|2\|3\|4\|5 \| null` | Session-level effort rating. |
| `sessionTag` | `enum \| null` | `'co2_table' \| 'o2_table' \| 'comfy' \| 'pb_attempt' \| 'recovery'` |
| `breathingStyle?` | `string \| null` | **Dry only** — Pool/Depth capture this per-dive. |
| `mode` | `"dry" \| "depth" \| "pool"` | Discriminator. |

### 3.1 Dry session (`mode: "dry"`)

Breath-hold training, no underwater component. The session itself is the
"dive" — there is no per-hold breakdown beyond what the timeline encodes.

| Field | Type | Notes |
|---|---|---|
| `cyclesCount` | `number` | Number of Hold blocks completed. |
| `contractions` | `Contraction[]` | Tap markers during holds. `{ elapsed, holdIdx }`. |
| `oxyReadings` | `OxyReading[]` | 1 Hz oximeter samples. `{ t, s, h, p }` = ms-from-start, SpO₂%, HR bpm, perfusion index. |
| `lungVol` | `"FL" \| "FRC" \| "RV" \| null` | Lung volume the holds were performed at. |
| `blockTimeline` | `BlockEntry[]` | Ordered Rest / Hold / Recover blocks with durations and optional `pausedMs`. |
| `playStart` | `number \| null` | ms offset between oxy stream start and first play press. Aligns `oxyReadings.t` to `blockTimeline` time. |
| `breathingStyle` | `string \| null` | Pre-hold breathing technique. Built-in id or custom label. |
| `deviceType?` | `"oximeter" \| "hrs"` | When `"hrs"`, SpO₂/PI columns are absent (HR-only device). |
| `advanced?` | `DryAdvanced` | Optional chip selections from detailed-logging mode. See § 6.1. |

### 3.2 Depth session (`mode: "depth"`)

Multi-dive depth training, typically imported from a dive computer.

| Field | Type | Notes |
|---|---|---|
| `discipline` | `string` | Session-level discipline summary (informational). |
| `location` | `string` | Free-text. |
| `tempSurface` | `number \| null` | Surface temperature. Unit depends on `settings.temperatureUnit`. |
| `tempDepth` | `number \| null` | Bottom temperature. |
| `waterTemp` | `number \| null` | Single representative temperature. |
| `waterTempSource?` | `"device" \| "manual" \| "override"` | Provenance of `waterTemp`. |
| `maxDepth` | `number` | Deepest dive in the session, metres. |
| `source` | `"garmin" \| "suunto" \| "uddf" \| "csv" \| "import"` | Import provenance. |
| `deviceName` | `string` | e.g. `"Garmin Descent Mk3"`. |
| `lat`, `lon` | `number \| null` | GPS coordinates if recorded. |
| `utcOffsetHours` | `number \| null` | Local UTC offset at the dive site. |
| `dives` | `Dive[]` | Per-dive details. See § 4.1. |
| `alarms?` | `DiveAlarm[]` | Dive computer alarms (depth/time/speed). |
| `sessionType?` | `DepthSessionType` | `'EQ' \| 'DA' \| 'TE' \| 'FE' \| 'MAX' \| 'RC'`. See [types.ts](../src/lib/models/types.ts) for labels. |
| `suit?` | `SuitThickness \| null` | Session default; per-dive override possible. |
| `weightKg?` | `number \| null` | Session default ballast. |

### 3.3 Pool session (`mode: "pool"`)

Dynamic / static pool training. Imported from a swim-capable dive computer
or logged manually.

| Field | Type | Notes |
|---|---|---|
| `location` | `string` | |
| `startTime` | `string` | `"HH:mm"` (local). |
| `poolType` | `"25m" \| "50m" \| "-"` | `"-"` for unknown / open water lap structure. |
| `waterTemp` | `number \| null` | |
| `waterTempSource?` | `"device" \| "manual" \| "override"` | |
| `totalDistance` | `number` | Sum of all dive distances, metres. |
| `dives` | `PoolDive[]` | Per-dive details. See § 4.2. |
| `sessionType?` | `PoolSessionType` | `'VOL' \| 'CO2' \| 'O2' \| 'SP' \| 'TE' \| 'MAX' \| 'FUN' \| 'RC'`. |
| `hrProfile?` | `{ t, hr }[]` | Session-spanning HR, including surface intervals between dives. `t` = seconds from session start. |
| `suit?` | `SuitThickness \| null` | Session default suit thickness. Per-dive `PoolDive.suit` overrides this. Added 2026-05-19, mirroring depth sessions. |
| `weightKg?` | `number \| null` | Session default ballast (kg). Per-dive `PoolDive.weightKg` overrides this. Added 2026-05-19. |

---

## 4. Dives

### 4.1 Depth dive (`Dive`)

One row inside `DepthSession.dives`.

| Field | Type | Notes |
|---|---|---|
| `depth` | `number` | Max depth, metres. |
| `diveTime` | `number` | Total time underwater, seconds. |
| `si` | `number` | Surface interval since previous dive, seconds. |
| `descentTime`, `ascentTime` | `number` | Seconds. |
| `hangTime` | `number` | Total hang seconds (sum of `hangs[].dur`). |
| `hangs?` | `HangSegment[]` | Detected hang segments. See § 5.1. |
| `originalHangs?` | `HangSegment[]` | Snapshot of the auto-detected `hangs` taken the moment the diver first manually edited a hang. Present ⇒ the current `hangs` (and the derived `descentTime` / `hangTime` / `ascentTime` / `descentSpeed` / `ascentSpeed`) are a manual override; absent ⇒ untouched auto. Readers can surface a "manually corrected" badge if they care. |
| `descentSpeed`, `ascentSpeed` | `number` | m/s. |
| `discipline` | `"CWT" \| "CWTB" \| "CNF" \| "FIM" \| "VWT"` | |
| `lungVol?` | `"FL" \| "FRC" \| "RV" \| null` | |
| `hr` | `number \| null` | Average heart rate, bpm. |
| `profile` | `ProfilePoint[]` | 1 Hz time-series. `{ t, d, v?, hr?, temp? }`. |
| `tempSurface?`, `tempDepth?` | `number \| null` | Per-dive temperature. |
| `diveType?` | `"warmup" \| "training" \| "competition" \| "safety" \| "excluded"` | |
| `rating?` | `1\|2\|3\|4\|5 \| null` | Per-dive effort rating. |
| `breathingStyle?` | `string \| null` | Per-dive pre-dive breathing technique. |
| `mfChargeDepth?` | `number \| null` | Mouthfill charge depth, metres. |
| `contractionOnset?` | `{ depth, direction: "up" \| "down" }` | First-contraction marker. |
| `mfVolumeFeel?` | `"small" \| "medium" \| "full"` | |
| `suit?` | `SuitThickness` | Per-dive override of session suit. |
| `weightKg?` | `number \| null` | Per-dive ballast override. |
| `earlyTurn?` | `boolean` | True when the diver turned before reaching the declared target. Previously lived under `advanced.earlyTurn`; promoted to top-level in 2026-05-19. Older backups still parse — the app's load-time migration moves the value up. |
| `targetDepth?` | `number` | Declared target depth in metres. Only meaningful with `earlyTurn === true`. Promoted from `advanced.targetDepth`. |
| `earlyTurnReason?` | enum | Categorical reason chip. Promoted from `advanced.earlyTurnReason`. |
| `remarks?` | `string \| null` | Free-text per-dive notes. Independent of the session-level `remarks` on the parent session. Added 2026-05-19; older backups don't carry it. |
| `advanced?` | `DepthAdvanced` | Optional chip selections (gear, conditions, technique). See § 6.2. |

### 4.2 Pool dive (`PoolDive`)

One row inside `PoolSession.dives`.

| Field | Type | Notes |
|---|---|---|
| `discipline` | `"STA" \| "DYN" \| "DYNB" \| "DNF" \| "other"` | |
| `lungVol` | `"FL" \| "FRC" \| "RV" \| null` | |
| `si` | `number` | Surface interval seconds since previous dive. |
| `distance` | `number \| null` | Metres. `null` for STA. |
| `diveTime` | `number` | Seconds. |
| `turns` | `number \| null` | Final turn count (auto-calculated or user-overridden). |
| `turnsManual` | `boolean` | `true` if the user manually set `turns`. Prevents session-level recompute. |
| `contractions` | `number[]` | Seconds from dive start. |
| `lapTimes` | `number[]` | Per-lap times in seconds. May not sum exactly to `diveTime` (rounding). |
| `hrHighest`, `hrLowest` | `number \| null` | Bpm. |
| `remarks` | `string \| null` | Per-dive notes. |
| `diveType?` | `DiveType` | Same enum as depth. |
| `rating?` | `1\|2\|3\|4\|5 \| null` | |
| `breathingStyle?` | `string \| null` | Per-dive. |
| `profile?` | `PoolProfilePoint[]` | 1 Hz `{ t, hr, depth, speed }`. |
| `hrProfile?` | `{ t, hr }[]` | **Deprecated.** Use `profile` instead. Older imports populate this. |
| `suit?` | `SuitThickness` | Per-dive suit override. Falls back to `PoolSession.suit`. Added 2026-05-19. |
| `weightKg?` | `number \| null` | Per-dive ballast override (kg). Falls back to `PoolSession.weightKg`. Added 2026-05-19. |
| `advanced?` | `PoolAdvanced` | Optional chip selections. See § 6.3. |

---

## 5. Algorithm-derived structures

### 5.1 `HangSegment` (depth dives)

```ts
{ startT, endT, avgD, type: "bottom" | "offBottom" }
```

Times are seconds from dive start. `bottom` hangs sit within 2 m of the
dive's deepest point; `offBottom` hangs are stationary periods at shallower
depths (e.g. FIM rest stops).

### 5.2 `DiveAlarm` (depth sessions)

```ts
{ type: "depth" | "time" | "speed", depth, time, speed, enabled,
  triggerOnDescent, triggerOnAscent, repeating }
```

Mirrors dive computer alarm config. Used by the analyzer to overlay alarm
thresholds on the depth profile.

---

## 6. Detailed-logging "Advanced" chips

These fields are only present when the diver opted in via Settings →
Detailed Logging AND actively tapped a chip. All chips are categorical
enums (no free-form text) to keep analytics group-friendly. See
[types.ts](../src/lib/models/types.ts) sections marked
"Depth / Dry / Pool advanced fields" for the full option lists.

### 6.1 `DryAdvanced`
`nose`, `eyes`, `external`, `place`, `indoor`, `ambient`, `position`, `relaxation`.

### 6.2 `DepthAdvanced`
`mask`, `weights`, `fins`, `monofin`, `bifin`, `fimFins`, `waves`,
`current`, `thermocline`, `eq`, `pace`.

Fin chips surface per-discipline (added 2026-05-19):

| Discipline | Chip field | Values |
|---|---|---|
| `CWT` | `monofin` | `'training' \| 'competition'` |
| `CWTB` | `bifin` | `'training-short' \| 'training-long' \| 'competition'` |
| `FIM` | `fimFins` | `'fins' \| 'none'` (fins-for-safety vs hands-only competition) |
| `CNF` | — | no fin chip |
| other / unknown | `fins` | legacy `'training' \| 'competition' \| 'none'` |

The legacy `fins` chip is still read on older dives; new logs on known
disciplines use one of `monofin` / `bifin` / `fimFins`.

`earlyTurn` / `targetDepth` / `earlyTurnReason` were promoted out of
`advanced` to top-level `Dive` fields in 2026-05-19 — they describe
what happened on the dive, not optional chip metadata. Older backups
still parse; the app's load-time migration moves them up.

### 6.3 `PoolAdvanced`
`wetsuit`, `sleeves`, `weights`, `monofin`, `bifin`, `pool`, `noise`,
`pace`, `glides`.

Wetsuit piece-count and sleeve length are orthogonal (a one-piece can
be long-sleeved or sleeveless, etc.), so they live in two separate
fields (added 2026-05-19):

| Field | Values |
|---|---|
| `wetsuit` | `'one-piece' \| 'two-piece' \| 'shorty' \| 'none'` |
| `sleeves` | `'long' \| 'short' \| 'sleeveless'` — only meaningful when `wetsuit !== 'none'` |

Fin chips surface per-discipline:

| Discipline | Chip field | Values |
|---|---|---|
| `DYN` | `monofin` | `'training' \| 'competition'` |
| `DYNB` | `bifin` | `'training-short' \| 'training-long' \| 'competition'` |
| `STA` / `DNF` | — | no fin chip |

---

## 7. Settings, programs, plans, custom charts

These travel along with the export but the analyzer renders them as
context, not primary content.

- `settings: AppSettings` — display preferences (units, date format, theme).
  The analyzer should respect `units` and `temperatureUnit` when formatting
  numbers it parsed in metric.
- `programs: SavedProgram[]` — user-built Free Training programs.
- `plans: Plan[]` — training + season plans, with completion state per
  `plannedSessions[].completedAt`. Used for adherence views in coach mode.
- `customCharts?: CustomChart[]` — definitions of user-built charts in the
  Insights tab. Optional for the analyzer to render; mostly informational.

---

## 8. Reader checklist (web analyzer)

When implementing a reader, follow this order:

1. Parse JSON. Reject empty / malformed.
2. Verify `appId === "element08"`. Reject otherwise.
3. Verify `schemaVersion` is a number ≤ reader's max supported. Reject newer.
4. Verify `data` exists and contains arrays for `sessions`, `programs`, and either `plans` or `season`.
5. For each session, branch on `mode`. Ignore unknown modes (forward-compat) rather than throwing.
6. For optional fields, default sensibly. Especially: missing `advanced`, missing `breathingStyle`, missing `hangs`.
7. When rendering, distinguish "data not captured" (field null/absent) from "data captured as zero." Empty cell, not zero, for missing values.

---

## 9. Privacy contract

The export file contains the diver's complete training history. It must
**never** be uploaded to a server by the analyzer. All processing happens
in the user's browser. This is part of the ELEMENT | 08 brand promise and
the technical decision to ship the analyzer as a static SPA exists to
enforce it.

---

*Last updated: 2026-05-16. Maintained alongside `src/lib/backup/index.ts`
and `src/lib/models/types.ts` — if those change, this document changes.*
