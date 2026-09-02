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
 *
 * MEASURE A→B. Turn it on and drag across the depth track to select a stretch
 * of the dive; the panel underneath reports how deep, how long and how fast.
 * The selection is an ECharts `lineX` brush, so the drag, the shaded band and
 * the resize handles come from the chart rather than from hand-rolled pointer
 * maths — which matters because a PanResponder-style drag on top of a chart is
 * exactly the kind of thing that starts eating the clicks underneath it. Hang
 * bands stay clickable while measuring is OFF; the brush owns the drag while
 * it is on. The numbers all come from lib/analytics/rangeStats, shared with
 * the coach portal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type {
  ContractionOnset,
  DepthDiveData,
  HangSegment,
  ProfilePoint,
} from '../../lib/analytics/diveProfile';
import { useChartTheme, withAlpha, type ChartTheme } from '../../lib/chartTheme';
import { useT, useLangValue } from '../../i18n';
import { rangeStats } from '../../lib/analytics/rangeStats';
import { RangeReadout } from '../RangeReadout';

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
  /** Render just ONE track (fullscreen single-metric view). */
  solo?: 'depth' | 'hr' | 'speed' | 'temp';
  /** Chart height override in px (used by the fullscreen view). */
  chartHeight?: number;
  /** Speed track x-axis: over time (default) or over depth. Over depth
   *  splits the dive at its deepest point into a descent and an ascent
   *  branch (|v| vs depth), which is how coaches read pacing. */
  speedAxis?: 'time' | 'depth';
  /** Over-depth layout: mirrored butterfly (default) or both branches
   *  overlaid on the same positive axis for direct comparison. */
  speedDepthOverlay?: boolean;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

