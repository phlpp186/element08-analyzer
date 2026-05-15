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
import type { DepthDiveData, ProfilePoint } from '../../lib/analytics/diveProfile';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';

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
  /** When metric === 'depth', mark each dive at every Nth-metre depth
   *  crossing on descent and ascent with its vertical speed. 0 = off. */
  speedStep?: number;
  /** When metric === 'speed', apply an N-sample centred moving average to
   *  each dive's speed series. 0 = raw. FIM hand-cycle oscillates hard. */
  speedSmooth?: number;
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
  speedStep = 0,
  speedSmooth = 0,
}: Props) {
  const ct = useChartTheme();
  const option = useMemo(
    () => buildOption(dives, align, metric, showLegend, speedStep, speedSmooth, ct),
    [dives, align, metric, showLegend, speedStep, speedSmooth, ct],
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
  speedStep: number,
  speedSmooth: number,
  ct: ChartTheme,
) {
  const cfg = METRIC_CONFIG[metric];
  const applySmoothing = metric === 'speed' && speedSmooth > 1;
  const applyMarkers = metric === 'depth' && speedStep > 0;

  // Shift offset comes from the depth series so a stacked secondary panel
  // lines up on the same x-axis. Picks the requested metric's series and
  // optionally smooths it (speed) / attaches per-dive markers (depth).
  const shifted = dives.map((dv) => {
    const offset = align === 'maxdepth' ? maxDepthTime(dv.data.depthSeries) : 0;
    const raw = cfg.pick(dv.data).map(
      ([t, v]) => [t - offset, v] as [number, number],
    );
    const series = applySmoothing ? smoothSeries(raw, speedSmooth) : raw;
    const markPointData = applyMarkers
      ? buildOverlaySpeedMarkers(dv.data.points, speedStep, offset, dv.color)
      : [];
    return { color: dv.color, label: dv.label, series, markPointData };
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
          textStyle: { color: ct.textDim, fontFamily: 'Inter, system-ui', fontSize: 12 },
          itemWidth: 14,
          itemHeight: 8,
        }
      : { show: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui', fontSize: 12 },
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
      axisLabel: { formatter: (v: number) => fmtSigned(v), color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: cfg.inverse
      ? {
          type: 'value',
          inverse: true,
          min: 0,
          max: Math.ceil(yMax * 1.05) || 1,
          axisLabel: { color: ct.textDim, fontSize: 10, formatter: cfg.yLabel },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: ct.splitLine } },
        }
      : {
          type: 'value',
          scale: true,
          axisLabel: { color: ct.textDim, fontSize: 10, formatter: cfg.yLabel },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: ct.splitLine } },
        },
    series: shifted.map((s) => ({
      name: s.label,
      type: 'line',
      data: s.series,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      markPoint:
        s.markPointData.length > 0 ? { data: s.markPointData } : undefined,
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

/** Vertical-speed readouts at each step-metre depth crossing for one dive.
 *  Coords are pre-shifted by `offset` so the markers sit on the aligned
 *  curve. Descent markers label to the right, ascent to the left so the
 *  pairs don't collide at the bottom of the V. */
function buildOverlaySpeedMarkers(
  points: ProfilePoint[],
  step: number,
  offset: number,
  color: string,
): unknown[] {
  if (step <= 0 || points.length < 2) return [];
  const maxDepth = points.reduce((m, p) => Math.max(m, p.d), 0);
  let splitT = points[0].t;
  let bestD = -Infinity;
  for (const p of points) {
    if (p.d > bestD) {
      bestD = p.d;
      splitT = p.t;
    }
  }
  const markers: unknown[] = [];
  for (let threshold = step; threshold < maxDepth; threshold += step) {
    // Descent — first downward crossing in the descent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t > splitT) break;
      if (points[i - 1].d < threshold && points[i].d >= threshold) {
        pushMarker(markers, points[i], offset, color, 'right');
        break;
      }
    }
    // Ascent — first upward crossing in the ascent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t < splitT) continue;
      if (points[i - 1].d > threshold && points[i].d <= threshold) {
        pushMarker(markers, points[i], offset, color, 'left');
        break;
      }
    }
  }
  return markers;
}

function pushMarker(
  markers: unknown[],
  p: ProfilePoint,
  offset: number,
  color: string,
  position: 'left' | 'right',
) {
  if (p.v == null) return;
  markers.push({
    coord: [p.t - offset, p.d],
    symbol: 'circle',
    symbolSize: 4,
    itemStyle: { color },
    label: {
      show: true,
      formatter: `${Math.abs(p.v).toFixed(1)}`,
      position,
      color,
      fontSize: 9,
    },
  });
}

/** Centred N-sample moving average. Returns the series unchanged when the
 *  window is too small to do anything. */
function smoothSeries(
  series: [number, number][],
  window: number,
): [number, number][] {
  if (window <= 1 || series.length < 3) return series;
  const half = Math.floor(window / 2);
  const out: [number, number][] = [];
  for (let i = 0; i < series.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(series.length - 1, i + half); j++) {
      sum += series[j][1];
      count++;
    }
    out.push([series[i][0], sum / count]);
  }
  return out;
}
