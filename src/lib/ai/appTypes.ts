/**
 * Self-contained copy of the ELEMENT | 08 app data-model types the AI library
 * needs (trimmed from the app's src/lib/models/types.ts).
 *
 * Deliberate deviations from the app file (keep this list current):
 *   - `PoolDive.trace` is typed `unknown` (the app types it with the Garmin
 *     protocol's DiveSignalTrace, which is RN/watch-specific and never read by
 *     the AI tools).
 *   - App-only sections are dropped: AppSettings / plans / themes / guided
 *     programs / chip-option constants, and the `LanguagePreference` import
 *     they needed. Nothing the AI library touches referenced them.
 * Everything else is structurally identical to the app definitions, so the
 * analyzer's zod-passthrough sessions (see index.ts asAiSessions) line up.
 */

// ─── Shared primitives ──────────────────────────────────────────────────────

export type LungVolume = 'FL' | 'FRC' | 'RV';

export type Discipline = 'CWT' | 'CWTB' | 'CNF' | 'FIM' | 'VWT' | 'NLT' | 'MIX';

/** Disciplines that can form one phase of a MIX dive (descent or ascent). */
export type MixPhaseDiscipline = 'CWT' | 'CWTB' | 'CNF' | 'FIM';

/** The two phases of a MIX dive, e.g. FIM down + CNF up. */
export interface MixPair {
  descent: MixPhaseDiscipline;
  ascent: MixPhaseDiscipline;
}

export type PoolDiscipline = 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';

export type PoolType = '25m' | '50m' | '-';

export type SessionTag = 'co2_table' | 'o2_table' | 'comfy' | 'pb_attempt' | 'recovery';

export type DiveType = 'warmup' | 'training' | 'competition' | 'safety' | 'excluded';

export type EffortRating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Self-reported worst hypoxia symptom (T39). 1 = clean → 4 = blackout.
 *  Optional + null by default — most sessions are clean and report nothing. */
export type HypoxiaLevel = 1 | 2 | 3 | 4;

export type BlockType = 'Rest' | 'Hold' | 'Recover' | 'Attempt' | 'Swim';

export type ImportSource = 'garmin' | 'suunto' | 'uddf' | 'csv' | 'import';

/** Dive alarm from dive computer */
export type DiveAlarmType = 'depth' | 'time' | 'speed';

export interface DiveAlarm {
  type: DiveAlarmType;
  /** Alarm depth in metres (for depth alarms) */
  depth: number | null;
  /** Alarm time in seconds (for time alarms) */
  time: number | null;
  /** Speed threshold in m/s (for speed alarms) */
  speed: number | null;
  /** Whether alarm is enabled */
  enabled: boolean;
  /** Triggers on descent */
  triggerOnDescent: boolean;
  /** Triggers on ascent */
  triggerOnAscent: boolean;
  /** Alarm repeats */
  repeating: boolean;
}

// ─── Profile & Readings ─────────────────────────────────────────────────────

/** 1 Hz depth profile point (depth dives) */
export interface ProfilePoint {
  /** Seconds from dive start */
  t: number;
  /** Depth in metres */
  d: number;
  /** Vertical speed m/s (negative = descending) */
  v?: number;
  /** Heart rate bpm */
  hr?: number;
  /** Water temperature °C */
  temp?: number;
}

/** Oximeter reading (dry sessions) */
export interface OxyReading {
  /** ms since oxyStartSession() */
  t: number;
  /** SpO2 % */
  s: number;
  /** Heart rate bpm */
  h: number;
  /** Perfusion index */
  p: number;
}

/** Contraction marker (dry sessions) */
export interface Contraction {
  /** Session-absolute seconds from play-press */
  elapsed: number;
  /** 0-based index of which Hold block this belongs to */
  holdIdx: number;
}

/** Block in a session timeline */
export interface BlockEntry {
  type: BlockType;
  seconds: number;
  /** Per-block effort rating. Currently meaningful for Hold blocks (one rating
   *  per breath-hold). Set from the hold-detail screen. */
  rating?: EffortRating | null;
  /** Per-hold free-text note, edited on the hold-detail screen. Only meaningful
   *  for Hold blocks. */
  note?: string | null;
  /** Per-hold lung-volume override, edited on the hold-detail screen. When
   *  unset, the hold inherits the session default (`DrySession.lungVol`). */
  lungVol?: LungVolume | null;
  /** Per-hold lung-packing override (count). Only meaningful for Hold blocks. */
  packs?: number;
  /** Total pause duration in milliseconds accumulated WHILE this block was the
   *  active block. `seconds` already excludes pause time; timeline walkers add
   *  this back to keep boundaries aligned with real-time oxyReadings. */
  pausedMs?: number;
}

