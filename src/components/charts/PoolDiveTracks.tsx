/**
 * PoolDiveTracks — synchronized multi-track timeline for a single pool
 * dive. Same crosshair-sync mechanism as DepthDiveTracks (echarts.connect)
 * but the track set is different:
 *
 *   1. HEART RATE  — always shown when ≥2 HR points. Vertical lap markers
 *                    overlaid. Contractions marked as red dots on the line.
 *   2. DEPTH       — only when the dive carries depth data (some dive
 *                    computers record pool depth too).
 *   3. SPEED       — only when speed samples are present.
 *
 * No depth alarms here (pool sessions don't use them); for pace coaching
 * we surface lap markers as bright vertical lines with labels (L1, L2, ...).
 */
import { useCallback, useMemo } from "react";
import * as echarts from "echarts/core";
import ReactECharts from "./EChart";
import type { PoolDiveData } from "../../lib/analytics/poolDiveProfile";
import { mixHex, useChartTheme, withAlpha, type ChartTheme } from "../../lib/chartTheme";
import { lapBounds, lapColors, lapSplitSeconds } from "../../lib/analytics/lapColors";
import { useT } from "../../i18n";

interface Props {
  data: PoolDiveData;
  /** Unique chart-group id (stable across re-renders for the same dive). */
  groupId: string;
  /** Render just ONE track (fullscreen single-metric view). */
  solo?: "hr" | "depth" | "speed";
  /** Chart height override in px (used by the fullscreen view). */
  chartHeight?: number;
  /** Embedded in a page that labels the chart itself: no track headers. */
  bare?: boolean;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: "all" as const }];

