/**
 * Mouthfill card — mouthfill factor (pressure ratio) and consistency.
 *
 * Each bar is the mean MF factor for dives whose charge depth falls in a
 * ±2 m bracket; the label shows the standard deviation within that bracket
 * (lower = more repeatable charge). Mirrors the mobile app's MF consistency.
 */
import ReactECharts from 'echarts-for-react';
import type { MouthfillStats } from '../../lib/analytics/technique';
import { useChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';

interface Props {
  stats: MouthfillStats;
}

export function MouthfillCard({ stats }: Props) {
  const ct = useChartTheme();
  const t = useT();

  if (stats.count === 0) {
    return (
      <ChartCard
        title={t('Mouthfill')}
        description={t('Mouthfill factor and how consistent your charge depth is.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No mouthfill charge depths logged yet. Add a charge depth to dives in the app to see this.')}
        </p>
      </ChartCard>
    );
  }

  const description = `${stats.count} ${stats.count === 1 ? t('dive with a logged mouthfill') : t('dives with a logged mouthfill')} · ${t('avg factor')} ${stats.avgFactor.toFixed(2)}× · ${t('avg reach')} ${stats.avgReachM.toFixed(1)} m.`;

  const option = {
    grid: { left: 40, right: 16, top: 16, bottom: 36, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const b = stats.brackets[p.dataIndex];
        return (
          `${t('Charge')} ~${b.bracketM} m<br/>` +
          `${t('mean factor')} <b>${b.mean.toFixed(2)}×</b><br/>` +
          `σ ${b.stdev.toFixed(2)} · n = ${b.count}`
        );
      },
    },
    xAxis: {
      type: 'category',
      data: stats.brackets.map((b) => `${b.bracketM} m`),
      name: t('charge depth'),
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: ct.textDim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: ct.textDim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: t('MF factor'),
      nameTextStyle: { color: ct.textDim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.textDim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: stats.brackets.map((b) => b.mean),
        itemStyle: { color: ct.accent, borderRadius: [3, 3, 0, 0] },
        barWidth: '60%',
        label: {
          show: true,
          position: 'top',
          color: ct.textDim,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          formatter: (p: any) => `σ${stats.brackets[p.dataIndex].stdev.toFixed(2)}`,
        },
      },
    ],
  };

  return (
    <ChartCard title={t('Mouthfill')} description={description}>
      <ReactECharts option={option} style={{ height: 300 }} notMerge />
      <p className="mt-2 text-xs text-textDim">
        {t('Factor = bottom pressure ÷ charge pressure. Lower σ within a bracket means a more repeatable charge depth.')}
      </p>
    </ChartCard>
  );
}
