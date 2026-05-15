/**
 * DiveOverlayChart — up to 3 depth-dive curves on one chart, colour-coded.
 *
 * Renders one metric at a time (depth, vertical speed, heart rate, or
 * temperature). The depth metric uses an inverted y-axis; the others
 * auto-scale. Multiple instances on the same page (e.g. depth on top,
 * heart rate underneath) sync crosshairs via the `groupId` prop.
 *
 * Two alignment modes:
 *   - 'start'    — every dive starts at t=0. Compares descent rate and
 *                  total dive time directly.
 *   - 'maxdepth' — every dive's deepest point sits at t=0; descent is
 *                  negative time, ascent positive. Compares ascent shape
 *                  and hang regardless of how deep each dive went. The
 *                  shift is always computed from the depth series so the
 *                  secondary panel (speed / HR / temp) lines up too.
 */
import { useCallback, useMemo } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type { DepthDiveData } from '../../lib/analytics/diveProfile';

export type OverlayAlign = 'start' | 'maxdepth';
export type OverlayMetric = 'depth' | 'speed' | 'hr' | 'temp';

export interface OverlayDive {
  color: string;
  /** Unique series name — drives the legend. */
  label: string;
  data: DepthDiveData;
}

interface Props {
  dives: OverlayDive[];
  align: OverlayAlign;
  metric: OverlayMetric;
  /** Chart height in px. */
  height?: number;
  /** Shared echarts.connect group id — pass the same value to any sibling
   *  charts that should share a crosshair. */
  groupId?: string;
  /** Show the dive-label legend at the top. Defaults to true. */
  showLegend?: boolean;
}

interface MetricConfig {
  pick: (data: DepthDiveData) => [number, number][];
  unit: string;
  yLabel: string;
  inverse: boolean;
  precision: number;
}

const METRIC_CONFIG: Record<OverlayMetric, MetricConfig> = {
  depth: { pick: (d) => d.depthSeries, unit: 'm',   yLabel: '{value}m',   inverse: true,  precision: 1 },
  speed: { pick: (d) => d.speedSeries, unit: 'm/s', yLabel: '{value}',    inverse: false, precision: 2 },
  hr:    { pick: (d) => d.hrSeries,    unit: 'bpm', yLabel: '{value}',    inverse: false, precision: 0 },
  temp:  { pick: (d) => d.tempSeries,  unit: '°C',  yLabel: '{value}°',   inverse: false, precision: 1 },
};

const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

export function DiveOverlayChart({
  dives,
  align,
  metric,
  height = 340,
  groupId,
  showLegend = true,
}: Props) {
  const option = useMemo(
    () => buildOption(dives, align, metric, showLegend),
    [dives, align, metric, showLegend],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      if (groupId) {
        chart.group = groupId;
        echarts.connect(groupId);
      }
    },
    [groupId],
  );

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      opts={{ renderer: 'canvas' }}
      onChartReady={handleReady}
      notMerge
    />
  );
}

/** Time of the deepest sample — the descent/ascent split point. Used for
 *  max-depth alignment regardless of which metric is being rendered. */
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

function buildOption(
  dives: OverlayDive[],
  align: OverlayAlign,
  metric: OverlayMetric,
  showLegend: boolean,
) {
  const cfg = METRIC_CONFIG[metric];

  // Shift offset comes from the depth series so a stacked secondary panel
  // lines up on the same x-axis. Picks the requested metric's series.
  const shifted = dives.map((dv) => {
    const offset = align === 'maxdepth' ? maxDepthTime(dv.data.depthSeries) : 0;
    return {
      color: dv.color,
      label: dv.label,
      series: cfg.pick(dv.data).map(
        ([t, v]) => [t - offset, v] as [number, number],
      ),
    };
  });

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  for (const s of shifted) {
    for (const [t, v] of s.series) {
      if (t < xMin) xMin = t;
      if (t > xMax) xMax = t;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = 0;
    xMax = 0;
  }

  return {
    grid: {
      left: 56,
      right: 16,
      top: showLegend ? 36 : 12,
      bottom: 28,
    },
    animation: false,
    axisPointer: {
      link: AXIS_POINTER_LINK,
      lineStyle: { color: '#4fc3f7', opacity: 0.4 },
    },
    legend: showLegend
      ? {
          top: 0,
          textStyle: { color: '#9a9a9e', fontFamily: 'Inter, system-ui', fontSize: 12 },
          itemWidth: 14,
          itemHeight: 8,
        }
      : { show: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      axisPointer: { type: 'line' as const },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        const head = `t=${fmtSigned(arr[0]?.value?.[0] ?? 0)}`;
        const lines = arr
          .filter((p: any) => p.value && p.value[1] != null)
          .map(
            (p: any) =>
              `<span style="color:${p.color}">●</span> ${p.seriesName}: ${(
                p.value[1] as number
              ).toFixed(cfg.precision)} ${cfg.unit}`,
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
    yAxis: cfg.inverse
      ? {
          type: 'value',
          inverse: true,
          min: 0,
          max: Math.ceil(yMax * 1.05) || 1,
          axisLabel: { color: '#9a9a9e', fontSize: 10, formatter: cfg.yLabel },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#1a1a1a' } },
        }
      : {
          type: 'value',
          scale: true,
          axisLabel: { color: '#9a9a9e', fontSize: 10, formatter: cfg.yLabel },
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
