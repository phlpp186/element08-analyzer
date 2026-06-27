/**
 * DepthDiveTracks — synchronized multi-track timeline for a single depth
 * dive. Stacked ECharts instances sharing one time axis and a linked
 * crosshair so scrubbing one track scrubs them all.
 *
 * Visible tracks (in order):
 *   1. DEPTH      — always shown. Inverted (deeper = lower), hang segments
 *                   shaded, contraction marker, depth alarms, speed marks.
 *   2. HEART RATE — only when the profile has ≥2 HR points.
 *   3. SPEED      — only when the profile has ≥2 speed points. Optional
 *                   moving-average smoothing draws a bold smoothed line
 *                   over the faint raw curve (FIM dives oscillate hard).
 *   4. TEMP       — only when the profile has ≥2 temp points.
 *
 * Depth-track overlays the caller can toggle:
 *   - Depth alarms: each enabled depth alarm renders as a dot on the
 *     depth curve where the dive crosses the alarm depth — amber on the
 *     descent crossing, red on the ascent crossing. Descent-only and
 *     ascent-only alarms draw a single dot; both-direction alarms draw
 *     both.
 *   - Speed markers: vertical speed read out at each 5 m / 10 m depth
 *     crossing on both descent and ascent, labelled on the depth curve.
 *
 * Cross-chart crosshair sync uses ECharts' `echarts.connect(groupId)`.
 */
