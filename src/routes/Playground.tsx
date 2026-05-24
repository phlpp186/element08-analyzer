/**
 * Playground — pivot any subset of training data.
 *
 * Three knobs drive the chart:
 *   What (metric) × By (dimension) × Stat
 *
 * Dimension picker is grouped by section (Mode / Equipment / Conditions
 * / Body) and constrained to the active mode so the user only sees
 * things that make sense. Same for the metric picker.
 *
 * Render toggles between grouped bars (compact, single-statistic) and
 * box plot (distribution-aware) inside the chart card. Both views read
 * the same PivotBucket[] output.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useBackupStore } from '../stores/useBackupStore';
import {
  applyFilters,
  type Filters,
  type Mode,
  type SessionTag,
} from '../lib/analytics/playground';
import {
  DIM_GROUP_NOUN,
  PIVOT_DIMENSIONS,
  PIVOT_METRICS,
  flatten,
  pivot,
  pivot2d,
  type Pivot2DResult,
  type PivotBucket,
  type PivotDimension,
  type PivotMetric,
  type SessionMode,
  type Stat,
} from '../lib/analytics/playgroundPivot';

const PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: 'all',   label: 'All time',     days: null },
  { id: '30',    label: 'Last 30 days', days: 30 },
  { id: '90',    label: 'Last 90 days', days: 90 },
  { id: '365',   label: 'Last year',    days: 365 },
];

const MODES: { id: Mode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool',  label: 'Pool' },
  { id: 'dry',   label: 'Dry' },
];

const TAGS: { id: SessionTag; label: string }[] = [
  { id: 'co2_table',  label: 'CO₂' },
  { id: 'o2_table',   label: 'O₂' },
  { id: 'comfy',      label: 'Comfy' },
  { id: 'pb_attempt', label: 'PB' },
  { id: 'recovery',   label: 'Recovery' },
];

const LUNG_VOLS: ('FL' | 'FRC' | 'RV')[] = ['FL', 'FRC', 'RV'];

const STATS: { id: Stat; label: string }[] = [
  { id: 'avg',    label: 'Avg' },
  { id: 'median', label: 'Median' },
  { id: 'max',    label: 'Max' },
  { id: 'min',    label: 'Min' },
  { id: 'count',  label: 'Count' },
];

/**
 * Curated questions that pre-fill the pivot in one tap, grouped by topic.
 * Each maps a plain question to the full knob config — including the chart
 * type chosen to best answer it (scatter / X✕Y for relationships, box for
 * spread, histogram for shape, heatmap for two-way cross-cuts, bar for
 * rankings). Add freely; ids must be valid for the question's mode.
 */
interface QuestionPreset {
  q: string;
  category: string;
  mode: SessionMode;
  metric: string;
  dim?: string;
  /** X metric for the X✕Y scatter. */
  xMetric?: string;
  /** Second dimension for the heatmap. */
  dim2?: string;
  stat: Stat;
  render: RenderMode;
}

const CATEGORY_ORDER = ['Mouthfill', 'Speed', 'Depth', 'Early turns', 'Time'];

const RENDER_SHORT: Record<RenderMode, string> = {
  bar: 'bars',
  box: 'box',
  scatter: 'scatter',
  hist: 'histogram',
  xy: 'X✕Y',
  heatmap: 'heatmap',
};

