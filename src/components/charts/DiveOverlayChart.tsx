/**
 * DiveOverlayChart — up to 3 depth profiles drawn on one inverted-depth
 * chart, one colour per dive.
 *
 * Two alignment modes:
 *   - 'start'    — every dive starts at t=0. Compares descent rate and
 *                  total dive time directly.
 *   - 'maxdepth' — every dive's deepest point sits at t=0; descent is
 *                  negative time, ascent positive. Compares ascent shape
 *                  and hang regardless of how deep each dive went.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DepthDiveData } from '../../lib/analytics/diveProfile';

export type OverlayAlign = 'start' | 'maxdepth';

export interface OverlayDive {
  color: string;
  /** Unique series name — drives the legend. */
  label: string;
  data: DepthDiveData;
}

interface Props {
  dives: OverlayDive[];
  align: OverlayAlign;
}

const GRID = { left: 56, right: 16, top: 36, bottom: 28 };

export function DiveOverlayChart({ dives, align }: Props) {
  const option = useMemo(() => buildOption(dives, align), [dives, align]);
  return (
    <ReactECharts
      option={option}
      style={{ height: 420 }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}

/** Time of the deepest sample — the descent/ascent split point. */
function maxDepthTime(series: [number, number][]): number {
  let bestT = series.length > 0 ? series[0][0] : 0;
  let bestD = -Infinity;
  for (const [t, d] of series) {
    if (d > bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return bestT;
}

function buildOption(dives: OverlayDive[], align: OverlayAlign) {
  // Shift each dive's series per the alignment mode: start-aligned keeps
  // raw time; max-depth-aligned re-zeroes on the deepest sample.
  const shifted = dives.map((dv) => {
    const offset = align === 'maxdepth' ? maxDepthTime(dv.data.depthSeries) : 0;
    return {
      color: dv.color,
      label: dv.label,
      series: dv.data.depthSeries.map(
        ([t, d]) => [t - offset, d] as [number, number],
      ),
    };
  });

  let xMin = Infinity;
  let xMax = -Infinity;
  let maxDepth = 0;
  for (const s of shifted) {
    for (const [t, d] of s.series) {
      if (t < xMin) xMin = t;
      if (t > xMax) xMax = t;
      if (d > maxDepth) maxDepth = d;
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = 0;
    xMax = 0;
  }

  return {
    grid: GRID,
    animation: false,
    legend: {
      top: 0,
      textStyle: { color: '#9a9a9e', fontFamily: 'Inter, system-ui', fontSize: 12 },
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      axisPointer: { type: 'line' as const },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        const head = `t=${fmtSigned(arr[0]?.value?.[0] ?? 0)}`;
        const lines = arr.map(
          (p: any) =>
            `<span style="color:${p.color}">●</span> ${p.seriesName}: ${(
              p.value[1] as number
            ).toFixed(1)} m`,
        );
        return [head, ...lines].join('<br/>');
      },
    },
    xAxis: {
      type: 'value',
      min: xMin,
      max: xMax,
      axisLabel: { formatter: (v: number) => fmtSigned(v), color: '#9a9a9e', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262626' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      max: Math.ceil(maxDepth * 1.05) || 1,
      axisLabel: { color: '#9a9a9e', fontSize: 10, formatter: '{value}m' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
    },
    series: shifted.map((s) => ({
      name: s.label,
      type: 'line',
      data: s.series,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
    })),
  };
}

/** Signed m:ss / s formatter — x-axis carries negative time when the
 *  overlay is max-depth-aligned. */
function fmtSigned(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(Math.round(s));
  if (abs < 60) return `${sign}${abs}s`;
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}
