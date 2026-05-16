/**
 * HR Drop after Contractions — average HR delta in a window around each
 * recorded contraction. T=0 is the contraction moment; the baseline at
 * t=0 is subtracted so each contraction contributes its own delta line,
 * then everything is averaged across all contractions.
 *
 * A negative average post-0 = HR drops through the contraction (dive
 * reflex asserting). A positive value = HR ticks up (contraction
 * provoking a small startle response).
 */
import ReactECharts from 'echarts-for-react';
import type { HrAroundContraction } from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  points: HrAroundContraction[];
}

export function HrAroundContractionsChart({ points }: Props) {
  const ct = useChartTheme();
  if (points.length === 0) {
    return (
      <ChartCard
        title="HR Drop after Contractions"
        description="Average HR change in the seconds around each contraction."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No contractions with surrounding HR data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMin = 0;
  let yMax = 0;
  for (const p of points) {
    if (p.delta < yMin) yMin = p.delta;
    if (p.delta > yMax) yMax = p.delta;
  }
  yMin = Math.floor((yMin - 1) / 2) * 2;
  yMax = Math.ceil((yMax + 1) / 2) * 2;

  const option = {
    grid: { left: 44, right: 16, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const point = points[p.dataIndex];
        const sign = point.delta > 0 ? '+' : '';
        return `<span style="color:${p.color}">●</span> ${point.t > 0 ? '+' : ''}${point.t}s vs contraction<br/>${sign}${point.delta.toFixed(1)} bpm vs baseline<br/><span style="opacity:0.7">${point.n} contraction${point.n === 1 ? '' : 's'}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      min: -10,
      max: 20,
      interval: 5,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => (v > 0 ? `+${v}s` : `${v}s`),
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
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v} bpm`,
      },
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => [p.t, p.delta]),
        showSymbol: false,
        smooth: 0.3,
        lineStyle: { color: '#ffa726', width: 2 },
        itemStyle: { color: '#ffa726' },
        markLine: {
          symbol: 'none',
          silent: true,
          // ECharts renders endpoint labels by default — they collide with
          // the chart's top edge here. We just want the dashed lines.
          label: { show: false },
          lineStyle: { color: ct.axisLine, type: 'dashed' },
          data: [{ xAxis: 0 }, { yAxis: 0 }],
        },
      },
    ],
  };

  return (
    <ChartCard
      title="HR Drop after Contractions"
      description="Average HR change in a window around each contraction (baseline = HR at the contraction). Negative = dive reflex holding through it."
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}
