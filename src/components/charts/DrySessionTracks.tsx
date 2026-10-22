/**
 * DrySessionTracks — synchronized SpO₂ + HR timeline for one dry
 * breath-hold session, and the block strip that heads it.
 *
 * Same crosshair-sync mechanism as the depth and pool players. The SpO₂
 * chart sits over the oximeter zones (≥89 % green, 75–89 % amber, below
 * red), holds are shaded behind both lines, and each hold carries pills:
 * its lowest SpO₂ (afterdrop included) and its first contraction; the
 * rest of the contractions are small dots on the heart rate. A zoom range
 * narrows both charts and the strip to one hold.
 */
import { useCallback, useMemo } from "react";
import * as echarts from "echarts/core";
import ReactECharts from "./EChart";
import type {
  DryBlock,
  DrySessionData,
} from "../../lib/analytics/drySessionProfile";
import { SPO2_ZONES, type DryHold } from "../../lib/analytics/dryHolds";
import {
  mixHex,
  useChartTheme,
  withAlpha,
  type ChartTheme,
} from "../../lib/chartTheme";
import { useT } from "../../i18n";

interface Props {
  data: DrySessionData;
  groupId: string;
  /** Render just ONE chart (a tab, or the fullscreen single-metric view). */
  solo?: "spo2" | "hr";
  /** Chart height in px; with both charts, each gets about half. */
  chartHeight?: number;
  /** The holds, for their pills. */
  holds?: DryHold[];
  /** Show only this time range (s), e.g. one hold. */
  zoom?: [number, number] | null;
  /** Embedded in a page that heads it: no well, headers or strip. */
  bare?: boolean;
}

/** Plot margins; the block strip uses the same so it lines up. */
const DRY_GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: "all" as const }];

/** Block colours: Rest the highlight, Hold red, Recover green. */
function blockColor(type: DryBlock["type"], ct: ChartTheme): string {
  return type === "Hold" ? ct.red : type === "Recover" ? ct.green : ct.highlight;
}

