/**
 * CompareDives — overlay individual dives/holds across sessions.
 *
 * Three modes, switched by the pill row under the header:
 *   - Depth — up to 3 depth profiles on one inverted-depth chart.
 *   - Holds — up to 8 breath holds on stacked HR + SpO2 panels.
 *   - Pool  — pool dives: HR-vs-time overlay + avg-speed bars, then the
 *              lap splits side by side (and strokes per lap where the diver
 *              confirmed a motion trace), which is where a dynamic is won or
 *              lost and where no total can show it.
 *
 * Each mode keeps its own selection (useDiveCompareStore) and shares one
 * generic cross-session picker. Layout mirrors CompareSeasons: wide left
 * column (chart + stat table), 320px right panel (picker).
 */
import { useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n';
import type { ParsedSession } from '../schema/backup';
import { useBackupStore } from '../stores/useBackupStore';
import {
  MAX_BY_MODE,
  useDiveCompareStore,
  type CompareMode,
  type CompareSlot,
} from '../stores/useDiveCompareStore';
import { CompareModeHeader } from '../components/CompareModeHeader';
import {
  DiveOverlayChart,
  type OverlayAlign,
} from '../components/charts/DiveOverlayChart';
import {
  HoldOverlayChart,
  type HoldAlign,
} from '../components/charts/HoldOverlayChart';
import { PoolOverlayChart } from '../components/charts/PoolOverlayChart';
import { buildCatalog, type CatalogEntry } from '../lib/analytics/diveCatalog';
import { extractDiveData, type DepthDiveData } from '../lib/analytics/diveProfile';
import { extractPoolDiveData } from '../lib/analytics/poolDiveProfile';
import { lapSplits } from '../lib/analytics/lapSplits';
import { PoolLapCompareChart } from '../components/charts/PoolLapCompareChart';
import {
  extractHoldSlice,
  holdStats,
  type HoldSlice,
  type HoldStats,
} from '../lib/analytics/holdCompare';
import { formatDate } from '../lib/format';
import { diveQuickPicks } from '../lib/analytics/quickPicks';

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'holds', label: 'Holds' },
  { id: 'pool', label: 'Pool' },
];

/** What every compared item carries for its player card. */
interface EntryBase {
  slot: CompareSlot;
  color: string;
  label: string;
  /** Card headline, e.g. "FIM 71.8m". */
  title: string;
  /** Card second line: date and session. */
  sub: string;
}
interface DepthEntry extends EntryBase {
  data: DepthDiveData;
  dive: any;
}
interface PoolEntry extends EntryBase {
  hrSeries: [number, number][];
  avgSpeed: number | null;
  dive: any;
}
interface HoldEntry extends EntryBase {
  slice: HoldSlice;
  stats: HoldStats;
}

// Optional secondary panel in depth-compare mode. 'off' = depth alone.
type DepthSecondary = 'off' | 'speed' | 'hr' | 'temp';

const METRIC_META: Record<
  Exclude<DepthSecondary, 'off'>,
  { label: string; unit: string; hint: string; has: (data: DepthDiveData) => boolean }
> = {
  speed: { label: 'Vertical Speed', unit: 'm/s', hint: 'negative = descending', has: (d) => d.hasSpeed },
  hr:    { label: 'Heart Rate',     unit: 'bpm', hint: '',                     has: (d) => d.hasHR },
  temp:  { label: 'Temperature',    unit: '°C',  hint: '',                     has: (d) => d.hasTemp },
};

