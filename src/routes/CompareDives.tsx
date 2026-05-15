/**
 * CompareDives — overlay individual dives/holds across sessions.
 *
 * Three modes, switched by the pill row under the header:
 *   - Depth — up to 3 depth profiles on one inverted-depth chart.
 *   - Holds — up to 8 breath holds on stacked HR + SpO2 panels.
 *   - Pool  — pool dives: HR-vs-time overlay + avg-speed bars.
 *
 * Each mode keeps its own selection (useDiveCompareStore) and shares one
 * generic cross-session picker. Layout mirrors CompareSeasons: wide left
 * column (chart + stat table), 320px right panel (picker).
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
import {
  extractHoldSlice,
  holdStats,
  type HoldSlice,
  type HoldStats,
} from '../lib/analytics/holdCompare';
import { formatDate } from '../lib/format';

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'holds', label: 'Holds' },
  { id: 'pool', label: 'Pool' },
];

interface DepthEntry {
  color: string;
  label: string;
  data: DepthDiveData;
  dive: any;
}
interface PoolEntry {
  color: string;
  label: string;
  hrSeries: [number, number][];
  avgSpeed: number | null;
  dive: any;
}
interface HoldEntry {
  color: string;
  label: string;
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
  const backup = useBackupStore((s) => s.backup);
  const selections = useDiveCompareStore((s) => s.selections);
  const toggle = useDiveCompareStore((s) => s.toggle);
  const clear = useDiveCompareStore((s) => s.clear);

  const [mode, setMode] = useState<CompareMode>('depth');
  const [query, setQuery] = useState('');
  const [depthAlign, setDepthAlign] = useState<OverlayAlign>('start');
  // Which optional secondary panel to stack under the depth profile in
  // depth-compare mode. 'off' keeps it to just depth.
  const [depthSecondary, setDepthSecondary] = useState<DepthSecondary>('off');
  const [holdAlign, setHoldAlign] = useState<HoldAlign>('start');

  const sessions = backup?.data.sessions ?? [];
  const slots = selections[mode];

  const catalog = useMemo(() => buildCatalog(sessions, mode), [sessions, mode]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((e) => e.search.includes(q)) : catalog;
  }, [catalog, query]);

  const depthEntries = useMemo(
    () => (mode === 'depth' ? resolveDepth(sessions, slots) : []),
    [mode, sessions, slots],
  );
  const poolEntries = useMemo(
    () => (mode === 'pool' ? resolvePool(sessions, slots) : []),
    [mode, sessions, slots],
  );
  const holdEntries = useMemo(
    () => (mode === 'holds' ? resolveHolds(sessions, slots) : []),
    [mode, sessions, slots],
  );

  if (!backup) return <Navigate to="/" replace />;

  const full = slots.length >= MAX_BY_MODE[mode];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CompareModeHeader
        mode="dives"
        description="Overlay individual dives or holds from any session. Switch between depth profiles, breath holds, and pool dives below."
      />

      <div className="mb-6 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              setQuery('');
            }}
            className={[
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              mode === m.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-textDim hover:border-accent hover:text-accent',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {slots.length === 0 ? (
            <Placeholder>
              Pick {mode === 'holds' ? 'holds' : 'dives'} from the panel to
              overlay them.
            </Placeholder>
          ) : mode === 'depth' ? (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <PillToggle
                  label="Align"
                  value={depthAlign}
                  onChange={setDepthAlign}
                  options={[
                    { id: 'start', label: 'Start', hint: 'Aligned at t=0' },
                    { id: 'maxdepth', label: 'Max depth', hint: 'Aligned at the deepest point' },
                  ]}
                />
                <PillToggle
                  label="Show"
                  value={depthSecondary}
                  onChange={setDepthSecondary}
                  options={[
                    { id: 'off', label: 'Off', hint: 'Just the depth profile' },
                    { id: 'speed', label: 'Speed', hint: 'Add vertical speed under depth' },
                    { id: 'hr', label: 'HR', hint: 'Add heart rate under depth' },
                    { id: 'temp', label: 'Temp', hint: 'Add temperature under depth' },
                  ]}
                />
              </div>
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
                    />
                  );
                }
                const secondary = depthSecondary as Exclude<DepthSecondary, 'off'>;
                const meta = METRIC_META[secondary];
                const hasData = depthEntries.some((e) => meta.has(e.data));
                return (
                  <>
                    <PanelHeader label="Depth" unit="m" />
                    <DiveOverlayChart
                      dives={overlay}
                      align={depthAlign}
                      metric="depth"
                      height={300}
                      groupId="compare-depth"
                    />
                    <PanelHeader label={meta.label} unit={meta.unit} hint={meta.hint} />
                    {hasData ? (
                      <DiveOverlayChart
                        dives={overlay}
                        align={depthAlign}
                        metric={secondary}
                        height={200}
                        groupId="compare-depth"
                        showLegend={false}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-8 text-center text-sm text-textDim">
                        No {meta.label.toLowerCase()} data on the selected dives.
                      </div>
                    )}
                  </>
                );
              })()}
              <StatTable
                columns={depthEntries}
                rows={depthRows(depthEntries)}
              />
            </>
          ) : mode === 'holds' ? (
            <>
              <PillToggle
                label="Align"
                value={holdAlign}
                onChange={setHoldAlign}
                options={[
                  { id: 'start', label: 'Hold start', hint: 'Aligned at the hold start' },
                  { id: 'end', label: 'Hold end', hint: 'Aligned at the hold end' },
                ]}
              />
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
              <StatTable columns={holdEntries} rows={holdRows(holdEntries)} />
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
              <StatTable columns={poolEntries} rows={poolRows(poolEntries)} />
            </>
          )}
        </div>

        <Picker
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

function resolveDepth(sessions: ParsedSession[], slots: CompareSlot[]): DepthEntry[] {
  const seen = new Map<string, number>();
  const out: DepthEntry[] = [];
  for (const slot of slots) {
    const session = sessions.find((s) => s.id === slot.sessionId);
    if (!session || session.mode !== 'depth') continue;
    const dive = (session as any).dives?.[slot.idx];
    if (!dive) continue;
    const base = `${formatDate(session.date)} · ${dive.discipline || 'Depth'} · ${dive.depth}m`;
    out.push({
      color: slot.color,
      label: dedupe(base, seen),
      data: extractDiveData(dive),
      dive,
    });
  }
  return out;
}

function resolvePool(sessions: ParsedSession[], slots: CompareSlot[]): PoolEntry[] {
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
    const base = `${formatDate(session.date)} · ${dive.discipline || 'Pool'} · ${
      distance != null ? `${distance}m` : 'static'
    }`;
    out.push({
      color: slot.color,
      label: dedupe(base, seen),
      hrSeries: extractPoolDiveData(dive).hrSeries,
      avgSpeed,
      dive,
    });
  }
  return out;
}

function resolveHolds(sessions: ParsedSession[], slots: CompareSlot[]): HoldEntry[] {
  const seen = new Map<string, number>();
  const out: HoldEntry[] = [];
  for (const slot of slots) {
    const session = sessions.find((s) => s.id === slot.sessionId);
    if (!session || session.mode !== 'dry') continue;
    const slice = extractHoldSlice(session, slot.idx);
    if (!slice) continue;
    const base = `${formatDate(session.date)} · Hold ${slot.idx + 1}`;
    out.push({
      color: slot.color,
      label: dedupe(base, seen),
      slice,
      stats: holdStats(slice),
    });
  }
  return out;
}

// ─── Stat rows ──────────────────────────────────────────────────────────────

function depthRows(entries: DepthEntry[]): StatRow[] {
  return [
    { label: 'Max depth', values: entries.map((e) => (e.dive.depth != null ? `${e.dive.depth}m` : '-')) },
    { label: 'Dive time', values: entries.map((e) => fmtSec(e.dive.diveTime)) },
    { label: 'Descent', values: entries.map((e) => fmtSec(e.dive.descentTime)) },
    { label: 'Hang', values: entries.map((e) => fmtSec(e.dive.hangTime)) },
    { label: 'Ascent', values: entries.map((e) => fmtSec(e.dive.ascentTime)) },
    { label: 'Descent speed', values: entries.map((e) => fmtSpeed(e.dive.descentSpeed)) },
    { label: 'Ascent speed', values: entries.map((e) => fmtSpeed(e.dive.ascentSpeed)) },
  ];
}

function poolRows(entries: PoolEntry[]): StatRow[] {
  return [
    { label: 'Discipline', values: entries.map((e) => e.dive.discipline || '-') },
    {
      label: 'Distance',
      values: entries.map((e) =>
        typeof e.dive.distance === 'number' ? `${e.dive.distance}m` : 'static',
      ),
    },
    { label: 'Dive time', values: entries.map((e) => fmtSec(e.dive.diveTime)) },
    {
      label: 'Avg speed',
      values: entries.map((e) => (e.avgSpeed != null ? `${e.avgSpeed.toFixed(2)} m/s` : '-')),
    },
    { label: 'Rating', values: entries.map((e) => fmtRating(e.dive.rating)) },
  ];
}

function holdRows(entries: HoldEntry[]): StatRow[] {
  return [
    { label: 'Duration', values: entries.map((e) => fmtSec(e.slice.durationSec)) },
    { label: 'Contractions', values: entries.map((e) => String(e.slice.contractionCount)) },
    { label: 'Rating', values: entries.map((e) => fmtRating(e.slice.rating)) },
    { label: 'Min SpO₂', values: entries.map((e) => fmtPct(e.stats.minSpo2)) },
    { label: 'Min HR', values: entries.map((e) => fmtBpm(e.stats.minHr)) },
    { label: 'HR at end', values: entries.map((e) => fmtBpm(e.stats.hrAtEnd)) },
    { label: 'SpO₂ +30s', values: entries.map((e) => fmtPct(e.stats.spo2Post30)) },
  ];
}

// ─── Generic stat table ─────────────────────────────────────────────────────

interface StatRow {
  label: string;
  values: string[];
}

function StatTable({
  columns,
  rows,
}: {
  columns: { color: string; label: string }[];
  rows: StatRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-textDim">
              Metric
            </th>
            {columns.map((c, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-right font-mono text-[11px]"
                style={{ color: c.color }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-textDim">
                {row.label}
              </td>
              {row.values.map((v, i) => (
                <td key={i} className="px-4 py-2 text-right font-heading text-text">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

function PillToggle<T extends string>({
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
          className={[
            'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
            value === o.id
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-textDim hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Cross-session picker ───────────────────────────────────────────────────

function Picker({
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
  const slotFor = (e: CatalogEntry) =>
    slots.find((s) => s.sessionId === e.sessionId && s.idx === e.idx);
  const noun = mode === 'holds' ? 'Holds' : 'Dives';

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {noun} · {slots.length}/{max}
        </h2>
        {slots.length > 0 && (
          <button
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
          >
            Clear
          </button>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Filter by date, discipline…"
        className="mb-3 w-full rounded-md border border-border bg-abyss px-3 py-1.5 text-sm text-text placeholder:text-textDim/60 focus:border-accent focus:outline-none"
      />

      {totalCount === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          Nothing to compare in this backup.
        </p>
      ) : catalog.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          No matches for that filter.
        </p>
      ) : (
        <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
          {catalog.map((e) => {
            const slot = slotFor(e);
            const selected = !!slot;
            const disabled = (!selected && full) || e.disabled;
            return (
              <li key={`${e.sessionId}-${e.idx}`}>
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
                      borderColor: slot?.color ?? '#3a3a3a',
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{e.line1}</span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-textDim">
                      {e.line2}
                    </span>
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
  return typeof r === 'number' && r > 0 ? `${r}/5` : '-';
}

function fmtPct(v: number | null): string {
  return v != null ? `${Math.round(v)}%` : '-';
}

function fmtBpm(v: number | null): string {
  return v != null ? `${Math.round(v)} bpm` : '-';
}
