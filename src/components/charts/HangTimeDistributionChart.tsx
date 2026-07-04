/**
 * Hang Time Distribution — bucketed histogram of bottom-hang durations,
 * with a one-line stat on how many dives include a hang at all.
 */
import ReactECharts from 'echarts-for-react';
import type { HangTimeStats } from '../../lib/analytics/depthInsights';
import { useChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';

interface Props {
  stats: HangTimeStats;
}

export function HangTimeDistributionChart({ stats }: Props) {
  const ct = useChartTheme();
  const t = useT();
  if (stats.totalDives === 0) {
    return (
      <ChartCard
        title={t('Hang Time Distribution')}
        description={t('How long you typically spend at the bottom of dives.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No depth dives in this backup yet.')}
        </p>
      </ChartCard>
    );
  }

  const pct =
    stats.totalDives > 0
      ? Math.round((stats.divesWithHang / stats.totalDives) * 100)
      : 0;
  const description = `${stats.divesWithHang} ${t('of')} ${stats.totalDives} ${t('dives')} (${pct}%) ${t('included a bottom hang. Longest:')} ${stats.longestHangSec}s.`;

  const option = {
    grid: { left: 36, right: 16, top: 8, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const bin = stats.bins[p.dataIndex];
        return `${bin.label}<br/>${p.value} ${p.value === 1 ? t('dive') : t('dives')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: stats.bins.map((b) => b.label),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'Nunito, system-ui',
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
        fontFamily: 'Nunito, system-ui',
        fontSize: 10,
      },
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: stats.bins.map((b) => b.count),
        // First bar (0s, no hang) reads as background; the rest in accent
        // so the "actual hang" buckets stand out.
        itemStyle: {
          color: (params: any) =>
            params.dataIndex === 0 ? ct.splitLine : ct.highlight,
          borderRadius: [3, 3, 0, 0],
        },
        barWidth: '64%',
        label: {
          show: true,
          position: 'top',
          color: ct.textDim,
          fontFamily: 'Nunito, system-ui',
          fontSize: 10,
        },
      },
    ],
  };

  return (
    <ChartCard title={t('Hang Time Distribution')} description={description}>
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
