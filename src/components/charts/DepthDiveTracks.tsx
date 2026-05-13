/**
 * DepthDiveTracks — synchronized multi-track timeline for a single depth
 * dive. Stacked ECharts instances sharing one time axis and a linked
 * crosshair so scrubbing one track scrubs them all.
 *
 * Visible tracks (in order):
 *   1. DEPTH      — always shown. Inverted (deeper = lower), hang segments
 *                   shaded, contraction marker (if recorded), depth alarms.
 *   2. HEART RATE — only when the profile has ≥2 HR points.
 *   3. SPEED      — only when the profile has ≥2 speed points.
 *   4. TEMP       — only when the profile has ≥2 temp points.
 *
 * Cross-chart crosshair sync uses ECharts' `echarts.connect(groupId)`. We
 * set `chart.group` on each instance via onChartReady and call connect
 * once — from then on, scrubbing any track moves the cursor on all of them.
 */
import { useCallback, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type {
  ContractionOnset,
  DepthDiveData,
  HangSegment,
} from '../../lib/analytics/diveProfile';

interface AlarmLite {
  type: 'depth' | 'time' | 'speed';
  depth?: number | null;
  time?: number | null;
  speed?: number | null;
  enabled?: boolean;
}

interface Props {
  data: DepthDiveData;
  contractionOnset?: ContractionOnset | null;
  alarms?: AlarmLite[];
  /** Unique chart-group id (stable across re-renders for the same dive). */
  groupId: string;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

export function DepthDiveTracks({ data, contractionOnset, alarms, groupId }: Props) {
  const depthOption = useMemo(
    () => buildDepthOption(data, contractionOnset ?? null, alarms ?? []),
    [data, contractionOnset, alarms],
  );
  const hrOption = useMemo(
    () => buildLineOption(data.hrSeries, '#ff5f9e', 'bpm', data.startT, data.endT),
    [data],
  );
  const speedOption = useMemo(
    () => buildLineOption(data.speedSeries, '#ffa726', 'm/s', data.startT, data.endT, { allowNegative: true }),
    [data],
  );
  const tempOption = useMemo(
    () => buildLineOption(data.tempSeries, '#66bb6a', '°C', data.startT, data.endT),
    [data],
  );

  // Track how many chart instances have mounted; once all of them have a
  // group set, call connect() so the crosshair starts syncing. connect()
  // is idempotent so calling it on every mount is also fine.
  const mountedRef = useRef(0);
  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      mountedRef.current += 1;
      echarts.connect(groupId);
    },
    [groupId],
  );

  return (
    <div className="space-y-4">
      <TrackHeader label="Depth" unit="m" />
      <ReactECharts
        option={depthOption}
        style={{ height: 260 }}
        opts={{ renderer: 'canvas' }}
        onChartReady={handleReady}
        notMerge
      />

      {data.hasHR && (
        <>
          <TrackHeader label="Heart Rate" unit="bpm" />
          <ReactECharts
            option={hrOption}
            style={{ height: 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {data.hasSpeed && (
        <>
          <TrackHeader label="Vertical Speed" unit="m/s" hint="negative = descending" />
          <ReactECharts
            option={speedOption}
            style={{ height: 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {data.hasTemp && (
        <>
          <TrackHeader label="Temperature" unit="°C" />
          <ReactECharts
            option={tempOption}
            style={{ height: 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
    </div>
  );
}

function TrackHeader({ label, unit, hint }: { label: string; unit: string; hint?: string }) {
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

// ─── Option builders ────────────────────────────────────────────────────────

function buildDepthOption(
  data: DepthDiveData,
  contractionOnset: ContractionOnset | null,
  alarms: AlarmLite[],
) {
  const hangBands = (data.hangs as HangSegment[]).map((h) => ({
    startT: h.startT,
    endT: h.endT,
    color: h.type === 'bottom' ? 'rgba(79, 195, 247, 0.12)' : 'rgba(255, 167, 38, 0.10)',
    name: h.type === 'bottom' ? 'Bottom hang' : 'Off-bottom hang',
  }));

  // Depth-alarm threshold lines. Time/speed alarms render on their own
  // tracks (separate option builders).
  const alarmLines = alarms
    .filter((a) => a.enabled !== false && a.type === 'depth' && a.depth != null && a.depth > 0)
    .map((a) => ({
      yAxis: a.depth as number,
      label: {
        formatter: `${a.depth}m alarm`,
        position: 'insideStartTop' as const,
        color: '#ef5350',
        fontSize: 10,
      },
      lineStyle: { color: '#ef5350', type: 'dashed' as const, width: 1 },
    }));

  // Contraction marker — we have only the depth, not the timestamp. Locate
  // the first profile crossing of that depth in the matching direction
  // (descent → first crossing while depth is still increasing; ascent →
  // first crossing while depth is decreasing again).
  let contractionMarker: any = null;
  if (contractionOnset && data.depthSeries.length > 1) {
    const target = contractionOnset.depth;
    const isAscent = contractionOnset.direction === 'up';
    for (let i = 1; i < data.depthSeries.length; i++) {
      const [, d] = data.depthSeries[i];
      const [, dPrev] = data.depthSeries[i - 1];
      const downCross = dPrev < target && d >= target;
      const upCross = dPrev > target && d <= target;
      if ((!isAscent && downCross) || (isAscent && upCross)) {
        contractionMarker = {
          coord: [data.depthSeries[i][0], data.depthSeries[i][1]],
          symbol: 'diamond',
          symbolSize: 12,
          itemStyle: { color: '#ef5350' },
          label: {
            formatter: 'First contraction',
            position: 'top',
            color: '#ef5350',
            fontSize: 10,
          },
        };
        break;
      }
    }
  }

  return {
    grid: GRID,
    animation: false,
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color: '#4fc3f7', opacity: 0.4 } },
    tooltip: {
      ...baseTooltip(),
      trigger: 'axis',
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const [t, d] = p.value as [number, number];
        return `t=${fmtSec(t)}<br/>${d.toFixed(1)} m`;
      },
    },
    xAxis: {
      type: 'value',
      min: data.startT,
      max: data.endT,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: '#9a9a9e', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262626' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      max: Math.ceil(data.maxDepth * 1.05),
      axisLabel: { color: '#9a9a9e', fontSize: 10, formatter: '{value}m' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
    },
    series: [
      {
        name: 'Depth',
        type: 'line',
        data: data.depthSeries,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color: '#4fc3f7', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(79, 195, 247, 0.4)' },
              { offset: 1, color: 'rgba(79, 195, 247, 0.02)' },
            ],
          },
        },
        markArea: hangBands.length > 0
          ? {
              silent: true,
              itemStyle: { opacity: 1 },
              data: hangBands.map((b) => [
                { xAxis: b.startT, itemStyle: { color: b.color }, name: b.name },
                { xAxis: b.endT },
              ]),
            }
          : undefined,
        markLine: alarmLines.length > 0
          ? { silent: true, symbol: 'none', data: alarmLines }
          : undefined,
        markPoint: contractionMarker
          ? { data: [contractionMarker] }
          : undefined,
      },
    ],
  };
}

function buildLineOption(
  series: [number, number][],
  color: string,
  unit: string,
  startT: number,
  endT: number,
  opts: { allowNegative?: boolean } = {},
) {
  const empty = series.length < 2;
  return {
    grid: GRID,
    animation: false,
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color, opacity: 0.4 } },
    tooltip: {
      ...baseTooltip(),
      trigger: 'axis',
      formatter: (params: any) => {
        if (empty) return '';
        const p = Array.isArray(params) ? params[0] : params;
        const [t, v] = p.value as [number, number];
        return `t=${fmtSec(t)}<br/>${typeof v === 'number' ? v.toFixed(1) : v} ${unit}`;
      },
    },
    xAxis: {
      type: 'value',
      min: startT,
      max: endT,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: '#9a9a9e', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262626' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: opts.allowNegative ? undefined : 0,
      axisLabel: { color: '#9a9a9e', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
    },
    series: [
      {
        type: 'line',
        data: series,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color, width: 1.5 },
      },
    ],
  };
}

function baseTooltip() {
  return {
    backgroundColor: '#101010',
    borderColor: '#262626',
    textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
    axisPointer: { type: 'line' as const },
  };
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