import { useCallback, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type {
  ContractionOnset,
  DepthDiveData,
  HangSegment,
  ProfilePoint,
} from '../../lib/analytics/diveProfile';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';
import { useT, useLangValue } from '../../i18n';

type TFn = (s: string) => string;

interface AlarmLite {
  type: 'depth' | 'time' | 'speed';
  depth?: number | null;
  time?: number | null;
  speed?: number | null;
  enabled?: boolean;
  triggerOnDescent?: boolean;
  triggerOnAscent?: boolean;
}

interface Props {
  data: DepthDiveData;
  contractionOnset?: ContractionOnset | null;
  alarms?: AlarmLite[];
  /** Show depth-alarm threshold segments on the depth track. */
  showAlarms: boolean;
  /** Speed-marker interval in metres: 0 = off, else 5 or 10. */
  speedStep: number;
  /** Vertical-speed smoothing window in samples: 0 = raw only, else an
   *  N-sample centred moving average drawn over the faint raw curve. */
  speedSmooth: number;
  /** Unique chart-group id (stable across re-renders for the same dive). */
  groupId: string;
  /** When set, hang bands become clickable and this fires with the band
   *  index + the click's viewport coords (for popover anchoring). */
  onHangClick?: (hangIdx: number, clientX: number, clientY: number) => void;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

const DESCENT_COLOR = '#ffa726'; // amber — going down
const ASCENT_COLOR = '#ef5350'; // red — coming up

export function DepthDiveTracks({
  data,
  contractionOnset,
  alarms,
  showAlarms,
  speedStep,
  speedSmooth,
  groupId,
  onHangClick,
}: Props) {
  const ct = useChartTheme();
  const t = useT();
  const lang = useLangValue();
  const hangsClickable = !!onHangClick;
  const depthOption = useMemo(
    () =>
      buildDepthOption(
        data,
        contractionOnset ?? null,
        alarms ?? [],
        showAlarms,
        speedStep,
        ct,
        hangsClickable,
        t,
      ),
    [data, contractionOnset, alarms, showAlarms, speedStep, ct, hangsClickable, lang],
  );
  const depthEvents = useMemo(
    () =>
      onHangClick
        ? {
            click: (params: any) => {
              if (params?.componentType !== 'markArea') return;
              const idx = typeof params.dataIndex === 'number' ? params.dataIndex : 0;
              const raw = params.event?.event;
              const x = raw?.clientX ?? params.event?.offsetX ?? 0;
              const y = raw?.clientY ?? params.event?.offsetY ?? 0;
              onHangClick(idx, x, y);
            },
          }
        : undefined,
    [onHangClick],
  );
  const hrOption = useMemo(
    () => buildLineOption(data.hrSeries, '#ff5f9e', 'bpm', data.startT, data.endT, ct),
    [data, ct],
  );
  const speedOption = useMemo(
    () =>
      buildLineOption(data.speedSeries, '#ffa726', 'm/s', data.startT, data.endT, ct, {
        allowNegative: true,
        smoothWindow: speedSmooth,
      }),
    [data, speedSmooth, ct],
  );
  const tempOption = useMemo(
    () => buildLineOption(data.tempSeries, '#66bb6a', '°C', data.startT, data.endT, ct),
    [data, ct],
  );

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
      <TrackHeader label={t('Depth')} unit="m" />
      <ReactECharts
        option={depthOption}
        style={{ height: 260 }}
        opts={{ renderer: 'canvas' }}
        onChartReady={handleReady}
        onEvents={depthEvents}
        notMerge
      />

      {data.hasHR && (
        <>
          <TrackHeader label={t('Heart Rate')} unit="bpm" />
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
          <TrackHeader label={t('Vertical Speed')} unit="m/s" hint={t('negative = descending')} />
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
          <TrackHeader label={t('Temperature')} unit="°C" />
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

/** Directional alarm dots. Each enabled depth alarm gets a dot on the
 *  depth curve where the dive crosses the alarm depth — amber on the
 *  descent crossing, red on the ascent crossing. Descent-only and
 *  ascent-only alarms draw one dot; both-direction alarms draw both. */
function buildAlarmMarkers(
  alarms: AlarmLite[],
  series: [number, number][],
  splitT: number,
  ct: ChartTheme,
) {
  if (series.length < 2) return [];
  const markers: any[] = [];
  for (const a of alarms) {
    if (a.enabled === false || a.type !== 'depth' || a.depth == null || a.depth <= 0) {
      continue;
    }
    const d = a.depth;
    // Flags absent on both → treat as a both-direction alarm rather than
    // silently dropping it.
    const both = !a.triggerOnDescent && !a.triggerOnAscent;
    const showDescent = both || !!a.triggerOnDescent;
    const showAscent = both || !!a.triggerOnAscent;

    if (showDescent) {
      for (let i = 1; i < series.length; i++) {
        if (series[i][0] > splitT) break;
        if (series[i - 1][1] < d && series[i][1] >= d) {
          markers.push(alarmDot(series[i][0], d, DESCENT_COLOR, 'top', ct));
          break;
        }
      }
    }
    if (showAscent) {
      for (let i = 1; i < series.length; i++) {
        if (series[i][0] < splitT) continue;
        if (series[i - 1][1] > d && series[i][1] <= d) {
          markers.push(alarmDot(series[i][0], d, ASCENT_COLOR, 'bottom', ct));
          break;
        }
      }
    }
  }
  return markers;
}

function alarmDot(t: number, d: number, color: string, position: 'top' | 'bottom', ct: ChartTheme) {
  return {
    coord: [t, d],
    symbol: 'circle',
    symbolSize: 7,
    itemStyle: { color, borderColor: ct.tooltipBg, borderWidth: 1 },
    label: {
      show: true,
      formatter: `${d}m`,
      position,
      color,
      fontSize: 9,
    },
  };
}

/** Vertical-speed readouts at each `step`-metre depth crossing, on both
 *  the descent and the ascent. */
function buildSpeedMarkers(points: ProfilePoint[], step: number, splitT: number) {
  if (step <= 0 || points.length < 2) return [];
  const maxDepth = points.reduce((m, p) => Math.max(m, p.d), 0);
  const markers: any[] = [];
  for (let threshold = step; threshold < maxDepth; threshold += step) {
    // Descent — first downward crossing in the descent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t > splitT) break;
      if (points[i - 1].d < threshold && points[i].d >= threshold) {
        pushSpeedMarker(markers, points[i], DESCENT_COLOR, 'right');
        break;
      }
    }
    // Ascent — first upward crossing in the ascent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t < splitT) continue;
      if (points[i - 1].d > threshold && points[i].d <= threshold) {
        pushSpeedMarker(markers, points[i], ASCENT_COLOR, 'left');
        break;
      }
    }
  }
  return markers;
}

function pushSpeedMarker(
  markers: any[],
  p: ProfilePoint,
  color: string,
  position: 'left' | 'right',
) {
  if (p.v == null) return;
  markers.push({
    coord: [p.t, p.d],
    symbol: 'circle',
    symbolSize: 3,
    itemStyle: { color },
    label: {
      show: true,
      formatter: `${Math.abs(p.v).toFixed(1)}`,
      position,
      color,
      fontSize: 11,
    },
  });
}

function buildDepthOption(
  data: DepthDiveData,
  contractionOnset: ContractionOnset | null,
  alarms: AlarmLite[],
  showAlarms: boolean,
  speedStep: number,
  ct: ChartTheme,
  hangsClickable: boolean,
  t: TFn,
) {
  const hangBands = (data.hangs as HangSegment[]).map((h) => ({
    startT: h.startT,
    endT: h.endT,
    color: h.type === 'bottom' ? 'rgba(79, 195, 247, 0.12)' : 'rgba(255, 167, 38, 0.10)',
    name: h.type === 'bottom' ? t('Bottom hang') : t('Off-bottom hang'),
  }));

  const splitT = maxDepthTime(data.depthSeries);

  const alarmMarkers = showAlarms
    ? buildAlarmMarkers(alarms, data.depthSeries, splitT, ct)
    : [];

  const speedMarkers = buildSpeedMarkers(data.points, speedStep, splitT);

  // Contraction marker — we have only the depth, not the timestamp.
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
            formatter: t('First contraction'),
            position: 'top',
            color: '#ef5350',
            fontSize: 10,
          },
        };
        break;
      }
    }
  }

  // Merge contraction + alarm + speed markers into one markPoint array.
  const markPointData = [
    ...(contractionMarker ? [contractionMarker] : []),
    ...alarmMarkers,
    ...speedMarkers,
  ];

  return {
    grid: GRID,
    animation: false,
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color: '#4fc3f7', opacity: 0.4 } },
    tooltip: {
      ...baseTooltip(ct),
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
      axisLabel: { formatter: (v: number) => fmtSec(v), color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      max: Math.ceil(data.maxDepth * 1.05),
      axisLabel: { color: ct.textDim, fontSize: 10, formatter: '{value}m' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        name: t('Depth'),
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
              // Clickable when the caller registered onHangClick — needed
              // for the manual hang-editor popover. Otherwise stays silent.
              silent: !hangsClickable,
              itemStyle: { opacity: 1 },
              // insideTop keeps the label within the grid — the default
              // 'top' straddles the grid edge and clips the text.
              label: {
                show: true,
                position: 'insideTop',
                color: ct.textDim,
                fontSize: 10,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              },
              data: hangBands.map((b) => [
                { xAxis: b.startT, itemStyle: { color: b.color }, name: b.name },
                { xAxis: b.endT },
              ]),
            }
          : undefined,
        markPoint: markPointData.length > 0
          ? { data: markPointData }
          : undefined,
      },
    ],
  };
}