const QUESTIONS: QuestionPreset[] = [
  // ── Mouthfill ──
  { q: 'Does my mouthfill change with suit thickness?', category: 'Mouthfill', mode: 'depth', metric: 'depth.mfFactor', dim: 'num.suitMm', stat: 'avg', render: 'bar' },
  { q: 'Is my mouthfill weaker when I turn early?', category: 'Mouthfill', mode: 'depth', metric: 'depth.mfFactor', dim: 'cond.earlyTurn', stat: 'avg', render: 'box' },
  { q: "What's the spread of my mouthfill factor?", category: 'Mouthfill', mode: 'depth', metric: 'depth.mfFactor', stat: 'avg', render: 'hist' },
  { q: 'Mouthfill factor by discipline × suit', category: 'Mouthfill', mode: 'depth', metric: 'depth.mfFactor', dim: 'mode.discipline', dim2: 'num.suitMm', stat: 'avg', render: 'heatmap' },
  // ── Speed ──
  { q: 'Does going deeper change my descent speed?', category: 'Speed', mode: 'depth', metric: 'depth.descentSpeed', xMetric: 'depth.maxDepth', stat: 'avg', render: 'xy' },
  { q: 'Descent vs ascent speed', category: 'Speed', mode: 'depth', metric: 'depth.ascentSpeed', xMetric: 'depth.descentSpeed', stat: 'avg', render: 'xy' },
  { q: 'Does extra weight change my descent speed?', category: 'Speed', mode: 'depth', metric: 'depth.descentSpeed', dim: 'num.weightKg', stat: 'avg', render: 'scatter' },
  { q: 'Descent speed spread by discipline', category: 'Speed', mode: 'depth', metric: 'depth.descentSpeed', dim: 'mode.discipline', stat: 'avg', render: 'box' },
  // ── Depth ──
  { q: 'Which discipline do I go deepest in?', category: 'Depth', mode: 'depth', metric: 'depth.maxDepth', dim: 'mode.discipline', stat: 'max', render: 'bar' },
  { q: "What's the spread of my max depths?", category: 'Depth', mode: 'depth', metric: 'depth.maxDepth', stat: 'avg', render: 'hist' },
  { q: 'Max depth: early turn vs hit target', category: 'Depth', mode: 'depth', metric: 'depth.maxDepth', dim: 'cond.earlyTurn', stat: 'avg', render: 'box' },
  // ── Early turns ──
  { q: 'How deep do I get for each early-turn reason?', category: 'Early turns', mode: 'depth', metric: 'depth.maxDepth', dim: 'cond.earlyTurnReason', stat: 'avg', render: 'bar' },
  { q: 'Max depth by discipline × early-turn outcome', category: 'Early turns', mode: 'depth', metric: 'depth.maxDepth', dim: 'mode.discipline', dim2: 'cond.earlyTurn', stat: 'avg', render: 'heatmap' },
  // ── Time ──
  { q: "What's the spread of my dive times?", category: 'Time', mode: 'depth', metric: 'depth.diveTime', stat: 'avg', render: 'hist' },
  { q: 'Dive time spread by discipline', category: 'Time', mode: 'depth', metric: 'depth.diveTime', dim: 'mode.discipline', stat: 'avg', render: 'box' },
  { q: 'Does a longer hang cost total dive time?', category: 'Time', mode: 'depth', metric: 'depth.diveTime', xMetric: 'depth.hangTime', stat: 'avg', render: 'xy' },
  { q: 'Pool: pace vs distance', category: 'Time', mode: 'pool', metric: 'pool.pace100', xMetric: 'pool.distance', stat: 'avg', render: 'xy' },
  { q: 'Dry: spread of my longest holds', category: 'Time', mode: 'dry', metric: 'dry.longestHold', stat: 'avg', render: 'hist' },
];

type RenderMode = 'bar' | 'box' | 'scatter' | 'hist' | 'xy' | 'heatmap';

function todayIso(): string { return isoDate(new Date()); }
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