export function CompareDives() {
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const selections = useDiveCompareStore((s) => s.selections);
  const toggle = useDiveCompareStore((s) => s.toggle);
  const clear = useDiveCompareStore((s) => s.clear);
  const remove = useDiveCompareStore((s) => s.remove);
  const setPicks = useDiveCompareStore((s) => s.setPicks);
  const searchRef = useRef<HTMLInputElement>(null);

  // ?mode=pool / holds: a session page's "Compare dives" opens the right mode.
  const [params] = useSearchParams();
  const [mode, setMode] = useState<CompareMode>(() => {
    const m = params.get('mode');
    return m === 'pool' || m === 'holds' ? m : 'depth';
  });
  const [query, setQuery] = useState('');
  const [depthAlign, setDepthAlign] = useState<OverlayAlign>('start');
  // Which optional secondary panel to stack under the depth profile in
  // depth-compare mode. 'off' keeps it to just depth.
  const [depthSecondary, setDepthSecondary] = useState<DepthSecondary>('off');
  // Speed-marker step on each dive's depth curve (m). 0 = off.
  const [depthSpeedStep, setDepthSpeedStep] = useState<0 | 5 | 10>(0);
  // Moving-average window applied to the secondary speed panel. 0 = raw.
  const [depthSpeedSmooth, setDepthSpeedSmooth] = useState<0 | 5 | 15>(0);
  const [holdAlign, setHoldAlign] = useState<HoldAlign>('start');

  const sessions = backup?.data.sessions ?? [];
  const slots = selections[mode];

  const catalog = useMemo(() => buildCatalog(sessions, mode), [sessions, mode]);
  const quickPicks = useMemo(
    () => diveQuickPicks(catalog, mode, MAX_BY_MODE[mode], t),
    [catalog, mode, t],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((e) => e.search.includes(q)) : catalog;
  }, [catalog, query]);

  const depthEntries = useMemo(
    () => (mode === 'depth' ? resolveDepth(sessions, slots, t) : []),
    [mode, sessions, slots, t],
  );
  const poolEntries = useMemo(
    () => (mode === 'pool' ? resolvePool(sessions, slots, t) : []),
    [mode, sessions, slots, t],
  );
  const holdEntries = useMemo(
    () => (mode === 'holds' ? resolveHolds(sessions, slots, t) : []),
    [mode, sessions, slots, t],
  );

  if (!backup) return <Navigate to="/" replace />;

  const full = slots.length >= MAX_BY_MODE[mode];
  const entries: EntryBase[] =
    mode === 'depth' ? depthEntries : mode === 'holds' ? holdEntries : poolEntries;
  const pickKey = (picks: { sessionId: number; idx: number }[]) =>
    picks.map((p) => `${p.sessionId}.${p.idx}`).join(',');
  const currentKey = pickKey(slots);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CompareModeHeader
        mode="dives"
        description={t('Overlay individual dives or holds from any session. Switch between depth profiles, breath holds, and pool dives below.')}
      />

      <div className="mb-6 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              setQuery('');
            }}
            className={`pill px-4 py-1.5 text-sm ${mode === m.id ? 'pill-on' : ''}`}
          >
            {t(m.label)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {quickPicks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
                {t('Quick picks')}
              </span>
              {quickPicks.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setPicks(mode, q.picks)}
                  className={`pill px-3.5 py-1 text-sm ${pickKey(q.picks) === currentKey ? 'pill-on' : ''}`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
          {slots.length > 0 && (
            <PlayerCards
              entries={entries}
              full={full}
              onRemove={(slot) => remove(mode, slot.sessionId, slot.idx)}
              onAdd={() => searchRef.current?.focus()}
            />
          )}
          {slots.length === 0 ? (
            <Placeholder>
              {mode === 'holds'
                ? t('Pick holds from the panel to overlay them.')
                : t('Pick dives from the panel to overlay them.')}
            </Placeholder>
          ) : mode === 'depth' ? (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <PillToggle
                  label={t('Align')}
                  value={depthAlign}
                  onChange={setDepthAlign}
                  options={[
                    { id: 'start', label: t('Start'), hint: t('Aligned at t=0') },
                    { id: 'maxdepth', label: t('Max depth'), hint: t('Aligned at the deepest point') },
                  ]}
                />
                <PillToggle
                  label={t('Show')}
                  value={depthSecondary}
                  onChange={setDepthSecondary}
                  options={[
                    { id: 'off', label: t('Off'), hint: t('Just the depth profile') },
                    { id: 'speed', label: t('Speed'), hint: t('Add vertical speed under depth') },
                    { id: 'hr', label: 'HR', hint: t('Add heart rate under depth') },
                    { id: 'temp', label: t('Temp'), hint: t('Add temperature under depth') },
                  ]}
                />
                <PillToggle
                  label={t('Speed markers')}
                  value={depthSpeedStep}
                  onChange={setDepthSpeedStep}
                  options={[
                    { id: 0, label: t('Off'), hint: t('No speed read-outs on the depth curve') },
                    { id: 5, label: '5m', hint: t('Mark every 5 m crossing with vertical speed') },
                    { id: 10, label: '10m', hint: t('Mark every 10 m crossing with vertical speed') },
                  ]}
                />
                {depthSecondary === 'speed' && (
                  <PillToggle
                    label={t('Speed smoothing')}
                    value={depthSpeedSmooth}
                    onChange={setDepthSpeedSmooth}
                    options={[
                      { id: 0, label: t('Raw'), hint: t('No smoothing, show the raw oscillation') },
                      { id: 5, label: t('Light'), hint: t('Light moving average') },
                      { id: 15, label: t('Strong'), hint: t('Strong moving average, flatten FIM cycles') },
                    ]}
                  />
                )}
              </div>
              <div className="board space-y-2 p-3">
                {(() => {
                  const overlay = depthEntries.map((e) => ({
                    color: e.color,
                    label: e.label,
                    data: e.data,
                  }));
                  if (depthSecondary === 'off') {
                    return (
                      <DiveOverlayChart
                        dives={overlay}
                        align={depthAlign}
                        metric="depth"
                        height={420}
                        speedStep={depthSpeedStep}
                      />
                    );
                  }
                  const secondary = depthSecondary as Exclude<DepthSecondary, 'off'>;
                  const meta = METRIC_META[secondary];
                  const hasData = depthEntries.some((e) => meta.has(e.data));
                  return (
                    <>
                      <PanelHeader label={t('Depth')} unit="m" />
                      <DiveOverlayChart
                        dives={overlay}
                        align={depthAlign}
                        metric="depth"
                        height={300}
                        groupId="compare-depth"
                        speedStep={depthSpeedStep}
                      />
                      <PanelHeader label={t(meta.label)} unit={meta.unit} hint={t(meta.hint)} />
                      {hasData ? (
                        <DiveOverlayChart
                          dives={overlay}
                          align={depthAlign}
                          metric={secondary}
                          height={200}
                          groupId="compare-depth"
                          showLegend={false}
                          speedSmooth={secondary === 'speed' ? depthSpeedSmooth : 0}
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-8 text-center text-sm text-textDim">
                          {t('No {metric} data on the selected dives.').replace('{metric}', t(meta.label).toLowerCase())}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <StatBars columns={depthEntries} rows={depthRows(depthEntries, t)} />
            </>
          ) : mode === 'holds' ? (
            <>
              <PillToggle
                label={t('Align')}
                value={holdAlign}
                onChange={setHoldAlign}
                options={[
                  { id: 'start', label: t('Hold start'), hint: t('Aligned at the hold start') },
                  { id: 'end', label: t('Hold end'), hint: t('Aligned at the hold end') },
                ]}
              />
              <div className="board p-3">
                <HoldOverlayChart
                  holds={holdEntries.map((e) => ({
                    color: e.color,
                    label: e.label,
                    durationSec: e.slice.durationSec,
                    hrSeries: e.slice.hrSeries,
                    spo2Series: e.slice.spo2Series,
                  }))}
                  align={holdAlign}
                  groupId="compare-holds"
                />
              </div>
              <StatBars columns={holdEntries} rows={holdRows(holdEntries, t)} />
            </>
          ) : (
            <>
              <PoolOverlayChart
                dives={poolEntries.map((e) => ({
                  color: e.color,
                  label: e.label,
                  hrSeries: e.hrSeries,
                  avgSpeed: e.avgSpeed,
                }))}
              />
              <div className="board p-4">
                <PoolLapCompareChart
                  dives={poolEntries.map((e) => ({
                    color: e.color,
                    label: e.label,
                    laps: lapSplits(e.dive),
                  }))}
                />
              </div>
              <StatBars columns={poolEntries} rows={poolRows(poolEntries, t)} />
            </>
          )}
        </div>

        <Picker
          key={mode}
          inputRef={searchRef}
          catalog={filtered}
          totalCount={catalog.length}
          query={query}
          onQuery={setQuery}
          slots={slots}
          full={full}
          max={MAX_BY_MODE[mode]}
          mode={mode}
          onToggle={(sessionId, idx) => toggle(mode, sessionId, idx)}
          onClear={() => clear(mode)}
        />
      </div>
    </div>
  );
}

// ─── Slot resolution ────────────────────────────────────────────────────────

function dedupe(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n > 0 ? `${base} (${n + 1})` : base;
}

function resolveDepth(sessions: ParsedSession[], slots: CompareSlot[], t: (s: string) => string): DepthEntry[] {
  const seen = new Map<string, number>();
  const out: DepthEntry[] = [];
  for (const slot of slots) {
    const session = sessions.find((s) => s.id === slot.sessionId);
    if (!session || session.mode !== 'depth') continue;
    const dive = (session as any).dives?.[slot.idx];
    if (!dive) continue;
    const base = `${formatDate(session.date)} · ${dive.discipline || t('Depth')} · ${dive.depth}m`;
    out.push({
      slot,
      color: slot.color,
      label: dedupe(base, seen),
      title: `${dive.discipline || t('Depth')} ${dive.depth}m`,
      sub: `${formatDate(session.date)} · ${session.name}`,
      data: extractDiveData(dive),
      dive,
    });
  }
  return out;
}

function resolvePool(sessions: ParsedSession[], slots: CompareSlot[], t: (s: string) => string): PoolEntry[] {
  const seen = new Map<string, number>();
  const out: PoolEntry[] = [];
  for (const slot of slots) {
    const session = sessions.find((s) => s.id === slot.sessionId);
    if (!session || session.mode !== 'pool') continue;
    const dive = (session as any).dives?.[slot.idx];
    if (!dive) continue;
    const distance = typeof dive.distance === 'number' ? dive.distance : null;
    const diveTime = typeof dive.diveTime === 'number' ? dive.diveTime : 0;
    const avgSpeed = distance != null && diveTime > 0 ? distance / diveTime : null;
    const base = `${formatDate(session.date)} · ${dive.discipline || t('Pool')} · ${
      distance != null ? `${distance}m` : t('static')
    }`;
    out.push({
      slot,
      color: slot.color,
      label: dedupe(base, seen),
      title: `${dive.discipline || t('Pool')} ${distance != null ? `${distance}m` : fmtSec(diveTime)}`,
      sub: `${formatDate(session.date)} · ${session.name}`,
      hrSeries: extractPoolDiveData(dive).hrSeries,
      avgSpeed,
      dive,
    });
  }
  return out;
}

function resolveHolds(sessions: ParsedSession[], slots: CompareSlot[], t: (s: string) => string): HoldEntry[] {
  const seen = new Map<string, number>();
  const out: HoldEntry[] = [];
  for (const slot of slots) {
    const session = sessions.find((s) => s.id === slot.sessionId);
    if (!session || session.mode !== 'dry') continue;
    const slice = extractHoldSlice(session, slot.idx);
    if (!slice) continue;
    const base = `${formatDate(session.date)} · ${t('Hold')} ${slot.idx + 1}`;
    out.push({
      slot,
      color: slot.color,
      label: dedupe(base, seen),
      title: `${t('Hold')} ${slot.idx + 1} · ${fmtSec(slice.durationSec)}`,
      sub: `${formatDate(session.date)} · ${session.name}`,
      slice,
      stats: holdStats(slice),
    });
  }
  return out;
}

// ─── Stat rows ──────────────────────────────────────────────────────────────

/** One metric across the compared items. `better` marks which way is
 *  better, so the best value gets the star; null where neither is (a longer
 *  dive time is not a better one). */
interface StatRow {
  label: string;
  values: (number | null)[];
  fmt: (v: number) => string;
  better: 'high' | 'low' | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

function depthRows(entries: DepthEntry[], t: (s: string) => string): StatRow[] {
  const m = (v: number) => `${v}m`;
  return [
    { label: t('Max depth'), values: entries.map((e) => num(e.dive.depth)), fmt: m, better: 'high' },
    { label: t('Dive time'), values: entries.map((e) => num(e.dive.diveTime)), fmt: fmtSec, better: null },
    { label: t('Descent'), values: entries.map((e) => num(e.dive.descentTime)), fmt: fmtSec, better: null },
    { label: t('Hang'), values: entries.map((e) => num(e.dive.hangTime)), fmt: fmtSec, better: null },
    { label: t('Ascent'), values: entries.map((e) => num(e.dive.ascentTime)), fmt: fmtSec, better: null },
    { label: t('Descent speed'), values: entries.map((e) => num(e.dive.descentSpeed)), fmt: fmtSpeed, better: 'high' },
    { label: t('Ascent speed'), values: entries.map((e) => num(e.dive.ascentSpeed)), fmt: fmtSpeed, better: 'high' },
  ];
}

function poolRows(entries: PoolEntry[], t: (s: string) => string): StatRow[] {
  return [
    { label: t('Distance'), values: entries.map((e) => num(e.dive.distance)), fmt: (v) => `${v}m`, better: 'high' },
    { label: t('Dive time'), values: entries.map((e) => num(e.dive.diveTime)), fmt: fmtSec, better: null },
    { label: t('Avg speed'), values: entries.map((e) => e.avgSpeed), fmt: fmtSpeed, better: 'high' },
    { label: t('Rating'), values: entries.map((e) => num(e.dive.rating)), fmt: fmtRating, better: null },
  ];
}

function holdRows(entries: HoldEntry[], t: (s: string) => string): StatRow[] {
  return [
    { label: t('Duration'), values: entries.map((e) => num(e.slice.durationSec)), fmt: fmtSec, better: 'high' },
    {
      label: t('Contractions'),
      values: entries.map((e) => e.slice.contractionCount),
      fmt: (v) => String(v),
      better: null,
    },
    { label: t('Rating'), values: entries.map((e) => num(e.slice.rating)), fmt: fmtRating, better: null },
    { label: 'Min SpO₂', values: entries.map((e) => e.stats.minSpo2), fmt: fmtPct, better: 'high' },
    { label: 'Min HR', values: entries.map((e) => e.stats.minHr), fmt: fmtBpm, better: null },
    { label: t('HR at end'), values: entries.map((e) => e.stats.hrAtEnd), fmt: fmtBpm, better: null },
    { label: 'SpO₂ +30s', values: entries.map((e) => e.stats.spo2Post30), fmt: fmtPct, better: 'high' },
  ];
}

// ─── Metric bars ────────────────────────────────────────────────────────────

/** Each metric as one bar per compared item, scaled to the largest, with a
 *  star on the best where "best" has a direction. */
function StatBars({ columns, rows }: { columns: { color: string }[]; rows: StatRow[] }) {
  return (
    <div className="board space-y-3 p-4">
      {rows
        .filter((row) => row.values.some((v) => v != null))
        .map((row) => {
          let max = 0;
          let best: number | null = null;
          let present = 0;
          for (const v of row.values) {
            if (v == null) continue;
            present++;
            if (v > max) max = v;
            if (best == null || (row.better === 'high' ? v > best : v < best)) best = v;
          }
          if (!row.better || present < 2) best = null;
          return (
            <div key={row.label} className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
                {row.label}
              </span>
              <div className="space-y-1">
                {row.values.map((v, i) => {
                  const color = columns[i]?.color ?? 'rgb(var(--c-accent))';
                  const isBest = v != null && v === best;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          width: v != null && max > 0 ? `${Math.max(3, (v / max) * 75)}%` : '3%',
                          background: v != null ? color : 'rgb(var(--c-border))',
                          boxShadow: isBest ? `0 0 8px ${color}` : undefined,
                        }}
                      />
                      <span className="whitespace-nowrap font-num text-xs font-bold tabular-nums text-text">
                        {v != null ? row.fmt(v) : '-'}
                        {isBest && <span className="ml-1 text-amber">★</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ─── Player cards ───────────────────────────────────────────────────────────

/** The compared items as coloured cards on top, each with a remove button,
 *  and a dashed slot to add another while there is room. */
function PlayerCards({
  entries,
  full,
  onRemove,
  onAdd,
}: {
  entries: EntryBase[];
  full: boolean;
  onRemove: (slot: CompareSlot) => void;
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
      {entries.map((e) => (
        <div
          key={`${e.slot.sessionId}-${e.slot.idx}`}
          className="flex min-w-0 items-start gap-2 rounded-xl px-3 py-2"
          style={{
            background: e.color,
            borderTop: `2px solid color-mix(in srgb, ${e.color}, #fff 40%)`,
            borderBottom: `4px solid color-mix(in srgb, ${e.color}, #000 35%)`,
            color: `color-mix(in srgb, ${e.color}, #000 78%)`,
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-num text-base font-bold">{e.title}</div>
            <div className="truncate text-[11px] font-extrabold opacity-80">{e.sub}</div>
          </div>
          <button
            onClick={() => onRemove(e.slot)}
            aria-label={`${t('Remove')} ${e.title}`}
            className="text-sm font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
      {!full && (
        <button
          onClick={onAdd}
          className="rounded-xl border-2 border-dashed border-textDim/50 px-3 py-2 font-num text-sm font-bold text-textDim hover:border-accent hover:text-accent"
        >
          + {t('Add')}
        </button>
      )}
    </div>
  );
}

// ─── Panel header (small caption above each chart) ──────────────────────────

function PanelHeader({ label, unit, hint }: { label: string; unit: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {label}
      </h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">{unit}</span>
      {hint && (
        <span className="font-mono text-[10px] text-textDim opacity-50">· {hint}</span>
      )}
    </div>
  );
}

// ─── Alignment toggle ───────────────────────────────────────────────────────

function PillToggle<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; hint: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.hint}
          className={`pill px-3 py-0.5 font-mono text-[11px] ${value === o.id ? 'pill-on' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Cross-session picker ───────────────────────────────────────────────────

function Picker({
  inputRef,
  catalog,
  totalCount,
  query,
  onQuery,
  slots,
  full,
  max,
  mode,
  onToggle,
  onClear,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  catalog: CatalogEntry[];
  totalCount: number;
  query: string;
  onQuery: (q: string) => void;
  slots: CompareSlot[];
  full: boolean;
  max: number;
  mode: CompareMode;
  onToggle: (sessionId: number, idx: number) => void;
  onClear: () => void;
}) {
  const t = useT();
  const slotFor = (e: CatalogEntry) =>
    slots.find((s) => s.sessionId === e.sessionId && s.idx === e.idx);
  const noun = mode === 'holds' ? t('Holds') : t('Dives');
  const [discipline, setDiscipline] = useState<string | null>(null);
  // Dives without a profile cannot be drawn; hide them unless asked.
  const [profileOnly, setProfileOnly] = useState(true);
  const disciplines = useMemo(
    () => (mode === 'holds' ? [] : [...new Set(catalog.map((e) => e.discipline))].sort()),
    [catalog, mode],
  );
  const shown = catalog.filter(
    (e) =>
      (discipline == null || e.discipline === discipline) &&
      !(mode === 'depth' && profileOnly && e.disabled),
  );

  return (
    <div className="board p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {noun} · {slots.length}/{max}
        </h2>
        {slots.length > 0 && (
          <button
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
          >
            {t('Clear')}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t('Filter by date, discipline…')}
        className="mb-3 w-full rounded-md border border-border bg-abyss px-3 py-1.5 text-sm text-text placeholder:text-textDim/60 focus:border-accent focus:outline-none"
      />

      {(disciplines.length > 1 || mode === 'depth') && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {disciplines.length > 1 && (
            <>
              <button
                onClick={() => setDiscipline(null)}
                className={`pill px-2.5 py-0.5 font-mono text-[11px] ${discipline == null ? 'pill-on' : ''}`}
              >
                {t('All')}
              </button>
              {disciplines.map((d) => (
                <button
                  key={d}
                  onClick={() => setDiscipline(d)}
                  className={`pill px-2.5 py-0.5 font-mono text-[11px] ${discipline === d ? 'pill-on' : ''}`}
                >
                  {d}
                </button>
              ))}
            </>
          )}
          {mode === 'depth' && (
            <label className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-textDim">
              <input
                type="checkbox"
                checked={profileOnly}
                onChange={(e) => setProfileOnly(e.target.checked)}
                className="accent-accent"
              />
              {t('With profile only')}
            </label>
          )}
        </div>
      )}

      {totalCount === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          {t('Nothing to compare in this backup.')}
        </p>
      ) : shown.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          {t('No matches for that filter.')}
        </p>
      ) : (
        <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
          {shown.map((e, i) => {
            const slot = slotFor(e);
            const selected = !!slot;
            const disabled = (!selected && full) || e.disabled;
            // A header above each session's first entry (the list is
            // newest session first, its entries in order).
            const newSession = i === 0 || shown[i - 1].sessionId !== e.sessionId;
            return (
              <li key={`${e.sessionId}-${e.idx}`}>
                {newSession && (
                  <div className={`truncate px-1 pb-1 font-mono text-[10px] uppercase tracking-widest text-textDim ${i > 0 ? 'mt-3' : ''}`}>
                    {formatDate(e.date)} · {e.sessionName}
                  </div>
                )}
                <button
                  disabled={disabled}
                  onClick={() => onToggle(e.sessionId, e.idx)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                    selected
                      ? 'border-accent/60 bg-accent/5'
                      : disabled
                        ? 'border-transparent opacity-40'
                        : 'border-transparent hover:border-border hover:bg-abyss',
                  ].join(' ')}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{
                      backgroundColor: slot?.color ?? 'transparent',
                      borderColor: slot?.color ?? 'rgb(var(--c-border))',
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{e.line1}</span>
                    {e.note && (
                      <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-textDim">
                        {t(e.note)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-20 text-center text-textDim">
      {children}
    </div>
  );
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtSec(s: unknown): string {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return '-';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtSpeed(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  return `${v.toFixed(2)} m/s`;
}

function fmtRating(r: unknown): string {
  return typeof r === 'number' && r > 0 ? `${r}/10` : '-';
}

function fmtPct(v: number | null): string {
  return v != null ? `${Math.round(v)}%` : '-';
}

function fmtBpm(v: number | null): string {
  return v != null ? `${Math.round(v)} bpm` : '-';
}
