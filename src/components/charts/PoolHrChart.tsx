/**
 * Pool HR per Dive — HR low and HR high per training dive, plotted over
 * time. Two scatter series: lows (cool) and highs (warm). The vertical
 * spread between them visualises each dive's HR range; lows trending
 * lower over time means the diver's dive reflex is strengthening.
 */
import ReactECharts from 'echarts-for-react';
import type { HrPoint } from '../../lib/analytics/poolHr';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  points: HrPoint[];
}

const LOW_COLOR = '#00e5cc';
const HIGH_COLOR = '#ff5f9e';

export function PoolHrChart({ points }: Props) {
  const ct = useChartTheme();
  if (points.length === 0) {
    return (
      <ChartCard
        title="Heart Rate per Dive"
        description="HR low and HR high per pool dive over time."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No pool dives with HR data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const lows = points.map((p) => [p.date, p.low, p]);
  const highs = points.map((p) => [p.date, p.high, p]);

  let yMin = Infinity;
  let yMax = 0;
  for (const p of points) {
    if (p.low < yMin) yMin = p.low;
    if (p.high > yMax) yMax = p.high;
  }
  yMin = Math.max(0, Math.floor((yMin - 5) / 10) * 10);
  yMax = Math.ceil((yMax + 5) / 10) * 10;

  const option = {
    grid: { left: 44, right: 16, top: 30, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const [date, hr, meta] = p.value as [string, number, HrPoint];
        const dateStr = new Date(date).toLocaleDateString();
        const distStr = meta.distance != null ? `${meta.distance}m` : 'STA';
        return `<span style="color:${p.color}">●</span> ${p.seriesName}<br/>${dateStr} · ${hr} bpm<br/><span style="opacity:0.7">${meta.discipline} · ${distStr}</span>`;
      },
    },
    legend: {
      top: 0,
      data: ['HR low', 'HR high'],
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
      min: yMin,
      max: yMax,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value} bpm',
      },
    },
    series: [
      {
        name: 'HR low',
        type: 'scatter',
        data: lows,
        symbolSize: 6,
        itemStyle: { color: LOW_COLOR, opacity: 0.75 },
      },
      {
        name: 'HR high',
        type: 'scatter',
        data: highs,
        symbolSize: 6,
        itemStyle: { color: HIGH_COLOR, opacity: 0.75 },
      },
    ],
  };

  return (
    <ChartCard
      title="Heart Rate per Dive"
      description="HR low and HR high per pool dive. A lower 'low' over time means a stronger dive reflex."
    >
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </ChartCard>
  );
}