export function PoolDiveTracks({
  data,
  groupId,
  solo,
  chartHeight,
  bare = false,
}: Props) {
  const ct = useChartTheme();
  const t = useT();
  // Turns: a dashed line where each lap ends. The laps themselves are the
  // shaded bands, labelled with their split.
  const lapLines = useMemo(
    () =>
      data.lapEndTimes.map((t) => ({
        xAxis: t,
        label: { show: false },
        lineStyle: {
          color: ct.text,
          type: "dashed" as const,
          width: 1,
          opacity: 0.45,
        },
      })),
    [data.lapEndTimes, ct],
  );

  // Lap bands, coloured by pace (fastest green, slowest amber), when the
  // dive has more than one lap.
  const lapAreas = useMemo(() => {
    if (data.lapEndTimes.length === 0) return [];
    const bounds = lapBounds(data.lapEndTimes, data.startT, data.endT);
    const secs = lapSplitSeconds(bounds, data.lapSeconds);
    const colors = lapColors(secs, ct);
    return bounds.map(([a, b], i) => [
      {
        xAxis: a,
        name: `${t("Lap")} ${i + 1} · ${secs[i].toFixed(1)}s`,
        itemStyle: { color: withAlpha(colors[i], 0.1) },
        label: { color: colors[i], fontWeight: 700 },
      },
      { xAxis: b },
    ]);
  }, [data.lapEndTimes, data.lapSeconds, data.startT, data.endT, ct, t]);

  // Pills on the heart-rate line: the lowest point, and each contraction
  // where the line is at that moment.
  const hrMarks = useMemo(() => {
    const marks: unknown[] = [];
    if (data.hrSeries.length > 1) {
      let lo = data.hrSeries[0];
      for (const p of data.hrSeries) if (p[1] < lo[1]) lo = p;
      marks.push(pill(lo, `${t("min")} ${Math.round(lo[1])} bpm`, ct.highlight, "bottom"));
    }
    for (const c of data.contractionTimes) {
      const at = valueAt(data.hrSeries, c);
      if (at) marks.push(pill(at, `${t("contraction")} ${fmtSec(c)}`, ct.red, "top", "diamond"));
    }
    return marks;
  }, [data.hrSeries, data.contractionTimes, ct, t]);

  const hrOption = useMemo(
    () =>
      buildLineOption(
        {
          series: data.hrSeries,
          color: ct.highlight,
          unit: "bpm",
          startT: data.startT,
          endT: data.endT,
          markLines: lapLines,
          markPoints: hrMarks,
          markAreas: lapAreas,
          fitY: true,
        },
        ct,
      ),
    [data, lapLines, hrMarks, lapAreas, ct],
  );

  const depthOption = useMemo(
    () =>
      buildLineOption(
        {
          series: data.depthSeries,
          color: ct.accent,
          unit: "m",
          startT: data.startT,
          endT: data.endT,
          inverseY: true,
          markLines: lapLines,
          markAreas: lapAreas,
        },
        ct,
      ),
    [data, lapLines, lapAreas, ct],
  );

  const speedOption = useMemo(
    () =>
      buildLineOption(
        {
          series: data.speedSeries,
          color: ct.amber,
          unit: "m/s",
          startT: data.startT,
          endT: data.endT,
          markLines: lapLines,
          markAreas: lapAreas,
          fitY: true,
        },
        ct,
      ),
    [data, lapLines, lapAreas, ct],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      echarts.connect(groupId);
    },
    [groupId],
  );

  const show = (track: "hr" | "depth" | "speed") => !solo || solo === track;

  return (
    <div
      className={`space-y-4 ${solo ? "" : "chart-well rounded-2xl p-4 sm:p-5"}`}
    >
      {show("hr") && data.hasHR && (
        <>
          {!bare && (
            <TrackHeader
              label={t("Heart Rate")}
              unit="bpm"
              hint={
                data.contractionTimes.length > 0
                  ? `${data.contractionTimes.length} ${data.contractionTimes.length === 1 ? t("contraction") : t("contractions")} ${t("marked")}`
                  : undefined
              }
            />
          )}
          <ReactECharts
            option={hrOption}
            style={{ height: chartHeight ?? 200 }}
            opts={{ renderer: "canvas" }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {show("depth") && data.hasDepth && (
        <>
          {!bare && <TrackHeader label={t("Depth")} unit="m" />}
          <ReactECharts
            option={depthOption}
            style={{ height: chartHeight ?? 160 }}
            opts={{ renderer: "canvas" }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {show("speed") && data.hasSpeed && (
        <>
          {!bare && <TrackHeader label={t("Speed")} unit="m/s" />}
          <ReactECharts
            option={speedOption}
            style={{ height: chartHeight ?? 140 }}
            opts={{ renderer: "canvas" }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {!data.hasHR && !data.hasDepth && !data.hasSpeed && (
        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center text-textDim">
          {t("No profile data recorded for this dive.")}
        </div>
      )}
    </div>
  );
}

function TrackHeader({
  label,
  unit,
  hint,
}: {
  label: string;
  unit: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {label}
      </h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">
        {unit}
      </span>
      {hint && (
        <span className="font-mono text-[10px] text-textDim opacity-50">
          · {hint}
        </span>
      )}
    </div>
  );
}

interface LineOptionParams {
  series: [number, number][];
  color: string;
  unit: string;
  startT: number;
  endT: number;
  inverseY?: boolean;
  markLines?: any[];
  markPoints?: unknown[];
  /** Lap bands: [{xAxis, name, itemStyle, label}, {xAxis}] pairs. */
  markAreas?: unknown[];
  /** Fit the y axis to the data instead of starting at 0 (heart rate). */
  fitY?: boolean;
}

function buildLineOption(p: LineOptionParams, ct: ChartTheme) {
  const empty = p.series.length < 2;
  return {
    grid: GRID,
    animation: false,
    axisPointer: {
      link: AXIS_POINTER_LINK,
      lineStyle: { color: p.color, opacity: 0.4 },
    },
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: {
        color: ct.text,
        fontSize: 12,
      },
      trigger: "axis",
      axisPointer: { type: "line" as const },
      formatter: (params: any) => {
        if (empty) return "";
        const point = Array.isArray(params) ? params[0] : params;
        const [t, v] = point.value as [number, number];
        return `t=${fmtSec(t)}<br/>${typeof v === "number" ? v.toFixed(1) : v} ${p.unit}`;
      },
    },
    xAxis: {
      type: "value",
      min: p.startT,
      max: p.endT,
      axisLabel: {
        formatter: (v: number) => fmtSec(v),
        color: ct.textDim,
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      inverse: p.inverseY,
      scale: !!p.fitY,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        type: "line",
        data: p.series,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color: p.color, width: 1.8 },
        markLine:
          p.markLines && p.markLines.length > 0
            ? { silent: true, symbol: "none", data: p.markLines }
            : undefined,
        markPoint:
          p.markPoints && p.markPoints.length > 0 ? { data: p.markPoints } : undefined,
        markArea:
          p.markAreas && p.markAreas.length > 0
            ? {
                silent: true,
                label: { show: true, position: "insideTop", fontSize: 10 },
                data: p.markAreas,
              }
            : undefined,
      },
    ],
  };
}

/** The series' value at x, interpolated between the samples around it, so
 *  a marker sits on the drawn line; null when the series is empty. */
function valueAt(series: [number, number][], x: number): [number, number] | null {
  if (series.length === 0) return null;
  if (x <= series[0][0]) return [x, series[0][1]];
  for (let i = 1; i < series.length; i++) {
    const [t0, v0] = series[i - 1];
    const [t1, v1] = series[i];
    if (t1 >= x) return [x, t1 === t0 ? v1 : v0 + ((x - t0) / (t1 - t0)) * (v1 - v0)];
  }
  return [x, series[series.length - 1][1]];
}

/** A labelled pill on a line: a dot and its name in a chip of its colour. */
function pill(
  at: [number, number],
  text: string,
  color: string,
  position: "top" | "bottom",
  symbol = "circle",
) {
  return {
    coord: at,
    symbol,
    symbolSize: symbol === "circle" ? 9 : 12,
    itemStyle: { color, borderColor: "#ffffff", borderWidth: 1.5 },
    label: {
      show: true,
      formatter: text,
      position,
      distance: 8,
      color: mixHex(color, "#000000", 0.78),
      backgroundColor: color,
      borderRadius: 8,
      padding: [3, 7],
      fontSize: 10,
      fontWeight: 700,
    },
  };
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
