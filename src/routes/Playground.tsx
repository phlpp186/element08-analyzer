/**
 * Playground — filter and aggregate.
 *
 * Power-user view that exposes the underlying primitives the other tabs
 * use: date range, mode, session-tag filter, lung-volume filter (when
 * dry mode is active), plus group-by and metric pickers.
 *
 * State lives in local component state — playground configs are
 * ephemeral by design (no save / share in v1). The user reaches it via
 * the Sessions header.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useBackupStore } from '../stores/useBackupStore';
import {
  aggregate,
  applyFilters,
  PLAYGROUND_METRICS,
  type Filters,
  type GroupBy,
  type Metric,
  type Mode,
  type SessionTag,
} from '../lib/analytics/playground';

const PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: 'all',   label: 'All time',     days: null },
  { id: '30',    label: 'Last 30 days', days: 30 },
  { id: '90',    label: 'Last 90 days', days: 90 },
  { id: '365',   label: 'Last year',    days: 365 },
];

const MODES: { id: Mode; label: string }[] = [
  { id: 'all',   label: 'All' },
  { id: 'dry',   label: 'Dry' },
  { id: 'depth', label: 'Depth' },
  { id: 'pool',  label: 'Pool' },
];

const TAGS: { id: SessionTag; label: string }[] = [
  { id: 'co2_table',  label: 'CO₂' },
  { id: 'o2_table',   label: 'O₂' },
  { id: 'comfy',      label: 'Comfy' },
  { id: 'pb_attempt', label: 'PB' },
  { id: 'recovery',   label: 'Recovery' },
];

const LUNG_VOLS: ('FL' | 'FRC' | 'RV')[] = ['FL', 'FRC', 'RV'];

const GROUP_BY: { id: GroupBy; label: string }[] = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
];

function todayIso(): string {
  const d = new Date();
  return isoDate(d);
}
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
  const [mode, setMode] = useState<Mode>('all');
  const [tags, setTags] = useState<SessionTag[]>([]);
  const [lungVols, setLungVols] = useState<('FL' | 'FRC' | 'RV')[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('week');
  const [metric, setMetric] = useState<Metric>('sessions');

  if (!backup) return <Navigate to="/" replace />;
  const sessions = backup.data.sessions;

  // Resolve the active date range. Preset wins unless preset === 'custom'.
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
    return { from, to, mode, sessionTags: tags, lungVols };
  }, [presetId, customFrom, customTo, mode, tags, lungVols]);

  const filtered = useMemo(() => applyFilters(sessions, filters), [sessions, filters]);
  const buckets = useMemo(() => aggregate(filtered, groupBy, metric), [filtered, groupBy, metric]);

  const metricDef = PLAYGROUND_METRICS.find((m) => m.id === metric) ?? PLAYGROUND_METRICS[0];

  const showLungVols = mode === 'dry' || mode === 'all';

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            Playground
          </h1>
          <p className="mt-1 max-w-xl text-sm text-textDim">
            Pivot any subset of your data — filter by date, mode, tags,
            lung volume, then group and aggregate.
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
      </header>

      <section className="space-y-5 rounded-lg border border-border bg-panel p-5">
        <FieldRow label="Date range">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Pill
                key={p.id}
                active={presetId === p.id}
                onClick={() => setPresetId(p.id)}
              >
                {p.label}
              </Pill>
            ))}
            <Pill
              active={presetId === 'custom'}
              onClick={() => setPresetId('custom')}
            >
              Custom
            </Pill>
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
              <Pill
                key={m.id}
                active={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </Pill>
            ))}
          </div>
        </FieldRow>

        <FieldRow label="Session tag">
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <Pill
                key={t.id}
                active={tags.includes(t.id)}
                onClick={() => setTags(toggle(tags, t.id))}
              >
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

        {showLungVols && (
          <FieldRow label="Lung volume" hint="dry sessions only">
            <div className="flex flex-wrap gap-2">
              {LUNG_VOLS.map((lv) => (
                <Pill
                  key={lv}
                  active={lungVols.includes(lv)}
                  onClick={() => setLungVols(toggle(lungVols, lv))}
                >
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

      <section className="mt-5 space-y-4 rounded-lg border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center gap-6">
          <FieldRow label="Group by" inline>
            <div className="flex gap-2">
              {GROUP_BY.map((g) => (
                <Pill
                  key={g.id}
                  active={groupBy === g.id}
                  onClick={() => setGroupBy(g.id)}
                >
                  {g.label}
                </Pill>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Metric" inline>
            <div className="flex flex-wrap gap-2">
              {PLAYGROUND_METRICS.map((m) => (
                <Pill
                  key={m.id}
                  active={metric === m.id}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </Pill>
              ))}
            </div>
          </FieldRow>
        </div>

        <div>
          {buckets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-deep py-12 text-center text-textDim">
              No sessions match these filters.
            </p>
          ) : (
            <ReactECharts
              option={buildChartOption(buckets, metricDef)}
              style={{ height: 320 }}
              notMerge
            />
          )}
          <p className="mt-3 font-mono text-[11px] text-textDim">
            {filtered.length} session{filtered.length === 1 ? '' : 's'} match the
            filters above
            {buckets.length > 0 && ` · grouped into ${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`}.
          </p>
        </div>
      </section>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  inline,
  children,
}: {
  label: string;
  hint?: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={inline ? 'flex items-center gap-3' : ''}>
      <div className={inline ? '' : 'mb-2'}>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {label}
        </span>
        {hint && (
          <span className="ml-2 font-mono text-[10px] text-textDim opacity-60">
            · {hint}
          </span>
        )}
      </div>
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

function buildChartOption(
  buckets: { label: string; value: number }[],
  metric: { unit: string; label: string },
) {
  return {
    grid: { left: 56, right: 16, top: 16, bottom: 48, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const v = typeof p.value === 'number' ? p.value.toFixed(1).replace(/\.0$/, '') : p.value;
        return `${p.name}<br/><b>${v}</b> ${metric.unit}`;
      },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: '#262626' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (val: string, idx: number) => {
          // Reduce density when buckets are crowded.
          if (buckets.length > 18 && idx % 2 !== 0) return '';
          return val;
        },
      },
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: { color: '#9a9a9e', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10 },
      minInterval: metric.unit === 'sessions' || metric.unit === 'days' || metric.unit === 'holds' ? 1 : undefined,
    },
    series: [
      {
        type: 'bar',
        data: buckets.map((b) => b.value),
        itemStyle: { color: '#4fc3f7', borderRadius: [3, 3, 0, 0] },
        barWidth: '70%',
      },
    ],
  };
}
