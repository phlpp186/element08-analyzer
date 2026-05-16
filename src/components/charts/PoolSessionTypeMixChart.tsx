/**
 * Pool CO₂/O₂ Training Mix — count of pool sessions per training-type
 * tag. Horizontal bar chart so labels read left-to-right at any width.
 */
import ReactECharts from 'echarts-for-react';
import type { PoolTypeBucket } from '../../lib/analytics/poolSessionTypes';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  buckets: PoolTypeBucket[];
}

export function PoolSessionTypeMixChart({ buckets }: Props) {
  const ct = useChartTheme();
  if (buckets.length === 0) {
    return (
      <ChartCard
        title="CO₂/O₂ Training Mix"
        description="Pool sessions grouped by training-type tag."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No pool sessions in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const total = buckets.reduce((s, b) => s + b.count, 0);
  // Render top-to-bottom in the same order the analytics produced.
  // ECharts paints horizontal-bar y-axis bottom-up, so reverse before
  // handing it in.
  const ordered = [...buckets].reverse();

  const option = {
    grid: { left: 96, right: 32, top: 8, bottom: 8, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const b = ordered[p.dataIndex];
        const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
        return `<span style="color:${b.color}">●</span> ${b.label}<br/>${b.count} session${b.count === 1 ? '' : 's'} · ${pct}%`;
      },
    },
    xAxis: {
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
    yAxis: {
      type: 'category',
      data: ordered.map((b) => b.label),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
    },
    series: [
      {
        type: 'bar',
        data: ordered.map((b) => ({
          value: b.count,
          itemStyle: { color: b.color, borderRadius: [0, 3, 3, 0] },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: 'right',
          color: ct.textDim,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
        },
      },
    ],
  };

  const height = Math.max(160, ordered.length * 28 + 32);

  return (
    <ChartCard
      title="CO₂/O₂ Training Mix"
      description="Pool sessions by training-type tag. Untagged sessions are listed so you can see your tagging coverage."
    >
      <ReactECharts option={option} style={{ height }} notMerge />
    </ChartCard>
  );
}
