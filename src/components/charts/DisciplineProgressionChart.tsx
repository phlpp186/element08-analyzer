/**
 * Discipline Progression — running max depth over time, one step-line per
 * discipline. The line plateaus between PBs and steps up on each new PB.
 * Trailing segment extends to today so the current PB reads as a plateau.
 */
import ReactECharts from 'echarts-for-react';
import type { DisciplineSeries } from '../../lib/analytics/depthInsights';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  series: DisciplineSeries[];
}

export function DisciplineProgressionChart({ series }: Props) {
  const ct = useChartTheme();
  if (series.length === 0) {
    return (
      <ChartCard
        title="Discipline Progression"
        description="Personal best depth over time, per discipline."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No depth dives in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMax = 0;
  for (const s of series) for (const p of s.points) if (p.depth > yMax) yMax = p.depth;

  const option = {
    grid: { left: 44, right: 16, top: 30, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const [date, depth] = p.value as [string, number];
        return `<span style="color:${p.color}">●</span> ${p.seriesName}<br/>${date} · ${depth.toFixed(1)}m`;
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
      max: Math.ceil((yMax + 5) / 5) * 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}m',
      },
    },
    series: series.map((s) => ({
      name: s.discipline,
      type: 'line',
      step: 'end',
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 6,
      data: s.points.map((p) => [p.date, p.depth] as [string, number]),
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
    })),
  };

  return (
    <ChartCard
      title="Discipline Progression"
      description="Personal best depth over time, per discipline. Each dot is a new PB; the line plateaus until the next one."
    >
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </ChartCard>
  );
}
