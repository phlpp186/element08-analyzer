/**
 * PeriodComparisonChart — one line per period, all aligned to weeks-
 * before-anchor (week 0 = target week on the right edge).
 *
 * The visual story: at a glance you can see whether this season's prep
 * had a stronger build, a sharper taper, or a different peak position
 * compared to previous seasons.
 */
import ReactECharts from 'echarts-for-react';
import type { AggregatedSeries, MetricDef } from '../../lib/analytics/periodCompare';
import { useChartTheme } from '../../lib/chartTheme';

interface Props {
  series: AggregatedSeries[];
  xLabels: number[];
  metric: MetricDef;
}

export function PeriodComparisonChart({ series, xLabels, metric }: Props) {
  const ct = useChartTheme();
  const hasData = series.some((s) => s.points.some((v) => v != null && v > 0));

  if (series.length === 0 || !hasData) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center">
        <p className="text-textDim">
          {series.length === 0
            ? 'Add at least one period above to see a comparison.'
            : 'No sessions fall inside the configured period(s) for this metric.'}
        </p>
      </div>
    );
  }

  const option = {
    grid: { left: 64, right: 24, top: 24, bottom: 56 },
    animation: false,
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui', fontSize: 12 },
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#4fc3f7', opacity: 0.4 } },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const wk = params[0].axisValue;
        const lines = params
          .filter((p: any) => p.value != null && Number.isFinite(p.value))
          .map((p: any) => {
            // Duration metrics carry a `format` (seconds → m:ss); the rest
            // print the raw number with the unit suffix.
            const v = metric.format
              ? metric.format(p.value as number)
              : `${typeof p.value === 'number' ? p.value.toFixed(1).replace(/\.0$/, '') : p.value} ${metric.unit}`;
            return `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${v}</b>`;
          });
        // axisValue is the category-axis STRING ("target" or "-12w"), not a
        // number — so a `=== 0` check would never match. Detect the anchor
        // by its string label, and append "before" for the other ticks
        // (which already carry their own "w" suffix).
        const wkLabel = wk === 'target' ? 'target week' : `${wk} before`;
        return `<div style="font-weight:600;margin-bottom:4px">${wkLabel}</div>${lines.join('<br/>')}`;
      },
    },
    legend: {
      bottom: 4,
      left: 'center',
      textStyle: { color: ct.textDim, fontFamily: 'Inter, system-ui', fontSize: 11 },
      itemWidth: 16,
      itemHeight: 8,
      icon: 'rect',
    },
    xAxis: {
      type: 'category',
      data: xLabels.map((w) => (w === 0 ? 'target' : `${w}w`)),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (val: string, idx: number) => {
          // Reduce density when the period is long.
          if (xLabels.length > 16 && idx % 2 !== 0 && val !== 'target') return '';
          return val;
        },
      },
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        // Duration metrics format the tick as m:ss.
        ...(metric.format ? { formatter: (v: number) => metric.format!(v) } : {}),
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      minInterval: metric.unit === 'sessions' || metric.unit === 'days' ? 1 : undefined,
    },
    series: series.map((s) => ({
      name: s.label,
      type: 'line',
      data: s.points.map((v) => (v == null ? null : v)),
      connectNulls: false,
      showSymbol: true,
      symbolSize: 5,
      smooth: 0.25,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
    })),
  };

  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <ReactECharts option={option} style={{ height: 360 }} notMerge />
    </div>
  );
}
