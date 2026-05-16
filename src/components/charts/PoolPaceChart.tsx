/**
 * Pool Pace per Dive — pace progression (s/100m) per training dive over
 * time, one line per discipline. Lower = faster.
 */
import ReactECharts from 'echarts-for-react';
import type { PaceSeries } from '../../lib/analytics/poolPace';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  series: PaceSeries[];
}

function fmtPace(secsPer100m: number): string {
  const s = Math.round(secsPer100m);
  if (s < 60) return `${s}s/100m`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}/100m`;
}

export function PoolPaceChart({ series }: Props) {
  const ct = useChartTheme();
  if (series.length === 0) {
    return (
      <ChartCard
        title="Pace per Dive"
        description="Average pace per training dive. Lower is faster."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No pool dives with distance data in this backup yet.
        </p>
      </ChartCard>
    );
  }

  let yMin = Infinity;
  let yMax = 0;
  for (const s of series) for (const p of s.points) {
    if (p.pace < yMin) yMin = p.pace;
    if (p.pace > yMax) yMax = p.pace;
  }
  const pad = Math.max(2, (yMax - yMin) * 0.1);

  const option = {
    grid: { left: 56, right: 16, top: 30, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const [date, pace, meta] = p.value as [string, number, { distance: number; diveTime: number }];
        const dateStr = new Date(date).toLocaleDateString();
        return `<span style="color:${p.color}">●</span> ${p.seriesName}<br/>${dateStr} · ${fmtPace(pace)}<br/><span style="opacity:0.7">${meta.distance}m in ${Math.round(meta.diveTime)}s</span>`;
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      itemWidth: 14,
      itemHeight: 6,
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
      min: Math.max(0, Math.floor(yMin - pad)),
      max: Math.ceil(yMax + pad),
      inverse: true, // Lower pace = faster, so faster appears higher.
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => fmtPace(v),
      },
    },
    series: series.map((s) => ({
      name: s.discipline,
      type: 'line',
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 5,
      smooth: 0.2,
      data: s.points.map((p) => [p.date, p.pace, { distance: p.distance, diveTime: p.diveTime }]),
      lineStyle: { color: s.color, width: 2, opacity: 0.7 },
      itemStyle: { color: s.color },
    })),
  };

  return (
    <ChartCard
      title="Pace per Dive"
      description="Average pace per training dive, over time. Lower on the chart = faster."
    >
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </ChartCard>
  );
}
