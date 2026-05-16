/**
 * Contractions per 30s band — histogram of contraction timestamps within
 * their parent Hold, bucketed by 30-second bands. Shows when in a typical
 * hold contractions tend to start (and how that distribution looks
 * across the diver's history).
 */
import ReactECharts from 'echarts-for-react';
import type { ContractionBand } from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  bands: ContractionBand[];
}

function fmtBand(from: number, to: number): string {
  const f = `${Math.floor(from / 60)}:${String(from % 60).padStart(2, '0')}`;
  const t = `${Math.floor(to / 60)}:${String(to % 60).padStart(2, '0')}`;
  return `${f}–${t}`;
}

export function ContractionsPerBandChart({ bands }: Props) {
  const ct = useChartTheme();
  if (bands.length === 0) {
    return (
      <ChartCard
        title="Contractions per 30s Band"
        description="When in a hold do contractions tend to start?"
      >
        <p className="py-8 text-center text-sm text-textDim">
          No contractions logged in this backup yet.
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
        const b = bands[p.dataIndex];
        return `${fmtBand(b.from, b.to)}<br/>${p.value} contraction${p.value === 1 ? '' : 's'}`;
      },
    },
    xAxis: {
      type: 'category',
      data: bands.map((b) => `${Math.floor(b.from / 60)}:${String(b.from % 60).padStart(2, '0')}`),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (val: string, idx: number) => (bands.length > 10 && idx % 2 !== 0 ? '' : val),
      },
      name: 'seconds into hold',
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
        data: bands.map((b) => b.count),
        itemStyle: { color: '#ff5f9e', borderRadius: [3, 3, 0, 0] },
        barWidth: '70%',
      },
    ],
  };

  return (
    <ChartCard
      title="Contractions per 30s Band"
      description="Aggregate count of recorded contractions by how far into the hold they fired."
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}
