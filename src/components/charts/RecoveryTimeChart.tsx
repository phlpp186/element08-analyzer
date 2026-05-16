/**
 * Recovery Time per Hold — scatter of how long SpO₂ took to return to
 * within 1 % of the pre-hold baseline, plotted over time. A faster
 * recovery line trending down over the season is one of the cleanest
 * proxies for improving cardiovascular conditioning. Dot size encodes
 * hold length so very short comfortable holds don't dominate visually.
 */
import ReactECharts from 'echarts-for-react';
import type { RecoveryPoint } from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  points: RecoveryPoint[];
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function RecoveryTimeChart({ points }: Props) {
  const ct = useChartTheme();
  if (points.length === 0) {
    return (
      <ChartCard
        title="Recovery Time per Hold"
        description="Seconds for SpO₂ to climb back to within 1 % of pre-hold baseline."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No holds with usable SpO₂ recovery data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMax = 0;
  let holdMin = Infinity;
  let holdMax = 0;
  for (const p of points) {
    if (p.recoverySec > yMax) yMax = p.recoverySec;
    if (p.holdSec < holdMin) holdMin = p.holdSec;
    if (p.holdSec > holdMax) holdMax = p.holdSec;
  }
  const sizeFor = (holdSec: number) => {
    if (holdMax === holdMin) return 7;
    const t = (holdSec - holdMin) / (holdMax - holdMin);
    return 4 + t * 10;
  };

  const data = points.map((p) => ({
    value: [p.date, p.recoverySec],
    symbolSize: sizeFor(p.holdSec),
    p,
  }));

  const option = {
    grid: { left: 44, right: 16, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const point = p.data.p as RecoveryPoint;
        const dateStr = new Date(point.date).toLocaleDateString();
        return `<span style="color:${p.color}">●</span> Recovery<br/>${dateStr} · ${fmtSec(point.recoverySec)}<br/><span style="opacity:0.7">after a ${fmtSec(point.holdSec)} hold</span>`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: Math.ceil((yMax + 10) / 10) * 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => fmtSec(v),
      },
    },
    series: [
      {
        type: 'scatter',
        data,
        itemStyle: { color: '#00e5cc', opacity: 0.7 },
      },
    ],
  };

  return (
    <ChartCard
      title="Recovery Time per Hold"
      description="Seconds for SpO₂ to climb back to within 1 % of pre-hold baseline. Dot size = hold length."
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}
