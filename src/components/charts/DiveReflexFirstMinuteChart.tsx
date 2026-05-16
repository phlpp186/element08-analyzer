/**
 * Dive Reflex: First Minute — average HR trajectory over the first
 * minute of every hold ≥ 30s, sampled every 5 seconds. A clean downward
 * slope is the bradycardic dive reflex asserting itself.
 *
 * Sample count (n) per point is exposed in the tooltip so the diver can
 * see when the late seconds get thin because their typical hold doesn't
 * reach a full minute.
 */
import ReactECharts from 'echarts-for-react';
import type { FirstMinutePoint } from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  points: FirstMinutePoint[];
}

export function DiveReflexFirstMinuteChart({ points }: Props) {
  const ct = useChartTheme();
  if (points.length === 0) {
    return (
      <ChartCard
        title="Dive Reflex: First Minute"
        description="Average HR over the first minute of every hold."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No holds with HR data long enough (≥ 30s) in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMin = Infinity;
  let yMax = 0;
  for (const p of points) {
    if (p.hr < yMin) yMin = p.hr;
    if (p.hr > yMax) yMax = p.hr;
  }
  yMin = Math.max(0, Math.floor((yMin - 5) / 5) * 5);
  yMax = Math.ceil((yMax + 5) / 5) * 5;

  const option = {
    grid: { left: 44, right: 16, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const point = points[p.dataIndex];
        return `<span style="color:${p.color}">●</span> ${point.t}s into hold<br/>${Math.round(point.hr)} bpm<br/><span style="opacity:0.7">${point.n} hold${point.n === 1 ? '' : 's'}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 60,
      interval: 10,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}s',
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
        type: 'line',
        data: points.map((p) => [p.t, p.hr]),
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        smooth: 0.3,
        lineStyle: { color: '#ff5f9e', width: 2 },
        itemStyle: { color: '#ff5f9e' },
        areaStyle: { color: '#ff5f9e22' },
      },
    ],
  };

  return (
    <ChartCard
      title="Dive Reflex: First Minute"
      description="Average HR across all holds (≥ 30s), sampled every 5s. The downward slope is the bradycardic dive reflex."
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}