// ─── Dive (within a depth session) ──────────────────────────────────────────

export type ContractionDirection = 'down' | 'up';

export interface ContractionOnset {
  /** Depth in metres at first contraction */
  depth: number;
  /** Direction of travel when first contraction was felt */
  direction: ContractionDirection;
}

export type MouthfillVolumeFeel = 'small' | 'medium' | 'full';

export type SuitThickness =
  | { kind: 'none' }
  | { kind: 'preset'; mm: 1.5 | 3 | 5 | 7 }
  | { kind: 'custom'; mm: number };

/** Where ballast is worn. Ankle is pool-only (DYN/DNF) but kept in the shared
 *  type for simplicity; UI gates which placements are offered per mode. */
export type WeightPlacement = 'neck' | 'belt' | 'ankle';

/** Ballast split across placements, kg per spot. When present it must sum to
 *  the dive's total `weightKg`. Absent = total only, placement unknown. */
export type WeightDist = Partial<Record<WeightPlacement, number>>;

export interface HangSegment {
  /** Start time in seconds from dive start (inclusive) */
  startT: number;
  /** End time in seconds from dive start (inclusive) */
  endT: number;
  /** Average depth of the segment in metres */
  avgD: number;
  /** Classification */
  type: 'bottom' | 'offBottom';
}