export function DepthDiveTracks({
  data,
  contractionOnset,
  alarms,
  showAlarms,
  speedStep,
  speedSmooth,
  groupId,
  onHangClick,
  solo,
  chartHeight,
  speedAxis = 'time',
  speedDepthOverlay = false,
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
    () => ({
      ...(onHangClick
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
        : {}),
      // brushEnd, not brushSelected: the latter fires continuously through the
      // drag and would recompute the panel on every pixel.
      brushEnd: (params: any) => {
        const area = params?.areas?.[0];
        const cr = area?.coordRange;
        if (!Array.isArray(cr) || cr.length !== 2) {
          setRange(null);
          return;
        }
        setRange([cr[0], cr[1]]);
      },
    }),
    [onHangClick],
  );
  const hrOption = useMemo(
    () => buildLineOption(data.hrSeries, ct.highlight, 'bpm', data.startT, data.endT, ct),
    [data, ct],
  );
  const speedOption = useMemo(
    () =>
      buildLineOption(data.speedSeries, ct.amber, 'm/s', data.startT, data.endT, ct, {
        allowNegative: true,
        smoothWindow: speedSmooth,
        // ±1 m/s: the reference descent/ascent speeds freedivers train around.
        refLines: [1, -1],
      }),
    [data, speedSmooth, ct],
  );
  const tempOption = useMemo(
    () => buildLineOption(data.tempSeries, ct.green, '°C', data.startT, data.endT, ct),
    [data, ct],
  );
  const speedByDepthOption = useMemo(
    () => buildSpeedByDepthOption(data, speedSmooth, ct, t, speedDepthOverlay),
    [data, speedSmooth, ct, lang, speedDepthOverlay],
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

  // ── Measure A→B ──────────────────────────────────────────────────────────
  const [measuring, setMeasuring] = useState(false);
  const [range, setRange] = useState<[number, number] | null>(null);
  const depthChartRef = useRef<any>(null);

  const handleDepthReady = useCallback(
    (chart: any) => {
      depthChartRef.current = chart;
      handleReady(chart);
    },
    [handleReady],
  );

  // takeGlobalCursor is what actually arms the brush; the `brush` block in the
  // option only describes what a brush WOULD look like. Disarming also clears
  // any band already drawn, so the chart never keeps a selection the panel is
  // no longer showing.
  useEffect(() => {
    const chart = depthChartRef.current;
    if (!chart?.dispatchAction) return;
    if (measuring) {
      chart.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      });
    } else {
      // `brushType: false` is how the cursor is released. Passing null here
      // throws inside ECharts ("Cannot read properties of null (reading
      // 'brushType')") and takes the whole page down on mount, because this
      // effect runs once with measuring already false.
      chart.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: false },
      });
      chart.dispatchAction({ type: 'brush', areas: [] });
    }
  }, [measuring]);

  // A new dive in the same mounted component must not keep the old dive's
  // selection: the seconds would still be valid and the numbers nonsense.
  useEffect(() => {
    setRange(null);
  }, [data]);

  const clearRange = useCallback(() => {
    setRange(null);
    depthChartRef.current?.dispatchAction?.({ type: 'brush', areas: [] });
  }, []);

  const rangeResult = useMemo(
    () => (range ? rangeStats(data.points, range[0], range[1]) : null),
    [range, data.points],
  );

  const show = (track: 'depth' | 'hr' | 'speed' | 'temp') => !solo || solo === track;

  return (
    // Capped + centred so the graphs read at a comfortable width instead of
    // stretching across the page (speed-by-depth especially).
    <div className="mx-auto max-w-[840px] space-y-4">
      {show('depth') && (
        <>
          <div className="flex items-baseline gap-3">
            <TrackHeader label={t('Depth')} unit="m" />
            <button
              onClick={() => {
                if (measuring) clearRange();
                setMeasuring((m) => !m);
              }}
              title={t('Drag across the profile to measure a stretch of the dive')}
              className={`ml-auto rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                measuring
                  ? 'border-accent text-accent'
                  : 'border-border text-textDim hover:border-accent hover:text-accent'
              }`}
            >
              ⇤⇥ {t('Measure A→B')}
            </button>
          </div>
          <ReactECharts
            option={depthOption}
            style={{ height: chartHeight ?? 260 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleDepthReady}
            onEvents={depthEvents}
            notMerge
          />
          {measuring && !rangeResult && (
            <p className="px-1 font-mono text-[10px] uppercase tracking-widest text-textDim opacity-70">
              {t('Drag across the profile')}
            </p>
          )}
          {rangeResult && (
            <RangeReadout
              stats={rangeResult}
              t={t}
              onClear={() => {
                clearRange();
                setMeasuring(false);
              }}
            />
          )}
        </>
      )}

      {show('hr') && data.hasHR && (
        <>
          <TrackHeader label={t('Heart Rate')} unit="bpm" />
          <ReactECharts
            option={hrOption}
            style={{ height: chartHeight ?? 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {show('speed') && data.hasSpeed && speedAxis === 'time' && (
        <>
          <TrackHeader label={t('Vertical Speed')} unit="m/s" hint={t('negative = descending')} />
          <ReactECharts
            option={speedOption}
            style={{ height: chartHeight ?? 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {show('speed') && data.hasSpeed && speedAxis === 'depth' && (
        <>
          <TrackHeader label={t('Speed by depth')} unit="m/s" hint={t('descent and ascent as separate branches')} />
          {/* Depth runs down the y-axis here (profile orientation), so this
              chart deliberately stays OUT of the shared time-crosshair group
              and gets a taller default than the time-based tracks. */}
          <ReactECharts
            option={speedByDepthOption}
            style={{ height: chartHeight ?? 340 }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
        </>
      )}

      {show('temp') && data.hasTemp && (
        <>
          <TrackHeader label={t('Temperature')} unit="°C" />
          <ReactECharts
            option={tempOption}
            style={{ height: chartHeight ?? 140 }}
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

/** Value of a time-ordered [t, v][] series at (or nearest to) time `tm`.
 *  Returns null for an empty series. Used to read speed/HR into the depth
 *  tooltip. */
function valueAtTime(series: [number, number][], tm: number): number | null {
  if (series.length === 0) return null;
  if (tm <= series[0][0]) return series[0][1];
  const last = series[series.length - 1];
  if (tm >= last[0]) return last[1];
  for (let i = 1; i < series.length; i++) {
    if (series[i][0] >= tm) {
      const [t0, v0] = series[i - 1];
      const [t1, v1] = series[i];
      const span = t1 - t0;
      return span > 0 ? v0 + ((v1 - v0) * (tm - t0)) / span : v1;
    }
  }
  return last[1];
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
          markers.push(alarmDot(series[i][0], d, ct.amber, 'top', ct));
          break;
        }
      }
    }
    if (showAscent) {
      for (let i = 1; i < series.length; i++) {
        if (series[i][0] < splitT) continue;
        if (series[i - 1][1] > d && series[i][1] <= d) {
          markers.push(alarmDot(series[i][0], d, ct.red, 'bottom', ct));
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
function buildSpeedMarkers(points: ProfilePoint[], step: number, splitT: number, ct: ChartTheme) {
  if (step <= 0 || points.length < 2) return [];
  const maxDepth = points.reduce((m, p) => Math.max(m, p.d), 0);
  const markers: any[] = [];
  for (let threshold = step; threshold < maxDepth; threshold += step) {
    // Descent — first downward crossing in the descent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t > splitT) break;
      if (points[i - 1].d < threshold && points[i].d >= threshold) {
        pushSpeedMarker(markers, points[i], ct.amber, 'right');
        break;
      }
    }
    // Ascent — first upward crossing in the ascent phase.
    for (let i = 1; i < points.length; i++) {
      if (points[i].t < splitT) continue;
      if (points[i - 1].d > threshold && points[i].d <= threshold) {
        pushSpeedMarker(markers, points[i], ct.red, 'left');
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
    color: h.type === 'bottom' ? withAlpha(ct.accent, 0.12) : withAlpha(ct.amber, 0.10),
    name: h.type === 'bottom' ? t('Bottom hang') : t('Off-bottom hang'),
  }));

  const splitT = maxDepthTime(data.depthSeries);

  const alarmMarkers = showAlarms
    ? buildAlarmMarkers(alarms, data.depthSeries, splitT, ct)
    : [];

  const speedMarkers = buildSpeedMarkers(data.points, speedStep, splitT, ct);

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
          itemStyle: { color: ct.red },
          label: {
            formatter: t('First contraction'),
            position: 'top',
            color: ct.red,
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
    // Describes what an A->B selection LOOKS like. It does nothing until
    // takeGlobalCursor arms it (see the measure effect), so it is safe to ship
    // in the option unconditionally and costs nothing while measuring is off.
    // Declaring `brush` makes ECharts paint its own button strip inside the
    // plot; an explicitly hidden toolbox is what stops it. The button above the
    // chart is the only way into measure mode.
    toolbox: { show: false },
    brush: {
      xAxisIndex: 0,
      brushType: 'lineX' as const,
      brushMode: 'single' as const,
      transformable: true,
      removeOnClick: false,
      // No toolbox: the button above the chart is the only way in, so ECharts
      // must not paint its own control strip over the plot.
      toolbox: [] as string[],
      brushStyle: {
        borderWidth: 1,
        color: withAlpha(ct.accent, 0.12),
        borderColor: withAlpha(ct.accent, 0.7),
      },
    },
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color: ct.accent, opacity: 0.4 } },
    tooltip: {
      ...baseTooltip(ct),
      trigger: 'axis',
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const [tm, d] = p.value as [number, number];
        // Pull speed + HR at the hovered time from the sibling series, so the
        // depth curve reads out everything without hunting the other tracks.
        const lines = [`${d.toFixed(1)} m`];
        const v = valueAtTime(data.speedSeries, tm);
        if (v != null) lines.push(`${Math.abs(v).toFixed(1)} m/s`);
        const hr = valueAtTime(data.hrSeries, tm);
        if (hr != null) lines.push(`${Math.round(hr)} bpm`);
        return `t=${fmtSec(tm)}<br/>${lines.join(' · ')}`;
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
        lineStyle: { color: ct.accent, width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(ct.accent, 0.4) },
              { offset: 1, color: withAlpha(ct.accent, 0.02) },
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
                fontFamily: 'Nunito, system-ui',
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
  opts: { allowNegative?: boolean; smoothWindow?: number; refLines?: number[] } = {},
) {
  const empty = series.length < 2;
  const smoothed =
    opts.smoothWindow && opts.smoothWindow > 1
      ? smoothSeries(series, opts.smoothWindow)
      : null;

  // Emphasised horizontal reference lines (e.g. ±1 m/s for freedivers): dashed
  // and labelled, more prominent than the faint 0.5-interval gridlines.
  // Attached to the bold data series so ECharts keeps them in the y-axis range.
  const markLine =
    opts.refLines && opts.refLines.length
      ? {
          silent: true,
          symbol: 'none' as const,
          lineStyle: { color: ct.textDim, type: 'dashed' as const, width: 1, opacity: 0.7 },
          label: {
            show: true,
            position: 'insideEndTop' as const,
            formatter: (p: { value: number }) => `${p.value > 0 ? '+' : ''}${p.value} ${unit}`,
            color: ct.textDim,
            fontSize: 10,
          },
          data: opts.refLines.map((y) => ({ yAxis: y })),
        }
      : undefined;

  // When smoothing is on, the raw curve drops to a faint underlay and the
  // bold line is the moving average. The tooltip then reports the smoothed
  // value (last series) rather than the noisy raw one.
  const boldSeries: Record<string, unknown> = {
    type: 'line',
    data: smoothed ?? series,
    showSymbol: false,
    smooth: 0.2,
    lineStyle: { color, width: smoothed ? 2 : 1.5 },
  };
  if (markLine) boldSeries.markLine = markLine;

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
        boldSeries,
      ]
    : [boldSeries];

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

/** Speed against depth, oriented like a dive profile: depth runs down the
 *  VERTICAL axis (0 m at the top, inverted) and speed (m/s) runs along the
 *  horizontal axis, MIRRORED about zero — descent flows out to the left,
 *  ascent to the right (both plotted as magnitude, so the axis labels read
 *  positive m/s on each side). Smoothing applies to each branch
 *  independently so the turn doesn't bleed between them. The crosshair rides
 *  the depth axis, so hovering a depth reads out both branches' speeds. */
function buildSpeedByDepthOption(
  data: DepthDiveData,
  smoothWindow: number,
  ct: ChartTheme,
  t: TFn,
  overlay = false,
) {
  const splitT = maxDepthTime(data.depthSeries);
  // Collected as [depth, |speed|] in TIME order (the natural dive path), NOT
  // sorted by depth: real dives aren't monotonic in depth (bottom hangs, small
  // reversals), so sorting by depth puts the fast "arriving" speed and the
  // near-zero "hanging" speed at the same depth next to each other and the line
  // zig-zags / looks broken at the turn. Time order keeps each branch a single
  // connected curve, exactly like the speed-over-time chart. data.points is
  // already time-sorted; smoothing then runs along time.
  const desc: [number, number][] = [];
  const asc: [number, number][] = [];
  let maxSpeed = 0;
  for (const p of data.points) {
    if (p.v == null) continue;
    const s = Math.abs(p.v);
    if (s > maxSpeed) maxSpeed = s;
    if (p.t <= splitT) desc.push([p.d, s]);
    else asc.push([p.d, s]);
  }
  const bound = Math.max(0.5, maxSpeed * 1.08);

  // Plot as [x, depth]: descent mirrored to the left (negative x), ascent to
  // the right (positive x). The magnitude is unchanged; only the side flips.
  const toPlot = (s: [number, number][], sign: 1 | -1) =>
    s.map(([d, v]) => [sign * v, d] as [number, number]);

  const branch = (name: string, byDepth: [number, number][], color: string, sign: 1 | -1) => {
    const out: any[] = [];
    if (byDepth.length < 2) return out;
    if (smoothWindow > 1) {
      out.push({
        name,
        type: 'line',
        color,
        data: toPlot(byDepth, sign),
        showSymbol: false,
        smooth: 0.2,
        silent: true,
        legendHoverLink: false,
        lineStyle: { color, width: 1, opacity: 0.22 },
      });
    }
    out.push({
      name,
      type: 'line',
      color,
      data: toPlot(smoothWindow > 1 ? smoothSeries(byDepth, smoothWindow) : byDepth, sign),
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color, width: 2 },
    });
    return out;
  };

  // Overlay puts both branches on the same positive axis; mirrored spreads
  // them left/right of a zero centre-line.
  const descName = overlay ? t('Descent') : `← ${t('Descent')}`;
  const ascName = overlay ? t('Ascent') : `${t('Ascent')} →`;
  const descSign: 1 | -1 = overlay ? 1 : -1;

  return {
    grid: { ...GRID, top: 28 },
    animation: false,
    legend: {
      top: 0,
      right: 16,
      textStyle: { color: ct.textDim, fontSize: 10, fontFamily: 'Nunito, system-ui' },
      itemWidth: 14,
      data: [descName, ascName],
    },
    tooltip: {
      ...baseTooltip(ct),
      trigger: 'axis',
      axisPointer: { type: 'line' as const, axis: 'y' as const },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        // With smoothing on, raw underlays duplicate the names — keep the
        // last (bold/smoothed) entry per series name. Speed shown as
        // magnitude regardless of which side it's mirrored to.
        const byName = new Map<string, [number, number]>();
        for (const p of arr) {
          if (p.seriesName === '__zero__') continue;
          byName.set(p.seriesName, p.value as [number, number]);
        }
        const d = arr[0]?.value?.[1];
        const lines = [...byName.entries()].map(
          ([name, [v]]) => `${name}: ${typeof v === 'number' ? Math.abs(v).toFixed(2) : v} m/s`,
        );
        return `${typeof d === 'number' ? d.toFixed(1) : d} m<br/>${lines.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'value',
      min: overlay ? 0 : -bound,
      max: bound,
      // Labels read positive on both sides (magnitude).
      axisLabel: {
        formatter: (v: number) => `${Math.abs(v).toFixed(1)}`,
        color: ct.textDim,
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: ct.axisLine } },
      // Emphasise the zero centre-line; keep the rest faint.
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      max: Math.ceil(data.maxDepth * 1.02),
      axisLabel: { formatter: '{value}m', color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { show: false },
    },
    series: [
      ...branch(descName, desc, ct.amber, descSign),
      ...branch(ascName, asc, ct.red, 1),
      // Zero centre-line divider (descent | ascent) — mirrored layout only.
      ...(overlay
        ? []
        : [
            {
              name: '__zero__',
              type: 'line',
              silent: true,
              legendHoverLink: false,
              data: [[0, 0], [0, Math.ceil(data.maxDepth * 1.02)]],
              showSymbol: false,
              lineStyle: { color: ct.axisLine, width: 1, type: 'solid' as const },
            },
          ]),
    ],
  };
}

function baseTooltip(ct: ChartTheme) {
  return {
    backgroundColor: ct.tooltipBg,
    borderColor: ct.axisLine,
    textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui', fontSize: 12 },
    axisPointer: { type: 'line' as const },
  };
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
