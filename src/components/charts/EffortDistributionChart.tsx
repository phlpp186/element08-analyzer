/**
 * Effort Distribution — bar chart of how the diver's 1-5 self-rated
 * session effort is spread. Unrated sessions are excluded (handled by the
 * analytics function).
 */
import ReactECharts from 'echarts-for-react';
import type { EffortCount } from '../../lib/analytics/balance';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  data: EffortCount[];
}

export function EffortDistributionChart({ data }: Props) {
  const ct = useChartTheme();
  if (data.length === 0) {
    return (
      <ChartCard
        title="Effort Distribution"
        description="How your 1-5 self-rated session effort is spread across training."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No rated sessions in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const option = {
    grid: { left: 36, right: 16, top: 16, bottom: 40, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `Effort ${p.name}/5<br/>${p.value} session${p.value === 1 ? '' : 's'}`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => `${d.rating}`),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      name: 'effort rating',
      nameLocation: 'middle',
      nameGap: 26,
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
        data: data.map((d) => d.count),
        itemStyle: { color: '#ffa726', borderRadius: [3, 3, 0, 0] },
        barWidth: '56%',
        label: {
          show: true,
          position: 'top',
          color: ct.textDim,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
        },
      },
    ],
  };

  return (
    <ChartCard
      title="Effort Distribution"
      description="How your 1-5 self-rated session effort is spread across training. Unrated sessions are not counted."
    >
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
