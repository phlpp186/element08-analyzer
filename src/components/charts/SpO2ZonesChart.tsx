/**
 * SpO₂ trend — lowest SpO₂ reached per dry session, plotted over time.
 *
 * Replaces the previous "total time per zone" bar chart, which inflated
 * indefinitely as the diver collected sessions and was visually
 * dominated by the >89 % baseline zone. The scatter answers the question
 * the diver actually has — "am I dipping lower, more often?" — and
 * horizontal zone bands preserve the colour-coded mental model. A
 * one-liner above the chart carries the absolute volume that the bars
 * used to convey.
 */
import ReactECharts from 'echarts-for-react';
import {
  fmtZoneDuration,
  SPO2_ZONES,
  zoneFor,
  type Spo2TrendData,
} from '../../lib/analytics/spo2Zones';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  data: Spo2TrendData;
}

export function SpO2ZonesChart({ data }: Props) {
  const ct = useChartTheme();
  const { points, summary } = data;

  if (points.length === 0) {
    return (
      <ChartCard
        title="SpO₂ Trend"
        description="Lowest SpO₂ reached per dry session, over time."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No oximeter data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMin = Infinity;
  for (const p of points) if (p.lowest < yMin) yMin = p.lowest;
  // Round down to the nearest 5, clamp to the lowest zone's floor so the
  // critical band is always at least partially visible if the diver
  // hasn't crossed into it.
  yMin = Math.max(50, Math.floor((yMin - 2) / 5) * 5);

  // markArea expects [[{ yAxis: from }, { yAxis: to }], …]. Layered behind
  // the scatter as faint zone tints so the bands read at a glance.
  const zoneBands = SPO2_ZONES.filter((z) => z.to <= 101 && z.to > yMin).map((z) => [
    { yAxis: Math.max(z.from, yMin), itemStyle: { color: `${z.color}1a` } },
    { yAxis: Math.min(z.to, 100) },
  ]);

  // Threshold lines at each zone boundary so readers can see exactly
  // where the bands are even without hovering. Skip the topmost (>89
  // baseline starts at 90, no upper bound to draw).
  const thresholds = SPO2_ZONES.filter((z) => z.from > 0 && z.from > yMin).map((z) => ({
    yAxis: z.from,
    lineStyle: { color: `${z.color}66`, type: 'dashed' as const, width: 1 },
  }));

  const scatterData = points.map((p) => ({
    value: [p.date, p.lowest] as [string, number],
    itemStyle: { color: zoneFor(p.lowest).color },
    p,
  }));

  const option = {
    grid: { left: 44, right: 16, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const point = p.data.p as typeof points[number];
        const dateStr = new Date(point.date).toLocaleDateString();
        const zone = zoneFor(point.lowest);
        return (
          `<span style="color:${zone.color}">●</span> Min SpO₂ ${point.lowest}%` +
          `<br/>${dateStr} · ${point.sessionName}` +
          `<br/><span style="opacity:0.7">${point.holdCount} hold${point.holdCount === 1 ? '' : 's'} · ${fmtZoneDuration(point.secBelow89)} below 89%</span>`
        );
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: 100,
      interval: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine, opacity: 0.4 } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}%',
      },
    },
    series: [
      {
        type: 'scatter',
        data: scatterData,
        symbolSize: 8,
        markArea: { silent: true, data: zoneBands },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          data: thresholds,
        },
        z: 3,
      },
    ],
  };

  const summaryLine = (() => {
    if (summary.totalSecBelow89 === 0) {
      return `No time below 89 % across ${summary.sessionsWithOxy} session${summary.sessionsWithOxy === 1 ? '' : 's'}.`;
    }
    return `${fmtZoneDuration(summary.totalSecBelow89)} below 89 % across ${summary.totalHolds} hold${summary.totalHolds === 1 ? '' : 's'} in ${summary.sessionsWithOxy} session${summary.sessionsWithOxy === 1 ? '' : 's'}.`;
  })();

  return (
    <ChartCard
      title="SpO₂ Trend"
      description={summaryLine}
    >
      <ReactECharts option={option} style={{ height: 260 }} notMerge />
    </ChartCard>
  );
}
