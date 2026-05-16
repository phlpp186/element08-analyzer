/**
 * Hold Duration Trend — longest Hold per dry session over time, one
 * series per sessionTag. Reads at a glance whether the diver is making
 * progress on max attempts vs. just doing CO₂ sets.
 */
import ReactECharts from 'echarts-for-react';
import type { HoldDurationSeries } from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  series: HoldDurationSeries[];
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function HoldDurationTrendChart({ series }: Props) {
  const ct = useChartTheme();
  if (series.length === 0) {
    return (
      <ChartCard
        title="Hold Duration Trend"
        description="Longest Hold per dry session, over time."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No tagged dry sessions in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMax = 0;
  for (const s of series) for (const p of s.points) if (p.longestHoldSec > yMax) yMax = p.longestHoldSec;

  const option = {
    grid: { left: 56, right: 16, top: 30, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const [date, dur] = p.value as [string, number];
        const dateStr = new Date(date).toLocaleDateString();
        return `<span style="color:${p.color}">●</span> ${p.seriesName}<br/>${dateStr} · ${fmtSec(dur)}`;
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      itemWidth: 14,
      itemHeight: 6,
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
      min: 0,
      max: Math.ceil((yMax + 30) / 30) * 30,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => fmtSec(v),
      },
    },
    series: series.map((s) => ({
      name: s.label,
      type: 'line',
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 5,
      smooth: 0.2,
      data: s.points.map((p) => [p.date, p.longestHoldSec] as [string, number]),
      lineStyle: { color: s.color, width: 2, opacity: 0.7 },
      itemStyle: { color: s.color },
    })),
  };

  return (
    <ChartCard
      title="Hold Duration Trend"
      description="Longest hold per dry session, over time, grouped by session tag. Climbing pb_attempt = progress."
    >
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </ChartCard>
  );
}
