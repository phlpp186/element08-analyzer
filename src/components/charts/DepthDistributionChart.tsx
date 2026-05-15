/**
 * Depth Distribution — histogram of per-dive max depth bucketed in 5 m bins.
 * Warm-up / safety / excluded dives are filtered out upstream.
 */
import ReactECharts from 'echarts-for-react';
import type { DepthBin } from '../../lib/analytics/depthInsights';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  bins: DepthBin[];
}

export function DepthDistributionChart({ bins }: Props) {
  const ct = useChartTheme();
  if (bins.length === 0) {
    return (
      <ChartCard
        title="Depth Distribution"
        description="How your dives are distributed across the depth range."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No depth dives in this backup yet.
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
        formatter: (val: string, idx: number) =>
          bins.length > 12 && idx % 2 !== 0 ? '' : val,
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
        itemStyle: { color: '#4fc3f7', borderRadius: [3, 3, 0, 0] },
        barWidth: '70%',
      },
    ],
  };

  return (
    <ChartCard
      title="Depth Distribution"
      description="Per-dive max depth bucketed by 5-metre bins. Warm-ups and safeties are excluded."
    >
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
