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
import ReactECharts from '../components/charts/EChart';
import { BucketDives } from '../components/BucketDives';
import { useLangValue, useT } from '../i18n';
import { useChartTheme, withAlpha, type ChartTheme } from '../lib/chartTheme';
import { useBackupStore } from '../stores/useBackupStore';
import type { ParsedSession } from '../schema/backup';
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
import {
  bucketTakeaway,
  changeTakeaway,
  compareRange,
  quantile,
  spreadTakeaway,
  type CompareWith,
  type Takeaway,
} from '../lib/analytics/playgroundInsight';
import { escapeHtml } from '../lib/safeHtml';

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

const NO_SESSIONS: ParsedSession[] = [];

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
  const t = useT();
  const lang = useLangValue();
  const cm = commonOf(useChartTheme());
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
  // The bar whose dives are listed under the chart, and the earlier period
  // the bars are compared with.
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<CompareWith>('none');

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

  const sessions = backup?.data.sessions ?? NO_SESSIONS;

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

  // The same chart over an earlier period, as ghost bars. Only for bars, and
  // not when the groups are dates (two periods share none of them).
  const canCompare = effRender === 'bar' && dim?.group !== 'Time' && !!filters.from && !!filters.to;
  const cmpRange = useMemo(
    () => (canCompare ? compareRange(filters.from, filters.to, compareWith) : null),
    [canCompare, filters, compareWith],
  );
  const cmpBuckets = useMemo(
    () =>
      cmpRange && metric && dim
        ? pivot(flatten(applyFilters(sessions, { ...filters, ...cmpRange })), dim, metric, stat)
        : null,
    [cmpRange, sessions, filters, metric, dim, stat],
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

  if (!backup) return <Navigate to="/" replace />;

  // ── The sentence ──────────────────────────────────────────────────────────
  // One template per chart type, each word that can change a chip. The
  // template is translated whole, so every language keeps its own word order.
  const statWord: Record<Stat, string> = {
    avg: t('average'),
    median: t('median'),
    max: t('highest'),
    min: t('lowest'),
    count: t('number'),
  };
  const modeWord: Record<SessionMode, string> = {
    depth: t('depth dives'),
    pool: t('pool dives'),
    dry: t('dry sessions'),
  };
  const periodWord: Record<string, string> = {
    all: t('all time'),
    '30': t('the last 30 days'),
    '90': t('the last 90 days'),
    '365': t('the last year'),
    custom: t('a custom range'),
  };
  const chartWord: Record<RenderMode, string> = {
    bar: t('bars'),
    box: t('a box plot'),
    scatter: t('a scatter'),
    hist: t('a histogram'),
    xy: t('an X×Y plot'),
    heatmap: t('a heatmap'),
  };
  const counting = stat === 'count' && (effRender === 'bar' || effRender === 'heatmap');
  // A label as a word inside the sentence: translated, and lowercased only
  // in English (German capitalises its nouns).
  const word = (label: string) => (lang === 'en' ? softLower(t(label)) : t(label));
  const template =
    effRender === 'box'
      ? t('Show the spread of {metric} in my {mode} by {dim} over {period} as {chart}.')
      : effRender === 'hist'
        ? t('Show how {metric} is spread across my {mode} over {period} as {chart}.')
        : effRender === 'xy'
          ? t('Show {metric} against {xMetric} for my {mode} over {period} as {chart}.')
          : effRender === 'scatter'
            ? t('Show {metric} against {dim} for my {mode} over {period} as {chart}.')
            : effRender === 'heatmap'
              ? counting
                ? t('Show the {stat} of my {mode} by {dim} and {dim2} over {period} as {chart}.')
                : t('Show the {stat} {metric} of my {mode} by {dim} and {dim2} over {period} as {chart}.')
              : counting
                ? t('Show the {stat} of my {mode} by {dim} over {period} as {chart}.')
                : t('Show the {stat} {metric} of my {mode} by {dim} over {period} as {chart}.');

  const dimSelectOptions = dimGroups.flatMap((g) =>
    g.dims.map((d) => ({ value: d.id, label: t(d.label), group: t(g.label) })),
  );
  const metricSelectOptions = availableMetrics.map((m) => ({ value: m.id, label: `${t(m.label)} (${m.unit})` }));
  const chips: Record<string, React.ReactNode> = {
    stat: (
      <ChipSelect
        label={statWord[stat]}
        value={stat}
        ariaLabel={t('Stat')}
        onChange={(v) => setStat(v as Stat)}
        options={STATS.map((s) => ({ value: s.id, label: statWord[s.id] }))}
      />
    ),
    metric: (
      <ChipSelect
        label={metric ? word(metric.label) : '–'}
        value={metric?.id ?? ''}
        ariaLabel={effRender === 'xy' ? t('Y (metric)') : t('What (metric)')}
        onChange={setMetricId}
        options={metricSelectOptions}
      />
    ),
    xMetric: (
      <ChipSelect
        label={xMetric ? word(xMetric.label) : '–'}
        value={xMetric?.id ?? ''}
        ariaLabel={t('X (metric)')}
        onChange={setXMetricId}
        options={metricSelectOptions}
      />
    ),
    mode: (
      <ChipSelect
        label={modeWord[mode]}
        value={mode}
        ariaLabel={t('Mode')}
        onChange={(v) => setMode(v as SessionMode)}
        options={MODES.map((m) => ({ value: m.id, label: modeWord[m.id as SessionMode] }))}
      />
    ),
    dim: (
      <ChipSelect
        label={dim ? word(DIM_GROUP_NOUN[dim.id] ?? dim.label) : '–'}
        value={dim?.id ?? ''}
        ariaLabel={t('By (dimension)')}
        onChange={setDimId}
        options={dimSelectOptions}
      />
    ),
    dim2: (
      <ChipSelect
        label={dim2 ? word(DIM_GROUP_NOUN[dim2.id] ?? dim2.label) : '–'}
        value={dim2?.id ?? ''}
        ariaLabel={t('By (two dimensions)')}
        onChange={setDim2Id}
        options={dimSelectOptions}
      />
    ),
    period: (
      <ChipSelect
        label={periodWord[presetId] ?? periodWord.all}
        value={presetId}
        ariaLabel={t('Date range')}
        onChange={setPresetId}
        options={[...PRESETS.map((p) => p.id), 'custom'].map((id) => ({ value: id, label: periodWord[id] }))}
      />
    ),
    chart: (
      <ChipSelect
        label={chartWord[effRender]}
        value={effRender}
        ariaLabel={t('Chart')}
        onChange={(v) => setRender(v as RenderMode)}
        options={(['bar', 'box', 'scatter', 'hist', 'xy', 'heatmap'] as RenderMode[])
          // A scatter needs a numeric dimension to put on its x axis.
          .filter((r) => r !== 'scatter' || dimIsNumeric)
          .map((r) => ({ value: r, label: chartWord[r] }))}
      />
    ),
  };
  const sentence = template.split(/(\{[a-zA-Z0-9]+\})/).map((part, i) => {
    const key = /^\{([a-zA-Z0-9]+)\}$/.exec(part)?.[1];
    return key && chips[key] ? <span key={i}>{chips[key]}</span> : <span key={i}>{part}</span>;
  });

  // The second sentence: an earlier period to compare the bars with.
  const compareWord: Record<CompareWith, string> = {
    none: t('nothing'),
    prev: t('the period before'),
    year: t('the same dates a year earlier'),
  };
  const compareLine =
    effRender !== 'bar' || dim?.group === 'Time' ? null : canCompare ? (
      t('Compared with {compare}.')
        .split(/(\{compare\})/)
        .map((part, i) =>
          part === '{compare}' ? (
            <ChipSelect
              key={i}
              label={compareWord[compareWith]}
              value={compareWith}
              ariaLabel={t('Compared with')}
              onChange={(v) => setCompareWith(v as CompareWith)}
              options={(['none', 'prev', 'year'] as CompareWith[]).map((c) => ({ value: c, label: compareWord[c] }))}
            />
          ) : (
            <span key={i}>{part}</span>
          ),
        )
    ) : (
      <span className="text-sm">{t('Pick a time range to compare it with an earlier one.')}</span>
    );

  // The answer line over the chart.
  const unitOf = counting ? '' : (metric?.unit ?? '');
  const ordered = dim?.group === 'Time' || dim?.group === 'Numeric' || dim?.sortBy === 'numeric';
  const showsBars = effRender === 'bar' || effRender === 'box';
  const drill = showsBars && drillKey != null ? (buckets.find((b) => b.key === drillKey) ?? null) : null;
  let takeaway: Takeaway | null = null;
  if (effRender === 'bar') {
    takeaway = cmpBuckets
      ? changeTakeaway(buckets, cmpBuckets)
      : bucketTakeaway(buckets, { ordered, counting: stat === 'count' });
  } else if (effRender === 'box') {
    takeaway = bucketTakeaway(buckets, {
      ordered,
      counting: false,
      value: (b) => quantile([...b.points].sort((x, y) => x - y), 0.5),
    });
  } else if (effRender === 'hist') {
    takeaway = spreadTakeaway(buckets);
  } else if (effRender === 'heatmap' && heat && heat.cells.length > 0) {
    let top = heat.cells[0];
    for (const c of heat.cells) if (c.value > top.value) top = c;
    takeaway = { kind: 'cell', x: heat.xKeys[top.x], y: heat.yKeys[top.y], value: top.value };
  }
  const fitNow = effRender === 'scatter' ? scatterFit : effRender === 'xy' ? xyFit : null;
  const headline: React.ReactNode = fitNow
    ? `${describeCorrelation(fitNow.r, t)} · r = ${fitNow.r.toFixed(2)}`
    : takeaway
      ? takeawayLine(takeaway, unitOf, effRender === 'box', mode === 'dry' ? t('sessions') : t('dives'), t, cm)
      : null;

  // The first question of each topic as a one-tap pill; the rest in "More".
  const featured = CATEGORY_ORDER.map((c) => QUESTIONS.find((q) => q.category === c)).filter(
    (q): q is QuestionPreset => q != null,
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">{t('Playground')}</h1>
          <p className="mt-1 max-w-xl text-sm text-textDim">
            {t('Pick a question, or change any coloured word to build your own chart.')}
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          {t('← back to sessions')}
        </Link>
      </header>

      <section className="mb-5 space-y-4 board p-5">
        <p className="font-heading text-base leading-[2.2] text-text sm:text-xl sm:leading-[2.4]">{sentence}</p>
        {compareLine && (
          <p className="-mt-3 font-heading text-base leading-[2.2] text-textDim sm:text-lg">{compareLine}</p>
        )}

        {presetId === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label={t('From')}
              className="rounded-md border border-border bg-abyss px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
            />
            <span className="font-mono text-xs text-textDim">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label={t('To')}
              className="rounded-md border border-border bg-abyss px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {mode === 'dry' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">{t('Only')}</span>
            {TAGS.map((tag) => (
              <Pill key={tag.id} active={tags.includes(tag.id)} onClick={() => setTags(toggle(tags, tag.id))}>
                {t(tag.label)}
              </Pill>
            ))}
            <span className="mx-1 text-textDim opacity-40">·</span>
            {LUNG_VOLS.map((lv) => (
              <Pill key={lv} active={lungVols.includes(lv)} onClick={() => setLungVols(toggle(lungVols, lv))}>
                {lv}
              </Pill>
            ))}
            {(tags.length > 0 || lungVols.length > 0) && (
              <button
                onClick={() => {
                  setTags([]);
                  setLungVols([]);
                }}
                className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
              >
                {t('clear')}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">{t('Try')}</span>
          {/* On a phone the long pills would fill the screen; "More" has them all. */}
          {featured.map((qp) => (
            <button key={qp.q} onClick={() => applyPreset(qp)} className="pill px-3 py-1 text-sm max-sm:hidden">
              {t(qp.q)}
            </button>
          ))}
          <ChipSelect
            label={`${t('More questions')}`}
            value=""
            ariaLabel={t('More questions')}
            onChange={(v) => {
              const qp = QUESTIONS[Number(v)];
              if (qp) applyPreset(qp);
            }}
            options={QUESTIONS.map((q, i) => ({ value: String(i), label: t(q.q), group: t(q.category) }))}
            small
          />
        </div>
      </section>

      <section className="space-y-3 board p-5">
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
                {t('No data for this view. Try a different metric/dimension or widen the filters.')}
              </p>
            );
          }
          const option =
            effRender === 'box'
              ? buildBoxOption(buckets, metric, dim, t, cm, drill?.key ?? null)
              : effRender === 'scatter'
                ? buildScatterOption(buckets, metric, dim, scatterFit, cm)
                : effRender === 'hist'
                  ? buildHistogramOption(buckets, metric, t, cm)
                  : effRender === 'xy'
                    ? buildXyOption(xyPts, xMetric, metric, xyFit, cm)
                    : effRender === 'heatmap'
                      ? buildHeatmapOption(heat, metric, dim, dim2, stat, t, cm)
                      : buildBarOption(buckets, metric, dim, stat, cm, {
                          selected: drill?.key ?? null,
                          compare: cmpBuckets,
                          whiskers: (stat === 'avg' || stat === 'median') && !cmpBuckets,
                        });
          return (
            <>
              {headline && <p className="font-heading text-lg font-bold leading-snug text-text sm:text-xl">{headline}</p>}
              <ReactECharts
                option={option}
                style={{ height: effRender === 'heatmap' ? 440 : 400 }}
                notMerge
                onEvents={
                  showsBars
                    ? {
                        click: (p: { componentType?: string; seriesType?: string; dataIndex: number }) => {
                          if (p.seriesType !== 'bar' && p.seriesType !== 'boxplot') return;
                          const key = buckets[p.dataIndex]?.key ?? null;
                          setDrillKey((cur) => (cur === key ? null : key));
                        },
                      }
                    : undefined
                }
              />
              {cmpBuckets && cmpRange && (
                <p className="flex flex-wrap justify-center gap-x-4 font-mono text-[11px] text-textDim">
                  <span>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: withAlpha(cm.textDim, 0.45) }} />
                    {rangeLabel(cmpRange.from, cmpRange.to)}
                  </span>
                  <span>
                    {/* The current bars wear their own colours: a strip of them. */}
                    <span
                      className="mr-1 inline-block h-2.5 w-4 rounded-sm align-middle"
                      style={{
                        background:
                          buckets.length > 1
                            ? `linear-gradient(90deg, ${buckets
                                .slice(0, 4)
                                .map((b, i) => categoryColor(b.label, i, cm))
                                .join(', ')})`
                            : categoryColor(buckets[0]?.label ?? '', 0, cm),
                      }}
                    />
                    {rangeLabel(filters.from!, filters.to!)}
                  </span>
                </p>
              )}
              {drill ? (
                <BucketDives
                  bucket={drill}
                  color={effRender === 'box' ? cm.accent : categoryColor(drill.label, buckets.indexOf(drill), cm)}
                  format={(v) => withUnit(v, metric.unit)}
                  onClose={() => setDrillKey(null)}
                />
              ) : (
                showsBars && (
                  <p className="text-center font-mono text-[11px] text-textDim">
                    {t(effRender === 'box' ? 'Click a box to see what is in it.' : 'Click a bar to see what is in it.')}
                  </p>
                )
              )}
            </>
          );
        })()}

        {/* What the chart shows, in plain words, under it. */}
        <PivotHelp
          metricLabel={metric?.label ?? t('the metric')}
          dimLabel={dim ? (DIM_GROUP_NOUN[dim.id] ?? dim.label) : t('group')}
          rawDimLabel={dim?.label ?? t('group')}
          xMetricLabel={xMetric?.label ?? t('another metric')}
          dim2Label={dim2 ? (DIM_GROUP_NOUN[dim2.id] ?? dim2.label) : t('group')}
          stat={stat}
          render={effRender}
          mode={mode}
          whiskers={effRender === 'bar' && (stat === 'avg' || stat === 'median') && !cmpBuckets}
        />
        <p className="font-mono text-[11px] text-textDim">
          {filtered.length} {t(filtered.length === 1 ? 'session' : 'sessions')} · {items.length} {t(items.length === 1 ? 'item' : 'items')}
          {buckets.length > 0 && ` · ${buckets.length} ${t(buckets.length === 1 ? 'bucket' : 'buckets')}`}
        </p>
      </section>
    </div>
  );
}

