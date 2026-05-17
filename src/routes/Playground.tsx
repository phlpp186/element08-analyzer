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
  PIVOT_DIMENSIONS,
  PIVOT_METRICS,
  flatten,
  pivot,
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
  const [stat, setStat] = useState<Stat>('avg');
  const [render, setRender] = useState<'bar' | 'box'>('bar');

  // Reset selections when mode changes to something that doesn't support them.
  const metric: PivotMetric = availableMetrics.find((m) => m.id === metricId) ?? availableMetrics[0];
  const dim: PivotDimension = availableDims.find((d) => d.id === dimId) ?? availableDims[0];
  // Keep state in sync if the active selection isn't available.
  if (metric && metric.id !== metricId) setMetricId(metric.id);
  if (dim && dim.id !== dimId) setDimId(dim.id);

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
          <PickerColumn label="What (metric)">
            <Dropdown
              value={metric?.id ?? ''}
              onChange={setMetricId}
              options={availableMetrics.map((m) => ({ value: m.id, label: `${m.label} (${m.unit})` }))}
            />
          </PickerColumn>
          <PickerColumn label="By (dimension)">
            <Dropdown
              value={dim?.id ?? ''}
              onChange={setDimId}
              options={dimGroups.flatMap((g) => [
                { value: `__group__${g.label}`, label: `── ${g.label} ──`, disabled: true },
                ...g.dims.map((d) => ({ value: d.id, label: d.label })),
              ])}
            />
          </PickerColumn>
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

        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-textDim">
            {filtered.length} session{filtered.length === 1 ? '' : 's'} · {items.length} item{items.length === 1 ? '' : 's'}
            {buckets.length > 0 && ` · ${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex gap-2">
            <Pill active={render === 'bar'} onClick={() => setRender('bar')}>Bars</Pill>
            <Pill active={render === 'box'} onClick={() => setRender('box')}>Box plot</Pill>
          </div>
        </div>

        {buckets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-deep py-12 text-center text-textDim">
            No data for this pivot. Try a different dimension or widen filters.
          </p>
        ) : (
          <ReactECharts
            option={render === 'bar'
              ? buildBarOption(buckets, metric, dim, stat)
              : buildBoxOption(buckets, metric, dim)}
            style={{ height: 360 }}
            notMerge
          />
        )}
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