export function Playground() {
  const backup = useBackupStore((s) => s.backup);

  const [presetId, setPresetId] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>(todayIso());
  const [mode, setMode] = useState<SessionMode>('depth');
  const [tags, setTags] = useState<SessionTag[]>([]);
  const [lungVols, setLungVols] = useState<('FL' | 'FRC' | 'RV')[]>([]);

  const availableMetrics = PIVOT_METRICS.filter((m) => m.modes.includes(mode));
  const availableDims = PIVOT_DIMENSIONS.filter((d) => d.modes.includes(mode));

  const [metricId, setMetricId] = useState<string>(availableMetrics[0]?.id ?? '');
  const [dimId, setDimId] = useState<string>(availableDims[0]?.id ?? '');
  // Second targets: X metric for the metric-vs-metric scatter, and a second
  // dimension for the heatmap. Default to the next available so they differ.
  const [xMetricId, setXMetricId] = useState<string>(
    availableMetrics[1]?.id ?? availableMetrics[0]?.id ?? '',
  );
  const [dim2Id, setDim2Id] = useState<string>(availableDims[1]?.id ?? availableDims[0]?.id ?? '');
  const [stat, setStat] = useState<Stat>('avg');
  const [render, setRender] = useState<RenderMode>('bar');
  // Which starter-question topic is expanded (null = none, just the pills).
  const [questionCat, setQuestionCat] = useState<string | null>(CATEGORY_ORDER[0]);

  // Reset selections when mode changes to something that doesn't support them.
  const metric: PivotMetric = availableMetrics.find((m) => m.id === metricId) ?? availableMetrics[0];
  const dim: PivotDimension = availableDims.find((d) => d.id === dimId) ?? availableDims[0];
  // Keep state in sync if the active selection isn't available.
  if (metric && metric.id !== metricId) setMetricId(metric.id);
  if (dim && dim.id !== dimId) setDimId(dim.id);
  const xMetric: PivotMetric =
    availableMetrics.find((m) => m.id === xMetricId) ?? availableMetrics[1] ?? availableMetrics[0];
  const dim2: PivotDimension =
    availableDims.find((d) => d.id === dim2Id) ?? availableDims[1] ?? availableDims[0];
  if (xMetric && xMetric.id !== xMetricId) setXMetricId(xMetric.id);
  if (dim2 && dim2.id !== dim2Id) setDim2Id(dim2.id);

  if (!backup) return <Navigate to="/" replace />;
  const sessions = backup.data.sessions;

  const filters: Filters = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === presetId);
    let from: string | null = null;
    let to: string | null = null;
    if (preset) {
      from = preset.days == null ? null : isoDaysAgo(preset.days);
      to = preset.days == null ? null : todayIso();
    } else {
      from = customFrom || null;
      to = customTo || null;
    }
    return { from, to, mode: mode as Mode, sessionTags: tags, lungVols };
  }, [presetId, customFrom, customTo, mode, tags, lungVols]);

  const filtered = useMemo(() => applyFilters(sessions, filters), [sessions, filters]);
  const items = useMemo(() => flatten(filtered), [filtered]);
  const buckets = useMemo(
    () => (metric && dim ? pivot(items, dim, metric, stat) : []),
    [items, metric, dim, stat],
  );

  // Group dimensions for the picker.
  const dimGroups = useMemo(() => groupDims(availableDims), [availableDims]);
  const dimOptions = dimGroups.flatMap((g) => [
    { value: `__group__${g.label}`, label: `── ${g.label} ──`, disabled: true },
    ...g.dims.map((d) => ({ value: d.id, label: d.label })),
  ]);
  const metricOptions = availableMetrics.map((m) => ({ value: m.id, label: `${m.label} (${m.unit})` }));

  // Scatter only makes sense against a numeric X (weight, suit, etc.); fall
  // back to bars if the user had scatter on and switched to a categorical dim.
  const dimIsNumeric = dim?.group === 'Numeric';
  const effRender: RenderMode = render === 'scatter' && !dimIsNumeric ? 'bar' : render;
  // Linear fit for the scatter view (and its caption).
  const scatterFit = useMemo(
    () => (effRender === 'scatter' ? linearFit(scatterData(buckets)) : null),
    [effRender, buckets],
  );

  // Metric-vs-metric scatter: one (x, y) per dive straight from the two
  // metrics, bypassing the bucketed pivot.
  const xyPts = useMemo<[number, number][]>(() => {
    if (effRender !== 'xy' || !xMetric || !metric) return [];
    const out: [number, number][] = [];
    for (const it of items) {
      const x = xMetric.extract(it);
      const y = metric.extract(it);
      if (x != null && y != null) out.push([x, y]);
    }
    return out;
  }, [effRender, items, xMetric, metric]);
  const xyFit = useMemo(() => (effRender === 'xy' ? linearFit(xyPts) : null), [effRender, xyPts]);

  // Heatmap: stat per (dim × dim2) cell.
  const heat = useMemo(
    () =>
      effRender === 'heatmap' && metric && dim && dim2
        ? pivot2d(items, dim, dim2, metric, stat)
        : null,
    [effRender, items, metric, dim, dim2, stat],
  );

  // One-tap question: set every knob at once. React batches these in the
  // event handler, so the pivot recomputes once with the full config.
  function applyPreset(p: QuestionPreset) {
    setMode(p.mode);
    setMetricId(p.metric);
    if (p.dim) setDimId(p.dim);
    if (p.xMetric) setXMetricId(p.xMetric);
    if (p.dim2) setDim2Id(p.dim2);
    setStat(p.stat);
    setRender(p.render);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">Playground</h1>
          <p className="mt-1 max-w-xl text-sm text-textDim">
            Cross-cut any subset of your training: pick a metric, a
            dimension to pivot on, and a statistic. Toggle bars or box
            plot to see distributions.
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
      </header>

      {/* Starter questions — one tap fills the pivot below. */}
      <section className="mb-5 rounded-lg border border-border bg-panel p-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-textDim">
          Starter questions
        </div>
        <p className="mb-3 text-sm text-textDim">
          Pick a topic, then tap a question to fill in the pivot below with the chart that best
          answers it.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => (
            <Pill
              key={cat}
              active={questionCat === cat}
              onClick={() => setQuestionCat(questionCat === cat ? null : cat)}
            >
              {cat}
            </Pill>
          ))}
        </div>
        {questionCat && (
          <div className="flex flex-wrap gap-2">
            {QUESTIONS.filter((q) => q.category === questionCat).map((qp) => (
              <button
                key={qp.q}
                onClick={() => applyPreset(qp)}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-textDim transition-colors hover:border-accent hover:text-accent"
              >
                {qp.q}
                <span className="ml-1.5 font-mono text-[10px] opacity-50">
                  {RENDER_SHORT[qp.render]}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="space-y-5 rounded-lg border border-border bg-panel p-5">
        <FieldRow label="Date range">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Pill key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)}>
                {p.label}
              </Pill>
            ))}
            <Pill active={presetId === 'custom'} onClick={() => setPresetId('custom')}>Custom</Pill>
            {presetId === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-border bg-deep px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
                />
                <span className="font-mono text-xs text-textDim">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-border bg-deep px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
            )}
          </div>
        </FieldRow>

        <FieldRow label="Mode">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <Pill key={m.id} active={mode === m.id} onClick={() => setMode(m.id as SessionMode)}>
                {m.label}
              </Pill>
            ))}
          </div>
        </FieldRow>

        {mode === 'dry' && (
          <FieldRow label="Session tag">
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => (
                <Pill key={t.id} active={tags.includes(t.id)} onClick={() => setTags(toggle(tags, t.id))}>
                  {t.label}
                </Pill>
              ))}
              {tags.length > 0 && (
                <button
                  onClick={() => setTags([])}
                  className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
                >
                  clear
                </button>
              )}
            </div>
          </FieldRow>
        )}

        {mode === 'dry' && (
          <FieldRow label="Lung volume">
            <div className="flex flex-wrap gap-2">
              {LUNG_VOLS.map((lv) => (
                <Pill key={lv} active={lungVols.includes(lv)} onClick={() => setLungVols(toggle(lungVols, lv))}>
                  {lv}
                </Pill>
              ))}
              {lungVols.length > 0 && (
                <button
                  onClick={() => setLungVols([])}
                  className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
                >
                  clear
                </button>
              )}
            </div>
          </FieldRow>
        )}
      </section>

      {/* Pivot knobs + chart */}
      <section className="mt-5 space-y-4 rounded-lg border border-border bg-panel p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <PickerColumn label={effRender === 'xy' ? 'Y (metric)' : 'What (metric)'}>
            <Dropdown value={metric?.id ?? ''} onChange={setMetricId} options={metricOptions} />
          </PickerColumn>
          {effRender === 'xy' ? (
            <PickerColumn label="X (metric)">
              <Dropdown value={xMetric?.id ?? ''} onChange={setXMetricId} options={metricOptions} />
            </PickerColumn>
          ) : effRender === 'heatmap' ? (
            <PickerColumn label="By (two dimensions)">
              <Dropdown value={dim?.id ?? ''} onChange={setDimId} options={dimOptions} />
              <div className="mt-2">
                <Dropdown value={dim2?.id ?? ''} onChange={setDim2Id} options={dimOptions} />
              </div>
            </PickerColumn>
          ) : (
            <PickerColumn label="By (dimension)">
              <Dropdown value={dim?.id ?? ''} onChange={setDimId} options={dimOptions} />
            </PickerColumn>
          )}
          <PickerColumn label="Stat">
            <div className="flex flex-wrap gap-2">
              {STATS.map((s) => (
                <Pill key={s.id} active={stat === s.id} onClick={() => setStat(s.id)}>
                  {s.label}
                </Pill>
              ))}
            </div>
          </PickerColumn>
        </div>

        {/* Live explanation of what the current pivot actually shows. */}
        <PivotHelp
          metricLabel={metric?.label ?? 'the metric'}
          dimLabel={dim ? (DIM_GROUP_NOUN[dim.id] ?? dim.label) : 'group'}
          rawDimLabel={dim?.label ?? 'group'}
          xMetricLabel={xMetric?.label ?? 'another metric'}
          dim2Label={dim2 ? (DIM_GROUP_NOUN[dim2.id] ?? dim2.label) : 'group'}
          stat={stat}
          render={effRender}
          mode={mode}
        />

        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-textDim">
            {filtered.length} session{filtered.length === 1 ? '' : 's'} · {items.length} item{items.length === 1 ? '' : 's'}
            {buckets.length > 0 && ` · ${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex gap-2">
            <Pill active={effRender === 'bar'} onClick={() => setRender('bar')}>Bars</Pill>
            <Pill active={effRender === 'box'} onClick={() => setRender('box')}>Box plot</Pill>
            {dimIsNumeric && (
              <Pill active={effRender === 'scatter'} onClick={() => setRender('scatter')}>
                Scatter
              </Pill>
            )}
            <Pill active={effRender === 'hist'} onClick={() => setRender('hist')}>Histogram</Pill>
            <Pill active={effRender === 'xy'} onClick={() => setRender('xy')}>X &#10005; Y</Pill>
            <Pill active={effRender === 'heatmap'} onClick={() => setRender('heatmap')}>Heatmap</Pill>
          </div>
        </div>

        {(() => {
          const hasData =
            effRender === 'xy'
              ? xyPts.length > 0
              : effRender === 'heatmap'
                ? !!heat && heat.cells.length > 0
                : buckets.length > 0;
          if (!hasData) {
            return (
              <p className="rounded-lg border border-dashed border-border bg-deep py-12 text-center text-textDim">
                No data for this view. Try a different metric/dimension or widen the filters.
              </p>
            );
          }
          const option =
            effRender === 'box'
              ? buildBoxOption(buckets, metric, dim)
              : effRender === 'scatter'
                ? buildScatterOption(buckets, metric, dim, scatterFit)
                : effRender === 'hist'
                  ? buildHistogramOption(buckets, metric)
                  : effRender === 'xy'
                    ? buildXyOption(xyPts, xMetric, metric, xyFit)
                    : effRender === 'heatmap'
                      ? buildHeatmapOption(heat, metric, dim, dim2, stat)
                      : buildBarOption(buckets, metric, dim, stat);
          const fit = effRender === 'scatter' ? scatterFit : effRender === 'xy' ? xyFit : null;
          return (
            <>
              <ReactECharts option={option} style={{ height: effRender === 'heatmap' ? 420 : 360 }} notMerge />
              {fit && (
                <p className="mt-1 text-center font-mono text-[11px] text-textDim">
                  {describeCorrelation(fit.r)} · r = {fit.r.toFixed(2)}
                </p>
              )}
            </>
          );
        })()}
      </section>
    </div>
  );
}

// ── Picker helpers ──────────────────────────────────────────────────────────

function PickerColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-textDim">
        {label}
      </div>
      {children}
    </div>
  );
}

function Dropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-deep px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function groupDims(dims: PivotDimension[]) {
  const order: PivotDimension['group'][] = ['Mode', 'Equipment', 'Conditions', 'Body', 'Time', 'Numeric'];
  const grouped: { label: string; dims: PivotDimension[] }[] = [];
  for (const g of order) {
    const gs = dims.filter((d) => d.group === g);
    if (gs.length > 0) grouped.push({ label: g, dims: gs });
  }
  return grouped;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-textDim">{label}</div>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border text-textDim hover:border-accent hover:text-accent',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

/** Lowercase a label for mid-sentence use while preserving acronyms and unit
 *  tokens (HR, FIM, "s/100 m") so "Avg HR" -> "avg HR", not "avg hr". */
function softLower(label: string): string {
  return label
    .split(' ')
    .map((w) => (/[A-Z]{2,}/.test(w) || /\d/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1)))
    .join(' ');
}

/**
 * Plain-language explanation of the current pivot. Rewrites itself as the
 * knobs change so the user always knows what a bar/box actually represents,
 * and what swapping the Stat does. Items are dives (depth/pool) or sessions
 * (dry); `count` ignores the metric; the box plot ignores the Stat.
 */
function PivotHelp({
  metricLabel,
  dimLabel,
  rawDimLabel,
  xMetricLabel,
  dim2Label,
  stat,
  render,
  mode,
}: {
  metricLabel: string;
  dimLabel: string;
  rawDimLabel: string;
  xMetricLabel: string;
  dim2Label: string;
  stat: Stat;
  render: RenderMode;
  mode: SessionMode;
}) {
  const noun = mode === 'dry' ? 'sessions' : 'dives';
  const m = softLower(metricLabel);
  const d = softLower(dimLabel);
  const Em = ({ children }: { children: React.ReactNode }) => (
    <span className="font-semibold text-text">{children}</span>
  );

  let body: React.ReactNode;
  if (render === 'xy') {
    body = (
      <>
        Each dot is one dive: <Em>{m}</Em> (vertical) against <Em>{softLower(xMetricLabel)}</Em>{' '}
        (horizontal). The line is a linear fit, and the r below shows how tightly the two move
        together. The dimension and Stat are ignored here.
      </>
    );
  } else if (render === 'heatmap') {
    const w =
      stat === 'avg'
        ? 'average'
        : stat === 'median'
          ? 'median'
          : stat === 'max'
            ? 'highest'
            : stat === 'min'
              ? 'lowest'
              : 'count';
    body =
      stat === 'count' ? (
        <>
          Each cell counts the {noun} in that <Em>{d}</Em> × <Em>{softLower(dim2Label)}</Em>{' '}
          combination; darker = more. Blank cells mean none.
        </>
      ) : (
        <>
          Each cell is the <Em>{w}</Em> {m} for the {noun} in that <Em>{d}</Em> ×{' '}
          <Em>{softLower(dim2Label)}</Em> combination; darker = higher. Blank cells mean no {noun}{' '}
          there.
        </>
      );
  } else if (render === 'scatter') {
    body = (
      <>
        Each dot is one dive: <Em>{m}</Em> (vertical) against <Em>{softLower(rawDimLabel)}</Em>{' '}
        (horizontal). The line is a linear fit, and the r below it shows how tightly they track
        (±1 = perfect, 0 = none). The Stat toggle does not apply here.
      </>
    );
  } else if (render === 'hist') {
    body = (
      <>
        Each bar counts how many {noun} fall in a <Em>{m}</Em> range, across every group. It shows
        the overall shape and spread of {m}; the dimension and Stat are ignored.
      </>
    );
  } else if (render === 'box') {
    body = (
      <>
        Each box shows the <Em>spread</Em> of {m} across the {noun}, grouped by {d}: the line is
        the <Em>median</Em>, the box covers the middle 50% (Q1 to Q3), the whiskers reach the rest
        within 1.5×IQR, and dots are outliers. The Stat toggle does not change the box; switch to
        Bars to use it.
      </>
    );
  } else if (stat === 'count') {
    body = (
      <>
        Each bar is the <Em>number of {noun}</Em>, grouped by {d}. The metric ({metricLabel}) is
        ignored here; only the count matters.
      </>
    );
  } else {
    const word =
      stat === 'avg'
        ? 'average (mean)'
        : stat === 'median'
          ? 'median (middle value)'
          : stat === 'max'
            ? 'single highest'
            : 'single lowest';
    body = (
      <>
        Each bar is the <Em>{word}</Em> {m} of the {noun}, grouped by {d}.
        {stat === 'median'
          ? ' Half are higher and half lower, so it is less swayed by outliers than the average.'
          : ''}{' '}
        <span className="opacity-70">n = number of {noun} per bar.</span>
      </>
    );
  }

  return (
    <div className="rounded-md border border-border bg-deep px-3 py-2 text-xs leading-relaxed text-textDim">
      {body}
    </div>
  );
}

// ── Chart builders ──────────────────────────────────────────────────────────

const COMMON = {
  tooltipBg: '#101010',
  axisLine: '#262626',
  splitLine: '#1a1a1a',
  text: '#f4f4f5',
  textDim: '#9a9a9e',
  mono: 'JetBrains Mono, ui-monospace, monospace',
  inter: 'Inter, system-ui',
};

function fmt(v: number, unit: string): string {
  if (unit === 's' || unit === 's/100m') {
    const m = Math.floor(v / 60);
    const sec = Math.round(v % 60);
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  }
  if (unit === '×') return v.toFixed(2);
  if (unit === 'm/s' || unit === 'bpm' || unit === 'm') return v.toFixed(1).replace(/\.0$/, '');
  return String(Math.round(v));
}

function buildBarOption(
  buckets: PivotBucket[],
  metric: PivotMetric,
  dim: PivotDimension,
  stat: Stat,
) {
  return {
    grid: { left: 56, right: 16, top: 16, bottom: 64, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const b = buckets[p.dataIndex];
        return `${b.label}<br/><b>${fmt(b.value, metric.unit)}</b> ${metric.unit}<br/><span style="opacity:0.7">${stat} · n = ${b.n}</span>`;
      },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: COMMON.textDim,
        fontFamily: COMMON.mono,
        fontSize: 10,
        interval: 0,
        rotate: buckets.length > 6 ? 30 : 0,
      },
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: `${stat} · ${metric.unit}`,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: buckets.map((b) => b.value),
        itemStyle: { color: '#4fc3f7', borderRadius: [3, 3, 0, 0] },
        barWidth: '70%',
        label: {
          show: true,
          position: 'top',
          color: COMMON.textDim,
          fontFamily: COMMON.mono,
          fontSize: 9,
          formatter: (p: any) => `n=${buckets[p.dataIndex].n}`,
        },
      },
    ],
  };
}

function quartiles(sortedPoints: number[]) {
  const q = (p: number) => {
    const idx = (sortedPoints.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sortedPoints[lo] + (sortedPoints[hi] - sortedPoints[lo]) * (idx - lo);
  };
  return { q1: q(0.25), median: q(0.5), q3: q(0.75) };
}

function buildBoxOption(
  buckets: PivotBucket[],
  metric: PivotMetric,
  dim: PivotDimension,
) {
  // ECharts boxplot data is [min, q1, median, q3, max] per bucket.
  const boxData = buckets.map((b) => {
    const sorted = [...b.points].sort((a, b) => a - b);
    const { q1, median, q3 } = quartiles(sorted);
    const iqr = q3 - q1;
    // Whiskers extend to the nearest point within 1.5×IQR. Anything past
    // that is an outlier (rendered as scatter dots).
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    let whiskerLo = sorted[0];
    let whiskerHi = sorted[sorted.length - 1];
    for (const v of sorted) { if (v >= loFence) { whiskerLo = v; break; } }
    for (let i = sorted.length - 1; i >= 0; i--) { if (sorted[i] <= hiFence) { whiskerHi = sorted[i]; break; } }
    return [whiskerLo, q1, median, q3, whiskerHi];
  });

  const outliers: [number, number][] = [];
  buckets.forEach((b, bi) => {
    const sorted = [...b.points].sort((a, b) => a - b);
    const { q1, q3 } = quartiles(sorted);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    for (const v of sorted) {
      if (v < loFence || v > hiFence) outliers.push([bi, v]);
    }
  });

  return {
    grid: { left: 56, right: 16, top: 16, bottom: 64, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (p: any) => {
        if (p.seriesType === 'boxplot') {
          const b = buckets[p.dataIndex];
          const [min, q1, med, q3, max] = p.data.slice(1) as number[];
          return `${b.label}<br/>median <b>${fmt(med, metric.unit)}</b><br/>` +
            `q1 ${fmt(q1, metric.unit)} · q3 ${fmt(q3, metric.unit)}<br/>` +
            `min ${fmt(min, metric.unit)} · max ${fmt(max, metric.unit)}<br/>` +
            `<span style="opacity:0.7">n = ${b.n}</span>`;
        }
        // Outlier scatter
        const b = buckets[p.data[0]];
        return `${b.label}<br/>outlier <b>${fmt(p.data[1], metric.unit)}</b>`;
      },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: COMMON.textDim,
        fontFamily: COMMON.mono,
        fontSize: 10,
        interval: 0,
        rotate: buckets.length > 6 ? 30 : 0,
      },
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    series: [
      {
        type: 'boxplot',
        data: boxData,
        itemStyle: { color: '#4fc3f7', borderColor: '#4fc3f7' },
      },
      {
        type: 'scatter',
        data: outliers,
        symbolSize: 5,
        itemStyle: { color: '#ff5f9e', opacity: 0.7 },
      },
    ],
  };
}

// ── Scatter + histogram (reuse the bucketed pivot output) ────────────────────

/** One (x, y) pair per dive: x = numeric value parsed from the bucket key
 *  (e.g. "5 mm" -> 5), y = each metric value in that bucket. Categorical
 *  buckets have no leading number and are skipped (scatter is numeric-only). */
function scatterData(buckets: PivotBucket[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const b of buckets) {
    const m = b.key.match(/-?\d+(\.\d+)?/);
    if (!m) continue;
    const x = parseFloat(m[0]);
    if (!Number.isFinite(x)) continue;
    for (const y of b.points) pts.push([x, y]);
  }
  return pts;
}

function linearFit(
  pts: [number, number][],
): { slope: number; intercept: number; r: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const dx = n * sxx - sx * sx;
  if (dx === 0) return null;
  const slope = (n * sxy - sx * sy) / dx;
  const intercept = (sy - slope * sx) / n;
  const dr = Math.sqrt(dx * (n * syy - sy * sy));
  const r = dr === 0 ? 0 : (n * sxy - sx * sy) / dr;
  return { slope, intercept, r };
}

function describeCorrelation(r: number): string {
  const a = Math.abs(r);
  if (a < 0.2) return 'No correlation';
  const strength = a < 0.4 ? 'Weak' : a < 0.7 ? 'Moderate' : 'Strong';
  return `${strength} ${r > 0 ? 'positive' : 'negative'} correlation`;
}

function buildScatterOption(
  buckets: PivotBucket[],
  metric: PivotMetric,
  dim: PivotDimension,
  fit: { slope: number; intercept: number; r: number } | null,
) {
  const pts = scatterData(buckets);
  const xs = pts.map((p) => p[0]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const lineData = fit
    ? [
        [minX, fit.intercept + fit.slope * minX],
        [maxX, fit.intercept + fit.slope * maxX],
      ]
    : [];
  return {
    grid: { left: 56, right: 16, top: 16, bottom: 56, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (p: any) =>
        `${dim.label}: ${p.data[0]}<br/>${metric.label}: <b>${fmt(p.data[1], metric.unit)}</b> ${metric.unit}`,
    },
    xAxis: {
      type: 'value',
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    series: [
      { type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: '#4fc3f7', opacity: 0.55 } },
      ...(fit
        ? [
            {
              type: 'line',
              data: lineData,
              showSymbol: false,
              lineStyle: { color: '#ff5f9e', width: 2 },
              tooltip: { show: false },
            },
          ]
        : []),
    ],
  };
}

function buildHistogramOption(buckets: PivotBucket[], metric: PivotMetric) {
  const values = buckets.flatMap((b) => b.points);
  if (values.length === 0) {
    return { xAxis: { type: 'category', data: [] }, yAxis: { type: 'value' }, series: [] };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.min(20, Math.max(6, Math.round(Math.sqrt(values.length))));
  const width = (max - min) / binCount || 1;
  const counts = new Array(binCount).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    counts[idx] += 1;
  }
  const labels = counts.map((_, i) => fmt(min + i * width, metric.unit));
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 48, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const lo = min + p.dataIndex * width;
        return `${fmt(lo, metric.unit)} to ${fmt(lo + width, metric.unit)} ${metric.unit}<br/><b>${p.value}</b> dive${p.value === 1 ? '' : 's'}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      name: metric.unit,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: COMMON.textDim,
        fontFamily: COMMON.mono,
        fontSize: 9,
        interval: Math.max(0, Math.floor(binCount / 8)),
      },
    },
    yAxis: {
      type: 'value',
      name: 'dives',
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    series: [{ type: 'bar', data: counts, itemStyle: { color: '#4fc3f7' }, barWidth: '98%' }],
  };
}