/** Centred N-sample moving average. Returns the series unchanged when the
 *  window is too small to do anything. */
function smoothSeries(series: [number, number][], window: number): [number, number][] {
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

function buildLineOption(
  series: [number, number][],
  color: string,
  unit: string,
  startT: number,
  endT: number,
  ct: ChartTheme,
  opts: { allowNegative?: boolean; smoothWindow?: number } = {},
) {
  const empty = series.length < 2;
  const smoothed =
    opts.smoothWindow && opts.smoothWindow > 1
      ? smoothSeries(series, opts.smoothWindow)
      : null;

  // When smoothing is on, the raw curve drops to a faint underlay and the
  // bold line is the moving average. The tooltip then reports the smoothed
  // value (last series) rather than the noisy raw one.
  const lineSeries = smoothed
    ? [
        {
          type: 'line',
          data: series,
          showSymbol: false,
          smooth: 0.2,
          silent: true,
          lineStyle: { color, width: 1, opacity: 0.25 },
        },
        {
          type: 'line',
          data: smoothed,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { color, width: 2 },
        },
      ]
    : [
        {
          type: 'line',
          data: series,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { color, width: 1.5 },
        },
      ];

  return {
    grid: GRID,
    animation: false,
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color, opacity: 0.4 } },
    tooltip: {
      ...baseTooltip(ct),
      trigger: 'axis',
      formatter: (params: any) => {
        if (empty) return '';
        const arr = Array.isArray(params) ? params : [params];
        const p = arr[arr.length - 1];
        const [t, v] = p.value as [number, number];
        return `t=${fmtSec(t)}<br/>${typeof v === 'number' ? v.toFixed(1) : v} ${unit}`;
      },
    },
    xAxis: {
      type: 'value',
      min: startT,
      max: endT,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: opts.allowNegative ? undefined : 0,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: lineSeries,
  };
}

function baseTooltip(ct: ChartTheme) {
  return {
    backgroundColor: ct.tooltipBg,
    borderColor: ct.axisLine,
    textStyle: { color: ct.text, fontFamily: 'Inter, system-ui', fontSize: 12 },
    axisPointer: { type: 'line' as const },
  };
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
