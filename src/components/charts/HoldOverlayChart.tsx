/**
 * HoldOverlayChart — up to 8 breath holds overlaid on two stacked panels
 * (heart rate above, SpO2 below), one colour per hold. Mirrors the mobile
 * app's CompareHoldChart.
 *
 * Series arrive start-relative (hold start = t0). Alignment:
 *   - 'start' — anchor at hold start; each hold's end shows as a faint
 *               boundary marker further right.
 *   - 'end'   — series shift left by their duration so hold ends line up
 *               at t0; each hold's start shows as a boundary marker on the
 *               left.
 *
 * The two panels share an x-axis through echarts.connect so a crosshair
 * on one scrubs the other.
 */
import { useCallback, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';

export type HoldAlign = 'start' | 'end';

export interface OverlayHold {
  color: string;
  /** Unique series name — drives the legend. */
  label: string;
  durationSec: number;
  /** Start-relative [t, bpm]. */
  hrSeries: [number, number][];
  /** Start-relative [t, %]. */
  spo2Series: [number, number][];
}

interface Props {
  holds: OverlayHold[];
  align: HoldAlign;
  groupId: string;
}

const GRID = { left: 48, right: 16, top: 30, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

interface Shifted {
  color: string;
  label: string;
  /** x of the non-anchor hold boundary. */
  boundaryX: number;
  hr: [number, number][];
  spo2: [number, number][];
}

export function HoldOverlayChart({ holds, align, groupId }: Props) {
  const ct = useChartTheme();
  const { hrOption, spo2Option, hasHr, hasSpo2 } = useMemo(
    () => buildOptions(holds, align, ct),
    [holds, align, ct],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      echarts.connect(groupId);
    },
    [groupId],
  );
  // Keep the ref so the connect group survives unmount/remount cleanly.
  useRef(0);

  if (!hasHr && !hasSpo2) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
        The selected holds have no oximeter data, see the comparison table below.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasHr && (
        <>
          <PanelHeader label="Heart Rate" unit="bpm" />
          <ReactECharts
            option={hrOption}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {hasSpo2 && (
        <>
          <PanelHeader label="SpO2" unit="%" />
          <ReactECharts
            option={spo2Option}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
    </div>
  );
}

function PanelHeader({ label, unit }: { label: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {label}
      </h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">{unit}</span>
    </div>
  );
}

function buildOptions(holds: OverlayHold[], align: HoldAlign, ct: ChartTheme) {
  const shifted: Shifted[] = holds.map((h) => {
    const offset = align === 'end' ? h.durationSec : 0;
    const shift = (s: [number, number][]) =>
      s.map(([t, v]) => [t - offset, v] as [number, number]);
    return {
      color: h.color,
      label: h.label,
      boundaryX: align === 'end' ? -h.durationSec : h.durationSec,
      hr: shift(h.hrSeries),
      spo2: shift(h.spo2Series),
    };
  });

  let xMin = Infinity;
  let xMax = -Infinity;
  for (const s of shifted) {
    for (const [t] of [...s.hr, ...s.spo2]) {
      if (t < xMin) xMin = t;
      if (t > xMax) xMax = t;
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = -30;
    xMax = 30;
  }

  const hrPanel = shifted.filter((s) => s.hr.length >= 2);
  const spo2Panel = shifted.filter((s) => s.spo2.length >= 2);

  return {
    hasHr: hrPanel.length > 0,
    hasSpo2: spo2Panel.length > 0,
    hrOption: buildPanel(hrPanel, (s) => s.hr, '#ff5f9e', 'bpm', xMin, xMax, false, ct),
    spo2Option: buildPanel(spo2Panel, (s) => s.spo2, '#4fc3f7', '%', xMin, xMax, true, ct),
  };
}

function buildPanel(
  panel: Shifted[],
  pick: (s: Shifted) => [number, number][],
  fallbackColor: string,
  unit: string,
  xMin: number,
  xMax: number,
  spo2Floor: boolean,
  ct: ChartTheme,
) {
  // Vertical markers: bold anchor at t0 + a faint per-hold boundary line.
  const markLineData: any[] = [
    {
      xAxis: 0,
      lineStyle: { color: ct.text, width: 1.5, opacity: 0.7 },
      label: { show: false },
    },
    ...panel.map((s) => ({
      xAxis: s.boundaryX,
      lineStyle: { color: s.color, width: 1, type: 'dashed', opacity: 0.4 },
      label: { show: false },
    })),
  ];

  return {
    grid: GRID,
    animation: false,
    axisPointer: {
      link: AXIS_POINTER_LINK,
      lineStyle: { color: fallbackColor, opacity: 0.4 },
    },
    legend: {
      top: 0,
      textStyle: { color: ct.textDim, fontFamily: 'Inter, system-ui', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 6,
    },
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
              ).toFixed(0)} ${unit}`,
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
    yAxis: {
      type: 'value',
      scale: true,
      min: spo2Floor ? (v: { min: number }) => Math.max(50, Math.floor(v.min - 2)) : undefined,
      max: spo2Floor ? 100 : undefined,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: panel.map((s, i) => ({
      name: s.label,
      type: 'line',
      data: pick(s),
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: s.color, width: 1.8 },
      itemStyle: { color: s.color },
      markLine:
        i === 0
          ? { silent: true, symbol: 'none', data: markLineData }
          : undefined,
    })),
  };
}

/** Signed m:ss / s formatter — the x-axis carries negative time. */
function fmtSigned(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(Math.round(s));
  if (abs < 60) return `${sign}${abs}s`;
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}
