/**
 * SpO2 zones bar — horizontal bars showing time spent in each saturation
 * band. Colors track the in-app palette so screenshots feel consistent.
 *
 * Values come from spo2ExposureZones(). Sample counts are rendered as
 * approximate durations via fmtZoneDuration (≈ 1 Hz sample cadence in
 * dry sessions; the app treats them the same way).
 */
import ReactECharts from 'echarts-for-react';
import { fmtZoneDuration, type Spo2Zones } from '../../lib/analytics/spo2Zones';
import { ChartCard } from './ChartCard';

const BANDS = [
  { key: 'above89', label: '>89%',   color: '#4fc3f7' }, // ok / blue
  { key: 'n89_75',  label: '75–89%', color: '#ffd54f' }, // mild
  { key: 'n74_65',  label: '65–74%', color: '#ffa726' }, // moderate
  { key: 'n64_55',  label: '55–64%', color: '#ef5350' }, // severe
  { key: 'below55', label: '<55%',   color: '#b71c1c' }, // critical
] as const;

interface Props {
  zones: Spo2Zones;
}

export function SpO2ZonesChart({ zones }: Props) {
  const total = BANDS.reduce((sum, b) => sum + zones[b.key], 0);

  if (total === 0) {
    return (
      <ChartCard
        title="SpO₂ Exposure Zones"
        description="Total time at each SpO₂ level."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No oximeter data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const option = {
    grid: { left: 70, right: 80, top: 8, bottom: 24, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const samples = p.value as number;
        const pct = total > 0 ? ((samples / total) * 100).toFixed(1) : '0.0';
        return `${p.name}<br/>${fmtZoneDuration(samples)} · ${pct}%`;
      },
    },
    xAxis: {
      type: 'value',
      show: false,
    },
    yAxis: {
      type: 'category',
      data: BANDS.map((b) => b.label),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9a9a9e', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: BANDS.map((b) => ({
          value: zones[b.key],
          itemStyle: { color: b.color, borderRadius: 4 },
        })),
        barWidth: 18,
        label: {
          show: true,
          position: 'right',
          color: '#9a9a9e',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          formatter: (p: any) => fmtZoneDuration(p.value),
        },
      },
    ],
  };

  return (
    <ChartCard
      title="SpO₂ Exposure Zones"
      description="Total time at each SpO₂ level. Lower zones = stronger hypoxic exposure."
    >
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </ChartCard>
  );
}
