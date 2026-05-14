/**
 * ExerciseScatter — one dot per individual hold/dive across a period.
 *
 * X = the day the session happened. Y = the mode's performance metric.
 * Holds/dives from the same session land on the same X column and
 * separate on Y, so a heavy training day reads as a vertical cluster.
 *
 * This is the raw training-log view: density of training days, spread of
 * efforts within a day, and the climb of best efforts are all visible at
 * once — exactly the "how many holds, how long, what days" question.
 */
import ReactECharts from 'echarts-for-react';
import type { ExerciseMode, ExerciseScatterData } from '../../lib/analytics/periodExercises';

interface Props {
  data: ExerciseScatterData;
  mode: ExerciseMode;
}

const MODE_COLOR: Record<ExerciseMode, string> = {
  dry: '#66bb6a',
  depth: '#4fc3f7',
  pool: '#ff5f9e',
};

const MODE_Y_LABEL: Record<ExerciseMode, string> = {
  dry: 'Hold time',
  depth: 'Max depth (m)',
  pool: 'Dive time',
};

/** Whether the y value is a duration (formatted m:ss) or a plain number. */
function isDuration(mode: ExerciseMode): boolean {
  return mode === 'dry' || mode === 'pool';
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

export function ExerciseScatter({ data, mode }: Props) {
  if (data.points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
        No {mode} sessions in this period.
      </div>
    );
  }

  const color = MODE_COLOR[mode];

  const option = {
    grid: { left: 64, right: 24, top: 16, bottom: 40 },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      formatter: (p: any) => {
        const meta = p.data._meta as {
          dateMs: number;
          value: number;
          indexInSession: number;
          sessionName: string;
        };
        const unit = mode === 'dry' ? 'Hold' : 'Dive';
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
      name: MODE_Y_LABEL[mode],
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
    series: [
      {
        type: 'scatter',
        symbolSize: 9,
        // Slight transparency so overlapping dots on a busy day read as a
        // denser blob rather than a single opaque dot.
        itemStyle: { color, opacity: 0.72, borderColor: color, borderWidth: 1 },
        emphasis: { itemStyle: { opacity: 1 } },
        data: data.points.map((pt) => ({
          value: [pt.dateMs, pt.value],
          _meta: pt,
        })),
      },
    ],
  };

  // Quick summary line under the chart.
  const count = data.points.length;
  const days = new Set(data.points.map((p) => new Date(p.dateMs).toDateString())).size;
  const best = data.points.reduce((m, p) => Math.max(m, p.value), 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-panel p-3">
        <ReactECharts option={option} style={{ height: 360 }} notMerge />
      </div>
      <p className="font-mono text-[11px] text-textDim">
        {count} {mode === 'dry' ? 'hold' : 'dive'}
        {count === 1 ? '' : 's'} across {days} training day{days === 1 ? '' : 's'}
        {' · best '}
        {fmtValue(mode, best)}
      </p>
    </div>
  );
}
