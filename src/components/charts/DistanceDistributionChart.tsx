/**
 * Distance Distribution — histogram of pool dive distances bucketed in
 * 25-metre bins. STA dives are excluded by the analytics function.
 */
import ReactECharts from 'echarts-for-react';
import type { DistanceBin } from '../../lib/analytics/poolDistance';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  bins: DistanceBin[];
}

export function DistanceDistributionChart({ bins }: Props) {
  const ct = useChartTheme();
  if (bins.length === 0) {
    return (
      <ChartCard
        title="Distance Distribution"
        description="Per-dive distances bucketed by 25-metre bins."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No pool dives with distance data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const option = {
    grid: { left: 36, right: 16, top: 8, bottom: 48, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const bin = bins[p.dataIndex];
        return `${bin.from}–${bin.to}m<br/>${p.value} dive${p.value === 1 ? '' : 's'}`;
      },
    },
    xAxis: {
      type: 'category',
      data: bins.map((b) => `${b.from}`),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (val: string, idx: number) => {
          // Show every other label when bins are dense.
          return bins.length > 12 && idx % 2 !== 0 ? '' : val;
        },
      },
      name: 'metres',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: bins.map((b) => b.count),
        itemStyle: { color: '#00e5cc', borderRadius: [3, 3, 0, 0] },
        barWidth: '70%',
      },
    ],
  };

  return (
    <ChartCard
      title="Distance Distribution"
      description="Per-dive distances bucketed by 25-metre bins. Shows the volume mix in your pool training."
    >
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
