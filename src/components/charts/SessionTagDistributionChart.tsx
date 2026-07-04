/**
 * Session-Type Distribution — horizontal bars, one per session tag, sized
 * by how many tagged sessions carry it. Untagged sessions don't count
 * (handled by the analytics function).
 */
import ReactECharts from 'echarts-for-react';
import type { TagCount } from '../../lib/analytics/balance';
import { useChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';

interface Props {
  data: TagCount[];
}

export function SessionTagDistributionChart({ data }: Props) {
  const ct = useChartTheme();
  const t = useT();
  const rows = data.filter((d) => d.count > 0);

  if (rows.length === 0) {
    return (
      <ChartCard
        title={t('Session-Type Distribution')}
        description={t('How your tagged sessions split across CO₂, O₂, comfort, PB, and recovery work.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No tagged sessions in this backup yet.')}
        </p>
      </ChartCard>
    );
  }

  // ECharts category axis renders bottom-up; reverse so the first tag
  // reads at the top.
  const labels = rows.map((r) => r.label).reverse();
  const counts = rows.map((r) => r.count).reverse();

  const option = {
    grid: { left: 8, right: 28, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `${p.name}<br/>${p.value} ${p.value === 1 ? t('session') : t('sessions')}`;
      },
    },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'Nunito, system-ui',
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'Nunito, system-ui',
        fontSize: 10,
      },
    },
    series: [
      {
        type: 'bar',
        data: counts,
        itemStyle: { color: ct.highlight, borderRadius: [0, 3, 3, 0] },
        barWidth: '58%',
        label: {
          show: true,
          position: 'right',
          color: ct.textDim,
          fontFamily: 'Nunito, system-ui',
          fontSize: 10,
        },
      },
    ],
  };

  return (
    <ChartCard
      title={t('Session-Type Distribution')}
      description={t('How your tagged sessions split across CO₂, O₂, comfort, PB, and recovery work. Untagged sessions are not counted.')}
    >
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