// ── Picker helpers ──────────────────────────────────────────────────────────

/** A word in the sentence that is also a choice: it reads as a chip and a
 *  transparent native select on top does the picking, so it works with the
 *  keyboard, screen readers and phone pickers, and keeps option groups. */
function ChipSelect({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  small = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; group?: string }[];
  onChange: (v: string) => void;
  ariaLabel: string;
  small?: boolean;
}) {
  const groups: { group: string | undefined; items: typeof options }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else groups.push({ group: o.group, items: [o] });
  }
  return (
    <span
      className={`relative inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-abyss align-baseline font-num font-semibold text-accent transition-colors hover:border-accent ${
        small ? 'px-2.5 py-0.5 text-sm' : 'px-2 py-0.5'
      }`}
      style={{ borderBottom: '3px solid rgb(var(--c-bevelBot))' }}
    >
      {label}
      <span aria-hidden className="text-[0.7em] opacity-70">▾</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {value === '' && <option value="">{label}</option>}
        {groups.map((g, i) =>
          g.group ? (
            <optgroup key={i} label={g.group}>
              {g.items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            g.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </span>
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
      className={`pill px-3 py-1 text-sm ${active ? 'pill-on' : ''}`}
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
  whiskers,
}: {
  metricLabel: string;
  dimLabel: string;
  rawDimLabel: string;
  xMetricLabel: string;
  dim2Label: string;
  stat: Stat;
  render: RenderMode;
  mode: SessionMode;
  whiskers: boolean;
}) {
  const t = useT();
  const noun = mode === 'dry' ? t('sessions') : t('dives');
  const m = softLower(metricLabel);
  const d = softLower(dimLabel);
  const Em = ({ children }: { children: React.ReactNode }) => (
    <span className="font-semibold text-text">{children}</span>
  );

  let body: React.ReactNode;
  if (render === 'xy') {
    body = (
      <>
        {t('Each dot is one dive:')} <Em>{m}</Em> {t('(vertical) against')}{' '}
        <Em>{softLower(xMetricLabel)}</Em>{' '}
        {t('(horizontal). The line is a linear fit, and the r below shows how tightly the two move together. The dimension and Stat are ignored here.')}
      </>
    );
  } else if (render === 'heatmap') {
    const w =
      stat === 'avg'
        ? t('average')
        : stat === 'median'
          ? t('median')
          : stat === 'max'
            ? t('highest')
            : stat === 'min'
              ? t('lowest')
              : t('count');
    body =
      stat === 'count' ? (
        <>
          {t('Each cell counts the')} {noun} {t('in that')} <Em>{d}</Em> ×{' '}
          <Em>{softLower(dim2Label)}</Em>{' '}
          {t('combination; darker = more. Blank cells mean none.')}
        </>
      ) : (
        <>
          {t('Each cell is the')} <Em>{w}</Em> {m} {t('for the')} {noun} {t('in that')} <Em>{d}</Em> ×{' '}
          <Em>{softLower(dim2Label)}</Em>{' '}
          {t('combination; darker = higher. Blank cells mean no {noun} there.').replace('{noun}', noun)}
        </>
      );
  } else if (render === 'scatter') {
    body = (
      <>
        {t('Each dot is one dive:')} <Em>{m}</Em> {t('(vertical) against')}{' '}
        <Em>{softLower(rawDimLabel)}</Em>{' '}
        {t('(horizontal). The line is a linear fit, and the r below it shows how tightly they track (±1 = perfect, 0 = none). The Stat toggle does not apply here.')}
      </>
    );
  } else if (render === 'hist') {
    body = (
      <>
        {t('Each bar counts how many')} {noun} {t('fall in a')} <Em>{m}</Em>{' '}
        {t('range, across every group. It shows the overall shape and spread of {m}; the dimension and Stat are ignored.').replace('{m}', m)}
      </>
    );
  } else if (render === 'box') {
    body = (
      <>
        {t('Each box shows the')} <Em>{t('spread')}</Em>{' '}
        {t('of {m} across the {noun}, grouped by {d}: the line is the').replace('{m}', m).replace('{noun}', noun).replace('{d}', d)}{' '}
        <Em>{t('median')}</Em>,{' '}
        {t('the box covers the middle 50% (Q1 to Q3), the whiskers reach the rest within 1.5×IQR, and dots are outliers. The Stat toggle does not change the box; switch to Bars to use it.')}
      </>
    );
  } else if (stat === 'count') {
    body = (
      <>
        {t('Each bar is the')} <Em>{t('number of {noun}').replace('{noun}', noun)}</Em>,{' '}
        {t('grouped by {d}. The metric ({metricLabel}) is ignored here; only the count matters.').replace('{d}', d).replace('{metricLabel}', metricLabel)}
      </>
    );
  } else {
    const word =
      stat === 'avg'
        ? t('average (mean)')
        : stat === 'median'
          ? t('median (middle value)')
          : stat === 'max'
            ? t('single highest')
            : t('single lowest');
    body = (
      <>
        {t('Each bar is the')} <Em>{word}</Em>{' '}
        {t('{m} of the {noun}, grouped by {d}.').replace('{m}', m).replace('{noun}', noun).replace('{d}', d)}
        {stat === 'median'
          ? ' ' + t('Half are higher and half lower, so it is less swayed by outliers than the average.')
          : ''}{' '}
        {whiskers ? t('The thin line on each bar marks where the middle half of them fall.') + ' ' : ''}
        <span className="opacity-70">{t('n = number of {noun} per bar.').replace('{noun}', noun)}</span>
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

/** Chart chrome + series colours for the playground builders, derived
 *  from the active theme so the pivots follow Caribbean / Chalk Dark. */
function commonOf(ct: ChartTheme) {
  return {
    tooltipBg: ct.tooltipBg,
    axisLine: ct.axisLine,
    splitLine: ct.splitLine,
    text: ct.text,
    textDim: ct.textDim,
    accent: ct.accent,
    highlight: ct.highlight,
    heatRamp: ct.heatRamp,
    mono: ct.fontFamily,
    inter: ct.fontFamily,
    /** A bar that went up / down against the compared period. */
    up: ct.green,
    down: ct.red,
    /** Colours for categories that have none of their own. */
    palette: [...new Set([ct.accent, ct.highlight, ct.amber, ct.profile, ct.red, ct.green])],
  };
}

/** Disciplines keep the colours they have everywhere else in the analyzer
 *  (progression chart, pace chart); other categories take the palette. */
const DISCIPLINE_COLORS: Record<string, string> = {
  CWT: '#1bafe0',
  CWTB: '#8a5fd6',
  FIM: '#1fb894',
  CNF: '#f0a500',
  VWT: '#e84393',
  NLT: '#e24b3c',
  STA: '#e8c04a',
  DYN: '#1fb894',
  DYNB: '#8a5fd6',
  DNF: '#e84393',
};

function categoryColor(label: string, i: number, cm: PlaygroundTheme): string {
  return DISCIPLINE_COLORS[label.toUpperCase()] ?? cm.palette[i % cm.palette.length];
}

/** '#rrggbb' a little toward white, for the lit top of a bar. */
function lighten(hex: string, f: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const ch = (k: number) => {
    const v = parseInt(hex.slice(k, k + 2), 16);
    return Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}
type PlaygroundTheme = ReturnType<typeof commonOf>;

function fmt(v: number, unit: string): string {
  if (unit === 's' || unit === 's/100m') {
    const m = Math.floor(v / 60);
    const sec = Math.round(v % 60);
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  }
  if (unit === '×') return v.toFixed(2);
  // Speeds differ in the second decimal (0.97 vs 1.02 m/s); one would hide that.
  if (unit === 'm/s') return v.toFixed(2);
  if (unit === 'bpm' || unit === 'm') return v.toFixed(1).replace(/\.0$/, '');
  return String(Math.round(v));
}

/** A value with its unit, as the answer line and the dot strip print it. */
function withUnit(v: number, unit: string): string {
  if (!unit) return String(Math.round(v));
  if (unit === 's') return fmt(v, unit);
  if (unit === 's/100m') return `${fmt(v, unit)} /100 m`;
  if (unit === '×') return `${fmt(v, unit)}×`;
  return `${fmt(v, unit)} ${unit}`;
}

function signed(d: number, unit: string): string {
  return `${d >= 0 ? '+' : '−'}${withUnit(Math.abs(d), unit)}`;
}

function rangeLabel(from: string, to: string): string {
  const f = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${f(from)} – ${f(to)}`;
}

/** The answer line: a template with its numbers filled in, the change
 *  coloured up or down. */
function takeawayLine(
  tk: Takeaway,
  unit: string,
  median: boolean,
  noun: string,
  t: (s: string) => string,
  cm: PlaygroundTheme,
): React.ReactNode {
  const u = (v: number) => withUnit(v, unit);
  let template = '';
  const vars: Record<string, React.ReactNode> = {};
  const delta = (d: number) => (
    <span style={{ color: d >= 0 ? cm.up : cm.down }}>{signed(d, unit)}</span>
  );
  switch (tk.kind) {
    case 'lead':
      template = median
        ? t('{top} has the highest median, {value}, {diff} above {second}.')
        : t('{top} is highest at {value}, {diff} above {second}.');
      Object.assign(vars, { top: tk.top, value: u(tk.value), diff: u(tk.diff), second: tk.second });
      break;
    case 'trend':
      template = t('From {first} to {last}: {from} → {to} ({delta}).');
      Object.assign(vars, { first: tk.first, last: tk.last, from: u(tk.from), to: u(tk.to), delta: delta(tk.to - tk.from) });
      break;
    case 'most':
      template = t('{top} has the most: {n} {noun}.');
      Object.assign(vars, { top: tk.top, n: String(tk.n), noun });
      break;
    case 'change':
      template = t('Biggest change: {bucket}, {then} → {now} ({delta}).');
      Object.assign(vars, { bucket: tk.bucket, then: u(tk.then), now: u(tk.now), delta: delta(tk.now - tk.then) });
      break;
    case 'spread':
      template = t('Half of them fall between {q1} and {q3}.');
      Object.assign(vars, { q1: u(tk.q1), q3: u(tk.q3) });
      break;
    case 'cell':
      template = t('Highest: {x} × {y} at {value}.');
      Object.assign(vars, { x: tk.x, y: tk.y, value: u(tk.value) });
      break;
  }
  return template.split(/(\{[a-z0-9]+\})/i).map((part, i) => {
    const key = /^\{([a-z0-9]+)\}$/i.exec(part)?.[1];
    return <span key={i}>{key && key in vars ? vars[key] : part}</span>;
  });
}

function buildBarOption(
  buckets: PivotBucket[],
  metric: PivotMetric,
  dim: PivotDimension,
  stat: Stat,
  cm: PlaygroundTheme,
  extra: {
    /** The bar whose dives are listed: outlined, the others dimmed. */
    selected: string | null;
    /** The compared period's buckets, drawn as ghost bars. */
    compare: PivotBucket[] | null;
    /** Mark the middle half (Q1 to Q3) of each bar's items. */
    whiskers: boolean;
  },
) {
  const before = extra.compare ? new Map(extra.compare.map((b) => [b.key, b.value] as const)) : null;
  // [index, q1, q3, value]; no spread on a bar of fewer than 3.
  const spread = buckets.map((b, i) => {
    if (!extra.whiskers || b.n < 3) return [i, NaN, NaN, b.value];
    const sorted = [...b.points].sort((x, y) => x - y);
    return [i, quantile(sorted, 0.25), quantile(sorted, 0.75), b.value];
  });
  return {
    grid: { left: 56, right: 16, top: 30, bottom: 64, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const b = buckets[p.dataIndex];
        const then = before?.get(b.key);
        const [, q1, q3] = spread[p.dataIndex];
        return (
          `${escapeHtml(b.label)}<br/><b>${fmt(b.value, metric.unit)}</b> ${metric.unit}` +
          (then != null ? ` <span style="opacity:0.7">(${fmt(then, metric.unit)})</span>` : '') +
          (Number.isFinite(q1) ? `<br/><span style="opacity:0.7">${fmt(q1, metric.unit)} – ${fmt(q3, metric.unit)}</span>` : '') +
          `<br/><span style="opacity:0.7">${stat} · n = ${b.n}</span>`
        );
      },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: cm.textDim,
        fontFamily: cm.mono,
        fontSize: 10,
        interval: 0,
        rotate: buckets.length > 6 ? 30 : 0,
        // The category, and under it how many items make up its bar.
        formatter: (v: string, i: number) =>
          buckets.length > 6 ? v : `{cat|${v}}\n{n|n = ${buckets[i]?.n ?? 0}}`,
        rich: {
          cat: { color: cm.text, fontFamily: cm.mono, fontSize: 11, fontWeight: 700 },
          n: { color: cm.textDim, fontFamily: cm.mono, fontSize: 9, padding: [3, 0, 0, 0] },
        },
      },
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: `${stat} · ${metric.unit}`,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    series: [
      ...(before
        ? [
            {
              type: 'bar',
              data: buckets.map((b) => before.get(b.key) ?? '-'),
              itemStyle: { color: withAlpha(cm.textDim, 0.4), borderRadius: [6, 6, 0, 0] },
              barWidth: '30%',
              barGap: '10%',
            },
          ]
        : []),
      {
        type: 'bar',
        data: buckets.map((b, i) => {
          const c = categoryColor(b.label, i, cm);
          const on = extra.selected === b.key;
          return {
            value: b.value,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: lighten(c, 0.28) },
                  { offset: 1, color: c },
                ],
              },
              borderRadius: [6, 6, 0, 0],
              opacity: extra.selected && !on ? 0.45 : 1,
              ...(on ? { borderColor: cm.text, borderWidth: 3 } : {}),
            },
          };
        }),
        barWidth: before ? '30%' : '62%',
        cursor: 'pointer',
        label: {
          // With the spread marked, the whisker series prints the value
          // above its top cap instead.
          show: !extra.whiskers,
          position: 'top',
          color: cm.text,
          fontFamily: cm.mono,
          fontSize: 12,
          fontWeight: 700,
          formatter: (p: any) => {
            const b = buckets[p.dataIndex];
            const then = before?.get(b.key);
            if (then == null) return fmt(b.value, metric.unit);
            const d = b.value - then;
            return `{${d >= 0 ? 'up' : 'down'}|${d >= 0 ? '+' : '−'}${fmt(Math.abs(d), metric.unit)}}\n${fmt(b.value, metric.unit)}`;
          },
          rich: {
            up: { color: cm.up, fontFamily: cm.mono, fontSize: 11, fontWeight: 700, padding: [0, 0, 2, 0] },
            down: { color: cm.down, fontFamily: cm.mono, fontSize: 11, fontWeight: 700, padding: [0, 0, 2, 0] },
          },
        },
      },
      ...(extra.whiskers
        ? [
            {
              type: 'custom',
              silent: true,
              z: 5,
              encode: { x: 0, y: [1, 2, 3] },
              data: spread,
              renderItem: (_: unknown, api: { value: (dim: number) => number; coord: (v: number[]) => number[] }) => {
                const lo = api.coord([api.value(0), api.value(1)]);
                const hi = api.coord([api.value(0), api.value(2)]);
                const top = api.coord([api.value(0), api.value(3)]);
                const has = Number.isFinite(lo[1]) && Number.isFinite(hi[1]);
                const style = { stroke: cm.text, lineWidth: 2, opacity: 0.8 };
                const cap = 7;
                const labelY = (has ? Math.min(hi[1], top[1]) : top[1]) - 5;
                return {
                  type: 'group',
                  children: [
                    ...(has
                      ? [
                          { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
                          { type: 'line', shape: { x1: lo[0] - cap, y1: lo[1], x2: lo[0] + cap, y2: lo[1] }, style },
                          { type: 'line', shape: { x1: hi[0] - cap, y1: hi[1], x2: hi[0] + cap, y2: hi[1] }, style },
                        ]
                      : []),
                    {
                      type: 'text',
                      x: top[0],
                      y: labelY,
                      style: {
                        text: fmt(api.value(3), metric.unit),
                        align: 'center',
                        verticalAlign: 'bottom',
                        fill: cm.text,
                        font: `700 12px ${cm.mono}`,
                      },
                    },
                  ],
                };
              },
            },
          ]
        : []),
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
  t: (s: string) => string,
  cm: PlaygroundTheme,
  selected: string | null,
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
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (p: any) => {
        if (p.seriesType === 'boxplot') {
          const b = buckets[p.dataIndex];
          // ECharts may hand the box back with its category index in front.
          const v = (Array.isArray(p.value) ? p.value : []) as number[];
          const [min, q1, med, q3, max] = v.length === 6 ? v.slice(1) : v;
          return `${escapeHtml(b.label)}<br/>${t('median')} <b>${fmt(med, metric.unit)}</b><br/>` +
            `${t('q1')} ${fmt(q1, metric.unit)} · ${t('q3')} ${fmt(q3, metric.unit)}<br/>` +
            `${t('min')} ${fmt(min, metric.unit)} · ${t('max')} ${fmt(max, metric.unit)}<br/>` +
            `<span style="opacity:0.7">n = ${b.n}</span>`;
        }
        // Outlier scatter
        const b = buckets[p.data[0]];
        return `${escapeHtml(b.label)}<br/>${t('outlier')} <b>${fmt(p.data[1], metric.unit)}</b>`;
      },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: cm.textDim,
        fontFamily: cm.mono,
        fontSize: 10,
        interval: 0,
        rotate: buckets.length > 6 ? 30 : 0,
        // The category, and under it how many items make up its bar.
        formatter: (v: string, i: number) =>
          buckets.length > 6 ? v : `{cat|${v}}\n{n|n = ${buckets[i]?.n ?? 0}}`,
        rich: {
          cat: { color: cm.text, fontFamily: cm.mono, fontSize: 11, fontWeight: 700 },
          n: { color: cm.textDim, fontFamily: cm.mono, fontSize: 9, padding: [3, 0, 0, 0] },
        },
      },
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    series: [
      {
        type: 'boxplot',
        data: boxData.map((value, i) => ({
          value,
          // The box whose items are listed stands out; the rest step back.
          itemStyle: selected && buckets[i].key !== selected ? { opacity: 0.4 } : undefined,
        })),
        // A see-through fill keeps the median line visible.
        itemStyle: { color: withAlpha(cm.accent, 0.3), borderColor: cm.accent, borderWidth: 2 },
        cursor: 'pointer',
      },
      {
        type: 'scatter',
        data: outliers,
        symbolSize: 5,
        itemStyle: { color: cm.highlight, opacity: 0.7 },
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

function describeCorrelation(r: number, t: (s: string) => string): string {
  const a = Math.abs(r);
  if (a < 0.2) return t('No correlation');
  const strength = a < 0.4 ? t('Weak') : a < 0.7 ? t('Moderate') : t('Strong');
  return `${strength} ${r > 0 ? t('positive') : t('negative')} ${t('correlation')}`;
}

function buildScatterOption(
  buckets: PivotBucket[],
  metric: PivotMetric,
  dim: PivotDimension,
  fit: { slope: number; intercept: number; r: number } | null,
  cm: PlaygroundTheme,
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
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (p: any) =>
        `${escapeHtml(dim.label)}: ${escapeHtml(p.data[0])}<br/>${escapeHtml(metric.label)}: <b>${fmt(p.data[1], metric.unit)}</b> ${metric.unit}`,
    },
    xAxis: {
      type: 'value',
      // Fit the data, not zero: speeds and depths sit far from 0.
      scale: true,
      name: dim.label,
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: metric.unit,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    series: [
      { type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: cm.accent, opacity: 0.55 } },
      ...(fit
        ? [
            {
              type: 'line',
              data: lineData,
              showSymbol: false,
              lineStyle: { color: cm.highlight, width: 2 },
              tooltip: { show: false },
            },
          ]
        : []),
    ],
  };
}

function buildHistogramOption(buckets: PivotBucket[], metric: PivotMetric, t: (s: string) => string, cm: PlaygroundTheme) {
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
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const lo = min + p.dataIndex * width;
        return `${fmt(lo, metric.unit)} ${t('to')} ${fmt(lo + width, metric.unit)} ${metric.unit}<br/><b>${p.value}</b> ${t(p.value === 1 ? 'dive' : 'dives')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      name: metric.unit,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: cm.textDim,
        fontFamily: cm.mono,
        fontSize: 9,
        interval: Math.max(0, Math.floor(binCount / 8)),
      },
    },
    yAxis: {
      type: 'value',
      name: t('dives'),
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    series: [{ type: 'bar', data: counts, itemStyle: { color: cm.accent }, barWidth: '98%' }],
  };
}

function buildXyOption(
  pts: [number, number][],
  xMetric: PivotMetric,
  yMetric: PivotMetric,
  fit: { slope: number; intercept: number; r: number } | null,
  cm: PlaygroundTheme,
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
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (p: any) =>
        `${escapeHtml(xMetric.label)}: <b>${fmt(p.data[0], xMetric.unit)}</b> ${xMetric.unit}<br/>` +
        `${escapeHtml(yMetric.label)}: <b>${fmt(p.data[1], yMetric.unit)}</b> ${yMetric.unit}`,
    },
    xAxis: {
      type: 'value',
      // Fit the data, not zero: speeds and depths sit far from 0.
      scale: true,
      name: `${xMetric.label} (${xMetric.unit})`,
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: `${yMetric.label} (${yMetric.unit})`,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cm.splitLine } },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    series: [
      { type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: cm.accent, opacity: 0.55 } },
      ...(fit
        ? [
            {
              type: 'line',
              data: lineData,
              showSymbol: false,
              lineStyle: { color: cm.highlight, width: 2 },
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
  t: (s: string) => string,
  cm: PlaygroundTheme,
) {
  if (!heat) return { xAxis: { type: 'category', data: [] }, yAxis: { type: 'category', data: [] }, series: [] };
  const data = heat.cells.map((c) => [c.x, c.y, c.value]);
  const vals = heat.cells.map((c) => c.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const unitLabel = stat === 'count' ? t('dives') : metric.unit;
  return {
    grid: { left: 96, right: 16, top: 16, bottom: 96, containLabel: false },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: cm.tooltipBg,
      borderColor: cm.axisLine,
      textStyle: { color: cm.text, fontFamily: cm.inter, fontSize: 12 },
      formatter: (p: any) => {
        const c = heat.cells[p.dataIndex];
        return (
          `${escapeHtml(dim.label)}: ${escapeHtml(heat.xKeys[c.x])}<br/>${escapeHtml(dim2.label)}: ${escapeHtml(heat.yKeys[c.y])}<br/>` +
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
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: cm.textDim,
        fontFamily: cm.mono,
        fontSize: 9,
        interval: 0,
        rotate: heat.xKeys.length > 5 ? 30 : 0,
      },
    },
    yAxis: {
      type: 'category',
      data: heat.yKeys,
      name: dim2.label,
      nameTextStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
      axisLine: { lineStyle: { color: cm.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: cm.textDim, fontFamily: cm.mono, fontSize: 10 },
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      inRange: { color: [cm.heatRamp[0], cm.heatRamp[2], cm.heatRamp[4]] },
      textStyle: { color: cm.textDim, fontFamily: cm.mono, fontSize: 9 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          color: cm.text,
          fontFamily: cm.mono,
          fontSize: 9,
          formatter: (p: any) => fmt(p.data[2], metric.unit),
        },
        emphasis: { itemStyle: { borderColor: cm.text, borderWidth: 1 } },
      },
    ],
  };
}