function buildXyOption(
  pts: [number, number][],
  xMetric: PivotMetric,
  yMetric: PivotMetric,
  fit: { slope: number; intercept: number; r: number } | null,
) {
  const xs = pts.map((p) => p[0]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const lineData = fit
    ? [
        [minX, fit.intercept + fit.slope * minX],
        [maxX, fit.intercept + fit.slope * maxX],
      ]
    : [];
  return {
    grid: { left: 56, right: 16, top: 16, bottom: 56, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (p: any) =>
        `${xMetric.label}: <b>${fmt(p.data[0], xMetric.unit)}</b> ${xMetric.unit}<br/>` +
        `${yMetric.label}: <b>${fmt(p.data[1], yMetric.unit)}</b> ${yMetric.unit}`,
    },
    xAxis: {
      type: 'value',
      name: `${xMetric.label} (${xMetric.unit})`,
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: `${yMetric.label} (${yMetric.unit})`,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: COMMON.splitLine } },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    series: [
      { type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: '#4fc3f7', opacity: 0.55 } },
      ...(fit
        ? [
            {
              type: 'line',
              data: lineData,
              showSymbol: false,
              lineStyle: { color: '#ff5f9e', width: 2 },
              tooltip: { show: false },
            },
          ]
        : []),
    ],
  };
}

