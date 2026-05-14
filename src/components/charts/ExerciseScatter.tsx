/**
 * ExerciseScatter — one dot per individual hold/dive across a period.
 *
 * X = the day the session happened. Y = the mode's performance metric.
 * Holds/dives from the same session land on the same X column and
 * separate on Y, so a heavy training day reads as a vertical cluster.
 *
 * Breath-hold mode renders TWO colour-distinguished series — dry-session
 * holds and pool STA dives — both on a seconds y-axis. Depth and Pool
 * modes are a single series each (metres).
 */
import ReactECharts from 'echarts-for-react';
import type {
  ExerciseMode,
  ExercisePoint,
  ExerciseScatterData,
  ExerciseSource,
} from '../../lib/analytics/periodExercises';

interface Props {
  data: ExerciseScatterData;
  mode: ExerciseMode;
}

const SOURCE_COLOR: Record<ExerciseSource, string> = {
  dry: '#66bb6a',       // green — dry holds
  'pool-sta': '#ff5f9e', // pink — pool STA. "Pink = pool" stays consistent
                         // with Pool-distance mode, and it's clearly
                         // distinct from the green dry holds it shares the
                         // breath-hold chart with.
  depth: '#4fc3f7',     // blue — depth
  pool: '#ff5f9e',      // pink — pool distance
};

const SOURCE_LABEL: Record<ExerciseSource, string> = {
  dry: 'Dry holds',
  'pool-sta': 'Pool STA',
  depth: 'Depth dives',
  pool: 'Pool dives',
};

/** breath-hold values are durations (m:ss); depth/pool are metres. */
function isDuration(mode: ExerciseMode): boolean {
  return mode === 'breathhold';
}

function fmtValue(mode: ExerciseMode, v: number): string {
  if (isDuration(mode)) {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${Math.round(v)}m`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const Y_LABEL: Record<ExerciseMode, string> = {
  breathhold: 'Hold time',
  depth: 'Max depth (m)',
  pool: 'Distance (m)',
};

export function ExerciseScatter({ data, mode }: Props) {
  if (data.points.length === 0) {
    const what =
      mode === 'breathhold'
        ? 'dry sessions or pool STA dives'
        : mode === 'depth'
          ? 'depth sessions'
          : 'pool distance dives';
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
        No {what} in this period.
      </div>
    );
  }

  // Group points by source so each becomes its own ECharts series — gives
  // breath-hold mode two colours + a legend, single-source modes just one.
  const bySource = new Map<ExerciseSource, ExercisePoint[]>();
  for (const pt of data.points) {
    const arr = bySource.get(pt.source) ?? [];
    arr.push(pt);
    bySource.set(pt.source, arr);
  }

  const series = Array.from(bySource.entries()).map(([source, pts]) => ({
    name: SOURCE_LABEL[source],
    type: 'scatter' as const,
    symbolSize: 9,
    itemStyle: {
      color: SOURCE_COLOR[source],
      opacity: 0.72,
      borderColor: SOURCE_COLOR[source],
      borderWidth: 1,
    },
    emphasis: { itemStyle: { opacity: 1 } },
    data: pts.map((pt) => ({ value: [pt.dateMs, pt.value], _meta: pt })),
  }));

  const multiSeries = series.length > 1;

  const option = {
    grid: { left: 64, right: 24, top: multiSeries ? 32 : 16, bottom: 40 },
    animation: false,
    legend: multiSeries
      ? {
          top: 0,
          right: 0,
          textStyle: { color: '#9a9a9e', fontFamily: 'Inter, system-ui', fontSize: 11 },
          itemWidth: 10,
          itemHeight: 10,
          icon: 'circle',
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      formatter: (p: any) => {
        const meta = p.data._meta as ExercisePoint;
        const unit = meta.source === 'dry' ? 'Hold' : 'Dive';
        return (
          `<div style="font-weight:600;margin-bottom:2px">${fmtDate(meta.dateMs)}</div>` +
          `${meta.sessionName}<br/>` +
          `${unit} ${meta.indexInSession}: <b>${fmtValue(mode, meta.value)}</b>`
        );
      },
    },
    xAxis: {
      type: 'time',
      min: data.periodStartMs,
      max: data.periodEndMs,
      axisLine: { lineStyle: { color: '#262626' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
    },
    yAxis: {
      type: 'value',
      name: Y_LABEL[mode],
      nameTextStyle: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => fmtValue(mode, v),
      },
    },
    series,
  };

  // Summary line.
  const count = data.points.length;
  const days = new Set(data.points.map((p) => new Date(p.dateMs).toDateString())).size;
  const best = data.points.reduce((m, p) => Math.max(m, p.value), 0);
  const noun = mode === 'breathhold' ? 'hold/dive' : 'dive';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-panel p-3">
        <ReactECharts option={option} style={{ height: 360 }} notMerge />
      </div>
      <p className="font-mono text-[11px] text-textDim">
        {count} {noun}
        {count === 1 ? '' : 's'} across {days} training day{days === 1 ? '' : 's'}
        {' · best '}
        {fmtValue(mode, best)}
      </p>
    </div>
  );
}
