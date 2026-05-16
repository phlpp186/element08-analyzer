/**
 * Min SpO₂ per Hold vs Hold Duration — one dot per Hold across all dry
 * sessions. X = hold length (s), Y = minimum SpO₂ during the hold plus
 * 30 s afterdrop window. Zone bands tint the y axis so the diver can
 * see at a glance which holds went deep.
 *
 * The tab-wide lung-volume filter is applied upstream; this chart is
 * just a visualiser.
 */
import ReactECharts from 'echarts-for-react';
import {
  SPO2_ZONES,
  type HoldMinSpo2Point,
} from '../../lib/analytics/holdTrends';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  points: HoldMinSpo2Point[];
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function MinSpo2VsDurationChart({ points }: Props) {
  const ct = useChartTheme();
  if (points.length === 0) {
    return (
      <ChartCard
        title="Min SpO₂ vs Hold Duration"
        description="Lowest SpO₂ per hold (including 30 s afterdrop) plotted against hold length."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No holds with usable SpO₂ data in this filter.
        </p>
      </ChartCard>
    );
  }

  let yMin = Infinity;
  let xMax = 0;
  for (const p of points) {
    if (p.minSpo2 < yMin) yMin = p.minSpo2;
    if (p.holdSec > xMax) xMax = p.holdSec;
  }
  yMin = Math.max(50, Math.floor((yMin - 2) / 5) * 5);
  const xMaxRounded = Math.ceil((xMax + 30) / 30) * 30;

  const zoneBands = SPO2_ZONES.filter((z) => z.to <= 101 && z.to > yMin).map((z) => [
    { yAxis: Math.max(z.from, yMin), itemStyle: { color: `${z.color}1a` } },
    { yAxis: Math.min(z.to, 100) },
  ]);
  const thresholds = SPO2_ZONES.filter((z) => z.from > 0 && z.from > yMin).map((z) => ({
    yAxis: z.from,
    lineStyle: { color: `${z.color}66`, type: 'dashed' as const, width: 1 },
  }));

  const data = points.map((p) => ({
    value: [p.holdSec, p.minSpo2],
    itemStyle: { color: p.color, opacity: 0.75 },
    p,
  }));

  const option = {
    grid: { left: 44, right: 16, top: 12, bottom: 36, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const point = p.data.p as HoldMinSpo2Point;
        const dateStr = new Date(point.date).toLocaleDateString();
        const lv = point.lungVol ?? '—';
        return (
          `<span style="color:${point.color}">●</span> Min SpO₂ ${point.minSpo2}%` +
          `<br/>${fmtSec(point.holdSec)} hold · ${lv}` +
          `<br/><span style="opacity:0.7">${dateStr} · ${point.sessionName}</span>`
        );
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: xMaxRounded,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: (v: number) => fmtSec(v),
      },
      splitLine: { show: false },
      name: 'hold duration',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: 100,
      interval: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine, opacity: 0.4 } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}%',
      },
    },
    series: [
      {
        type: 'scatter',
        data,
        symbolSize: 6,
        markArea: { silent: true, data: zoneBands },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          data: thresholds,
        },
        z: 3,
      },
    ],
  };

  return (
    <ChartCard
      title="Min SpO₂ vs Hold Duration"
      description={`Lowest SpO₂ per hold (incl. 30 s afterdrop) vs. hold length. ${points.length} hold${points.length === 1 ? '' : 's'} shown.`}
    >
      <ReactECharts option={option} style={{ height: 260 }} notMerge />
    </ChartCard>
  );
}