export function DrySessionTracks({
  data,
  groupId,
  solo,
  chartHeight,
  holds = [],
  zoom = null,
  bare = false,
}: Props) {
  const ct = useChartTheme();
  const t = useT();
  const range = useMemo<[number, number]>(
    () => zoom ?? [data.startT, data.endT],
    [zoom, data.startT, data.endT],
  );

  const holdBands = useMemo(
    () =>
      data.blocks
        .filter((b) => b.type === "Hold")
        .map((b) => [
          { xAxis: b.startT, itemStyle: { color: withAlpha(ct.text, 0.06) } },
          { xAxis: b.endT },
        ]),
    [data.blocks, ct],
  );

  const spo2Floor = useMemo(() => {
    let lo = 100;
    for (const [, v] of data.spo2Series) if (v < lo) lo = v;
    // Down to the lowest reading, and always far enough to show the red zone.
    return Math.min(SPO2_ZONES.mild - 15, Math.floor((lo - 3) / 5) * 5);
  }, [data.spo2Series]);

  const spo2Marks = useMemo(
    () =>
      holds
        .filter((h) => h.minSpo2)
        .map((h) =>
          pill(
            [h.minSpo2!.t, h.minSpo2!.v],
            `${t("min")} ${Math.round(h.minSpo2!.v)}%`,
            zoneColor(h.minSpo2!.v, ct),
            "bottom",
          ),
        ),
    [holds, ct, t],
  );

  const hrMarks = useMemo(() => {
    const marks: unknown[] = [];
    const firsts = new Set<number>();
    for (const h of holds) {
      if (h.firstContraction == null) continue;
      const tc = h.startT + h.firstContraction;
      firsts.add(tc);
      const at = valueAt(data.hrSeries, tc);
      if (at) marks.push(pill(at, `${t("1st C")} ${fmtSec(h.firstContraction)}`, ct.amber, "top", "diamond"));
    }
    // The other contractions: small dots, so a CO₂ table does not drown in
    // labels.
    for (const c of data.contractions) {
      if (firsts.has(c.t)) continue;
      const at = valueAt(data.hrSeries, c.t);
      if (at) marks.push({ coord: at, symbol: "circle", symbolSize: 5, itemStyle: { color: withAlpha(ct.red, 0.75) } });
    }
    return marks;
  }, [holds, data.contractions, data.hrSeries, ct, t]);

  const spo2Option = useMemo(
    () =>
      buildLineOption(
        {
          series: data.spo2Series,
          color: ct.green,
          unit: "%",
          range,
          areas: [
            ...zoneAreas(ct),
            ...holdBands,
          ],
          markPoints: spo2Marks,
          yMin: spo2Floor,
          yMax: 100,
        },
        ct,
      ),
    [data.spo2Series, holdBands, spo2Marks, spo2Floor, range, ct],
  );

  const hrOption = useMemo(
    () =>
      buildLineOption(
        {
          series: data.hrSeries,
          color: ct.highlight,
          unit: "bpm",
          range,
          areas: holdBands,
          markPoints: hrMarks,
          fitY: true,
        },
        ct,
      ),
    [data.hrSeries, holdBands, hrMarks, range, ct],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      echarts.connect(groupId);
    },
    [groupId],
  );

  const hasSpo2 = data.spo2Series.length >= 2;
  const hasHr = data.hrSeries.length >= 2;
  const both = !solo && hasSpo2 && hasHr;
  const show = (track: "spo2" | "hr") => !solo || solo === track;
  const h = (fallback: number) => (chartHeight ? (both ? Math.floor(chartHeight / 2) - 18 : chartHeight) : fallback);

  return (
    <div className={`space-y-2 ${solo || bare ? "" : "chart-well rounded-2xl p-4 sm:p-5"}`}>
      {show("spo2") && hasSpo2 && (
        <>
          {(!bare || both) && <TrackHeader label="SpO₂" unit="%" />}
          <ReactECharts
            option={spo2Option}
            style={{ height: h(220) }}
            opts={{ renderer: "canvas" }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {show("hr") && hasHr && (
        <>
          {(!bare || both) && (
            <TrackHeader
              label={t("Heart Rate")}
              unit="bpm"
              hint={
                data.contractions.length > 0
                  ? `${data.contractions.length} ${data.contractions.length === 1 ? t("contraction") : t("contractions")}`
                  : undefined
              }
            />
          )}
          <ReactECharts
            option={hrOption}
            style={{ height: h(180) }}
            opts={{ renderer: "canvas" }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {!bare && data.blocks.length > 0 && (
        <BlockStrip blocks={data.blocks} range={[data.startT, data.endT]} holds={holds} />
      )}

      {!data.hasOxy && data.blocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center text-textDim">
          {t("No oximeter readings or block timeline recorded for this session.")}
        </div>
      )}
    </div>
  );
}

function TrackHeader({ label, unit, hint }: { label: string; unit: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">{label}</h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">{unit}</span>
      {hint && <span className="font-mono text-[10px] text-textDim opacity-50">· {hint}</span>}
    </div>
  );
}

/** The session as its blocks, one bevelled block each, lined up with the
 *  charts' plot (same margins) and cut to the shown range. Holds carry
 *  their number and time when there is room. */
export function BlockStrip({
  blocks,
  range,
  holds,
}: {
  blocks: DryBlock[];
  range: [number, number];
  holds: DryHold[];
}) {
  const ct = useChartTheme();
  const t = useT();
  const [from, to] = range;
  const total = Math.max(to - from, 1);
  let holdNo = 0;
  return (
    <div className="flex gap-0.5" style={{ marginLeft: DRY_GRID.left, marginRight: DRY_GRID.right }}>
      {blocks.map((b, i) => {
        if (b.type === "Hold") holdNo++;
        const a = Math.max(b.startT, from);
        const z = Math.min(b.endT, to);
        if (z <= a) return null;
        const share = (z - a) / total;
        const c = blockColor(b.type, ct);
        const hold = b.type === "Hold" ? holds[holdNo - 1] : undefined;
        return (
          <div
            key={i}
            className="flex h-7 min-w-0 items-center justify-center overflow-hidden rounded-md px-1 font-num text-[11px] font-bold"
            style={{
              width: `${share * 100}%`,
              background: c,
              borderBottom: `3px solid ${mixHex(c, "#000000", 0.35)}`,
              color: mixHex(c, "#000000", 0.78),
            }}
            title={`${t(b.type)} · ${fmtSec(b.endT - b.startT)}`}
          >
            {b.type === "Hold" && share > 0.08 && (
              <span className="truncate whitespace-nowrap">
                {t("Hold")} {holdNo} · {fmtSec(hold?.seconds ?? b.endT - b.startT)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The SpO₂ zones as faint horizontal bands behind the line. */
function zoneAreas(ct: ChartTheme) {
  const band = (top: number, bottom: number, color: string) => [
    { yAxis: top, itemStyle: { color: withAlpha(color, 0.08) } },
    { yAxis: bottom },
  ];
  return [
    band(100, SPO2_ZONES.ok, ct.green),
    band(SPO2_ZONES.ok, SPO2_ZONES.mild, ct.amber),
    band(SPO2_ZONES.mild, 0, ct.red),
  ];
}

function zoneColor(v: number, ct: ChartTheme): string {
  return v >= SPO2_ZONES.ok ? ct.green : v >= SPO2_ZONES.mild ? ct.amber : ct.red;
}

interface LineOptionParams {
  series: [number, number][];
  color: string;
  unit: string;
  range: [number, number];
  areas?: unknown[];
  markPoints?: unknown[];
  yMin?: number;
  yMax?: number;
  /** Fit the y axis to the data (heart rate). */
  fitY?: boolean;
}

function buildLineOption(p: LineOptionParams, ct: ChartTheme) {
  const empty = p.series.length < 2;
  return {
    grid: DRY_GRID,
    animation: false,
    axisPointer: {
      link: AXIS_POINTER_LINK,
      lineStyle: { color: p.color, opacity: 0.4 },
    },
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontSize: 12 },
      trigger: "axis",
      axisPointer: { type: "line" as const },
      formatter: (params: unknown) => {
        if (empty) return "";
        const list = (Array.isArray(params) ? params : [params]) as { value: [number, number] }[];
        const [t, v] = list[0].value;
        return `t=${fmtSec(t)}<br/>${typeof v === "number" ? v.toFixed(1) : v} ${p.unit}`;
      },
    },
    xAxis: {
      type: "value",
      min: p.range[0],
      max: p.range[1],
      axisLabel: { formatter: (v: number) => fmtSec(v), color: ct.textDim, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: p.yMin,
      max: p.yMax,
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
        lineStyle: { color: p.color, width: 2 },
        markArea:
          p.areas && p.areas.length > 0
            ? { silent: true, itemStyle: { opacity: 1 }, data: p.areas }
            : undefined,
        markPoint: p.markPoints && p.markPoints.length > 0 ? { data: p.markPoints } : undefined,
      },
    ],
  };
}

/** The series' value at x, interpolated, so a marker sits on the line. */
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

/** A labelled pill on a line: a dot and its text in a chip of its colour. */
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