function buildHeatmapOption(
  heat: Pivot2DResult | null,
  metric: PivotMetric,
  dim: PivotDimension,
  dim2: PivotDimension,
  stat: Stat,
) {
  if (!heat) return { xAxis: { type: 'category', data: [] }, yAxis: { type: 'category', data: [] }, series: [] };
  const data = heat.cells.map((c) => [c.x, c.y, c.value]);
  const vals = heat.cells.map((c) => c.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const unitLabel = stat === 'count' ? 'dives' : metric.unit;
  return {
    grid: { left: 96, right: 16, top: 16, bottom: 96, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: COMMON.tooltipBg,
      borderColor: COMMON.axisLine,
      textStyle: { color: COMMON.text, fontFamily: COMMON.inter, fontSize: 12 },
      formatter: (p: any) => {
        const c = heat.cells[p.dataIndex];
        return (
          `${dim.label}: ${heat.xKeys[c.x]}<br/>${dim2.label}: ${heat.yKeys[c.y]}<br/>` +
          `<b>${fmt(c.value, metric.unit)}</b> ${unitLabel}<br/>` +
          `<span style="opacity:0.7">n = ${c.n}</span>`
        );
      },
    },
    xAxis: {
      type: 'category',
      data: heat.xKeys,
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 56,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: COMMON.textDim,
        fontFamily: COMMON.mono,
        fontSize: 9,
        interval: 0,
        rotate: heat.xKeys.length > 5 ? 30 : 0,
      },
    },
    yAxis: {
      type: 'category',
      data: heat.yKeys,
      name: dim2.label,
      nameTextStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: COMMON.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 10 },
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      inRange: { color: ['#0e2a36', '#1f6f8c', '#4fc3f7'] },
      textStyle: { color: COMMON.textDim, fontFamily: COMMON.mono, fontSize: 9 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          color: COMMON.text,
          fontFamily: COMMON.mono,
          fontSize: 9,
          formatter: (p: any) => fmt(p.data[2], metric.unit),
        },
        emphasis: { itemStyle: { borderColor: COMMON.text, borderWidth: 1 } },
      },
    ],
  };
}