export interface Dive {
  /** Max depth in metres */
  depth: number;
  /** Total dive time in seconds */
  diveTime: number;
  /** Surface interval in seconds */
  si: number;
  /** Descent time in seconds */
  descentTime: number;
  /** Ascent time in seconds */
  ascentTime: number;
  /** Total hang time in seconds (sum of all hang segments) */
  hangTime: number;
  /** Individual hang segments detected in the profile. */
  hangs?: HangSegment[];
  /** Snapshot of the auto-detected hangs at the moment the user first
   *  manually edited a hang on this dive. */
  originalHangs?: HangSegment[];
  /** Descent speed m/s */
  descentSpeed: number;
  /** Ascent speed m/s */
  ascentSpeed: number;
  discipline: Discipline;
  /** Descent/ascent disciplines when `discipline === 'MIX'`, e.g. FIM down + CNF up. */
  mixDisciplines?: MixPair | null;
  lungVol?: LungVolume | null;
  /** Average heart rate bpm */
  hr: number | null;
  /** 1 Hz depth profile */
  profile: ProfilePoint[];
  tempSurface?: number | null;
  tempDepth?: number | null;
  /** Classification (mutually exclusive) */
  diveType?: DiveType | null;
  /** Legacy — kept in sync with diveType */
  training?: boolean;
  /** Depth at which mouthfill charge was taken, metres. Used for MF calc. */
  mfChargeDepth?: number | null;
  /** Depths (metres) at which the diver topped up the mouthfill below the
   *  initial charge. */
  mfTopUps?: number[];
  /** First contraction depth + direction. Both meaningless without each other. */
  contractionOnset?: ContractionOnset | null;
  /** Subjective mouthfill volume self-assessment. */
  mfVolumeFeel?: MouthfillVolumeFeel | null;
  /** Wetsuit thickness for the dive. */
  suit?: SuitThickness | null;
  /** Total ballast weight worn (kg). */
  weightKg?: number | null;
  /** Optional ballast split across placements (neck / belt / ankle). */
  weightDist?: WeightDist;
  /** Per-dive depth alarms. Overrides the session default when set. */
  alarms?: DiveAlarm[];
  /** Per-dive effort rating (1-10). */
  rating?: EffortRating | null;
  /** Per-dive hypoxia symptom (T39). Overrides the session value for this dive. */
  hypoxia?: HypoxiaLevel | null;
  /** Breathing technique used before the dive (built-in or custom label). */
  breathingStyle?: string | null;
  /** Detailed-logging fields. */
  advanced?: DepthAdvanced;
  /** True when the diver turned before reaching their declared target. */
  earlyTurn?: boolean;
  /** Declared target depth in metres. Only meaningful when earlyTurn=true. */
  targetDepth?: number;
  /** Reason the dive turned early. Categorical chip. */
  earlyTurnReason?: DepthEarlyTurnReason;
  /** Free-text per-dive notes. */
  remarks?: string | null;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

interface BaseSession {
  /** Unique ID — Date.now() at creation */
  id: number;
  /** ISO 8601 date string */
  date: string;
  name: string;
  /** Count of blocks or dives */
  blocks: number;
  /** Human-readable duration e.g. "12m 30s" */
  duration: string;
  remarks: string | null;
  rating: EffortRating | null;
  /** Self-reported worst hypoxia symptom for the session (T39). */
  hypoxia?: HypoxiaLevel | null;
  sessionTag: SessionTag | null;
  /** Pre-dive breathing technique (optional, available on all session types) */
  breathingStyle?: string | null;
}

/** Dry session — breath-hold training */
export interface DrySession extends BaseSession {
  mode: 'dry';
  cyclesCount: number;
  contractions: Contraction[];
  oxyReadings: OxyReading[];
  lungVol: LungVolume | null;
  blockTimeline: BlockEntry[];
  /** ms offset: oxyStartSession → first play press */
  playStart: number | null;
  /** Breathing technique used before holds (built-in id or custom label) */
  breathingStyle: string | null;
  /** Optional dry-dynamic training format (Apnea Walks / Squats / …). */
  dryActivity?: string | null;
  /** Optional flexible metrics for a manually-logged dry-dynamic training. */
  dryMetrics?: {
    durationSec?: number;
    rounds?: number;
    distanceM?: number;
    maxHoldSec?: number;
  } | null;
  /** Class of BLE device that recorded the oxy data.
   *  - 'oximeter': full SpO₂ + HR + PI (default, also applies to older sessions)
   *  - 'hrs': heart-rate-only — SpO₂/PI absent */
  deviceType?: 'oximeter' | 'hrs';
  /** Detailed-logging fields. */
  advanced?: DryAdvanced;
}

/** Where the water temperature value originated. */
export type TemperatureSource = 'device' | 'manual' | 'override';

/** Water environment for a depth session. 'pool' covers confined / deep-pool. */
export type WaterType = 'salt' | 'fresh' | 'pool';

/** Depth session — imported from dive computer */
export interface DepthSession extends BaseSession {
  mode: 'depth';
  discipline: string;
  location: string;
  tempSurface: number | null;
  tempDepth: number | null;
  waterTemp: number | null;
  /** Provenance of waterTemp. */
  waterTempSource?: TemperatureSource;
  /** Water environment (salt / fresh / pool). Optional. */
  waterType?: WaterType;
  maxDepth: number;
  source: ImportSource;
  deviceName: string;
  lat: number | null;
  lon: number | null;
  utcOffsetHours: number | null;
  dives: Dive[];
  /** Dive alarms configured on the dive computer */
  alarms?: DiveAlarm[];
  /** Session-level training intent (a SessionTypeDef id; may be a custom one). */
  sessionType?: string | null;
  /** Session default suit thickness. Per-dive Dive.suit overrides this. */
  suit?: SuitThickness | null;
  /** Session default ballast weight (kg). Per-dive Dive.weightKg overrides this. */
  weightKg?: number | null;
  /** Session default ballast split. Per-dive Dive.weightDist overrides this. */
  weightDist?: WeightDist;
}

// ─── Pool dive (within a pool session) ──────────────────────────────────────

/** Time-series point for pool dives (HR, depth, speed) */
export interface PoolProfilePoint {
  /** Seconds from dive start */
  t: number;
  /** Heart rate bpm (null if no reading) */
  hr: number | null;
  /** Depth in metres */
  depth: number | null;
  /** Speed in m/s */
  speed: number | null;
}

/** @deprecated Use PoolProfilePoint instead */
export type PoolHRPoint = { t: number; hr: number };

export interface PoolDive {
  discipline: PoolDiscipline;
  lungVol: LungVolume | null;
  /** Surface interval in seconds */
  si: number;
  /** Distance in metres (null for STA) */
  distance: number | null;
  /** Dive time in seconds */
  diveTime: number;
  /** Number of turns (auto-calculated or manual) */
  turns: number | null;
  /** True if user manually overrode auto-calculated turns */
  turnsManual: boolean;
  /** Contraction times in seconds from dive start */
  contractions: number[];
  /** Lap times in seconds */
  lapTimes: number[];
  /** Highest heart rate bpm */
  hrHighest: number | null;
  /** Lowest heart rate bpm */
  hrLowest: number | null;
  /** Per-dive remarks */
  remarks: string | null;
  /** Dive type classification */
  diveType?: DiveType | null;
  /** Per-dive effort rating */
  rating?: EffortRating | null;
  /** Per-dive hypoxia symptom (T39). Overrides the session value for this dive. */
  hypoxia?: HypoxiaLevel | null;
  /** Breathing style before the dive */
  breathingStyle?: string | null;
  /** Continuous HR profile from watch (1 Hz) — legacy, use profile instead */
  hrProfile?: PoolHRPoint[];
  /** Full 1 Hz profile: depth, HR, speed */
  profile?: PoolProfilePoint[];
  /** Downsampled per-dive motion signal from the watch. Typed `unknown` here:
   *  the app types it with the Garmin protocol's DiveSignalTrace, which the AI
   *  tools never read. */
  trace?: unknown;
  /** Detailed-logging fields. */
  advanced?: PoolAdvanced;
  /** Per-dive suit override. Falls back to PoolSession.suit when unset. */
  suit?: SuitThickness;
  /** Per-dive ballast override (kg). Falls back to PoolSession.weightKg. */
  weightKg?: number | null;
  /** Per-dive ballast split. Falls back to PoolSession.weightDist. */
  weightDist?: WeightDist;
}

/** Pool session — dynamic / static apnea in pool */
export interface PoolSession extends BaseSession {
  mode: 'pool';
  location: string;
  /** Start time HH:mm */
  startTime: string;
  poolType: PoolType;
  waterTemp: number | null;
  /** Provenance of waterTemp — see DepthSession.waterTempSource. */
  waterTempSource?: TemperatureSource;
  /** Total distance swum in metres */
  totalDistance: number;
  dives: PoolDive[];
  /** Session-level training intent (a SessionTypeDef id; may be a custom one). */
  sessionType?: string | null;
  /** Session default suit thickness. Per-dive PoolDive.suit overrides. */
  suit?: SuitThickness | null;
  /** Session default ballast weight (kg). Per-dive override possible. */
  weightKg?: number | null;
  /** Session default ballast split. Per-dive override possible. */
  weightDist?: WeightDist;
  /** Continuous HR samples spanning the entire session including rest periods.
   *  `t` is seconds from session start. Optional — older imports only have
   *  per-dive HR. */
  hrProfile?: { t: number; hr: number }[];
}

export type Session = DrySession | DepthSession | PoolSession;

// ─── Detailed-logging "Advanced" fields (per discipline) ────────────────────
// All optional categorical chips; only persisted when the user actively saved
// selections with detailed logging on.

// ── Depth advanced fields ──────────────────────────────────────────────────
export type DepthMaskMode = 'mask' | 'noseclip-goggles' | 'noseclip-only';
export type DepthWeightsMode = 'neckweight' | 'beltweight' | 'none';
export type DepthFinsMode = 'training' | 'competition' | 'none';
export type DepthWavesMode = 'big' | 'wavy' | 'flat';
export type DepthCurrentMode = 'strong' | 'mild' | 'none';
export type DepthThermoclineMode = 'strong' | 'mild' | 'none';
export type DepthEarlyTurnReason = 'squeeze' | 'eq' | 'hypoxia' | 'mental' | 'time-safety';
export type DepthEqMode = 'held' | 'leaking' | 'swallowing' | 'frenzel-failure';
export type DepthPaceMode = 'slow' | 'normal' | 'fast';
/** How the dive site was set up: off a floating buoy line vs a fixed platform. */
export type DepthPlatformMode = 'buoy' | 'platform';

export type MonofinMode = 'training' | 'competition';
export type BifinMode = 'training-short' | 'training-long' | 'competition';
export type FimFinsMode = 'fins' | 'none';

export interface DepthAdvanced {
  /** Wetsuit piece count (1-piece / 2-piece / none). Orthogonal to suit
   *  thickness (Dive.suit); shares WetsuitMode with pool. */
  wetsuit?: WetsuitMode;
  mask?: DepthMaskMode;
  weights?: DepthWeightsMode;
  /** Legacy generic-fins chip. */
  fins?: DepthFinsMode;
  /** CWT / monofin disciplines. */
  monofin?: MonofinMode;
  /** CWTB / bifin disciplines. */
  bifin?: BifinMode;
  /** FIM — fins for safety vs hands-only competition. */
  fimFins?: FimFinsMode;
  waves?: DepthWavesMode;
  current?: DepthCurrentMode;
  thermocline?: DepthThermoclineMode;
  /** Dive-site setup: buoy line vs fixed platform. */
  platform?: DepthPlatformMode;
  eq?: DepthEqMode;
  pace?: DepthPaceMode;
  /** Lung-packing count. Only meaningful when the dive's lungVol is 'FL'. */
  packs?: number;
  /** @deprecated Moved to Dive.earlyTurn. */
  earlyTurn?: boolean;
  /** @deprecated Moved to Dive.targetDepth. */
  targetDepth?: number;
  /** @deprecated Moved to Dive.earlyTurnReason. */
  earlyTurnReason?: DepthEarlyTurnReason;
}

// ── Dry advanced fields ────────────────────────────────────────────────────
export type DryNoseMode = 'clip' | 'none';
export type DryEyesMode = 'closed' | 'sleep-mask' | 'open';
export type DryExternalMode = 'music' | 'podcast' | 'quietness';
export type DryPlaceMode = 'bed' | 'sofa' | 'floor';
export type DryIndoorMode = 'indoors' | 'outdoors';
/** Where a breath-hold / static was done — dry land vs in the pool. */
export type DryEnvironmentMode = 'dry' | 'pool';
export type DryAmbientMode = 'quiet' | 'busy';
export type DryPositionMode = 'sitting' | 'laying' | 'standing';
export type DryRelaxationMode = 'mindfulness' | 'visualization' | 'mind-wander' | 'none';

export interface DryAdvanced {
  nose?: DryNoseMode;
  eyes?: DryEyesMode;
  external?: DryExternalMode;
  /** Dry land vs pool — a place tag; keeps the session a DrySession (T17). */
  environment?: DryEnvironmentMode;
  place?: DryPlaceMode;
  indoor?: DryIndoorMode;
  ambient?: DryAmbientMode;
  position?: DryPositionMode;
  relaxation?: DryRelaxationMode;
  /** Lung-packing count. Only meaningful when the session's lungVol is 'FL'. */
  packs?: number;
}

// ── Pool advanced fields ───────────────────────────────────────────────────
export type WetsuitMode = 'one-piece' | 'two-piece' | 'shorty' | 'none';
/** @deprecated alias — pool and depth now share the same wetsuit piece-count type. */
export type PoolWetsuitMode = WetsuitMode;
export type PoolSleevesMode = 'long' | 'short' | 'sleeveless';
export type PoolWeightsMode = 'neckweight' | 'neckweight-extension' | 'beltweight' | 'none';
export type PoolPoolMode = 'continuous' | 'with-drop';
export type PoolNoiseMode = 'loud' | 'quiet';
export type PoolPaceMode = 'slow' | 'normal' | 'fast' | 'slow-to-fast';
export type PoolGlidesMode = 'long' | 'normal' | 'short' | 'none';

export interface PoolAdvanced {
  wetsuit?: PoolWetsuitMode;
  /** Wetsuit sleeves (orthogonal to piece count). */
  sleeves?: PoolSleevesMode;
  weights?: PoolWeightsMode;
  /** DYN — monofin training vs competition. */
  monofin?: MonofinMode;
  /** DYNB — bifin training-short / training-long / competition. */
  bifin?: BifinMode;
  pool?: PoolPoolMode;
  noise?: PoolNoiseMode;
  pace?: PoolPaceMode;
  glides?: PoolGlidesMode;
  /** Lung-packing count. Only meaningful when the dive's lungVol is 'FL'. */
  packs?: number;
}

// ─── Per-hold oximeter stats (extractHoldStats output) ──────────────────────

export interface HoldStat {
  sessionId: number;
  /** 0-based Hold index within the session's blockTimeline (matches
   *  Contraction.holdIdx and the AI query layer's dry-row index). */
  holdIdx: number;
  date: Date;
  lv: string;
  durSec: number;
  minSpo2: number;
  baseline: number | null;
  atEnd: number;
  adMag: number;
  adDelay: number;
  recovSec: number | null;
  firstContrSec: number | null;
  avgInterval: number | null;
  contrCount: number;
  /** Heart rate over the hold window (bpm), from readings with h > 0. */
  hrMin: number | null;
  hrMax: number | null;
  hrAvg: number | null;
  /** Resting HR baseline (bpm): mean HR over the last 20s of the Rest block
   *  immediately before the hold. */
  hrBaseline: number | null;
  /** Dive-reflex bradycardia: % HR drop from baseline to the hold's HR nadir. */
  diveReflexPct: number | null;
  /** First-minute reflex: % HR drop from hold start to ~60s in. */
  diveReflex1minPct: number | null;
  /** HR (bpm) at the first contraction of the hold. */
  hrAtFirstContraction: number | null;
  /** Late-phase reflex: % HR drop from first contraction to hold end. */
  diveReflexPostContractionPct: number | null;
}
