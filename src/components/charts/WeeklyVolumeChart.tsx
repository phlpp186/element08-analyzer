/**
 * Weekly Volume — total training hours per week over the recent window.
 * One bar per week, dense (weeks with no training show as gaps at zero).
 */
import ReactECharts from 'echarts-for-react';
import type { WeekVolume } from '../../lib/analytics/balance';
import { ChartCard } from './ChartCard';

interface Props {
  data: WeekVolume[];
}

export function WeeklyVolumeChart({ data }: Props) {
  if (data.length === 0 || data.every((w) => w.minutes === 0)) {
    return (
      <ChartCard
        title="Weekly Volume"
        description="Total training hours per week."
      >
        <p className="py-8 text-center text-sm text-textDim">
          No session durations in this backup yet.
        </p>
      </ChartCard>
    );
  }

  const option = {
    grid: { left: 40, right: 16, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const w = data[p.dataIndex];
        return `Week of ${fmtWeek(w.weekStart)}<br/>${fmtHm(w.minutes)} · ${w.sessions} session${
          w.sessions === 1 ? '' : 's'
        }`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((w) => w.weekStart),
      axisLine: { lineStyle: { color: '#262626' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        // Sparse labels — every 4th week plus the last — keep 26 bars readable.
        interval: (idx: number) => idx % 4 === 0 || idx === data.length - 1,
        formatter: (val: string) => fmtWeek(val),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: {
        color: '#9a9a9e',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}h',
      },
    },
    series: [
      {
        type: 'bar',
        data: data.map((w) => Math.round((w.minutes / 60) * 10) / 10),
        itemStyle: { color: '#4fc3f7', borderRadius: [3, 3, 0, 0] },
        barWidth: '64%',
      },
    ],
  };

  return (
    <ChartCard
      title="Weekly Volume"
      description="Total training hours per week over the last 26 weeks. Shows how volume builds and tapers."
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}

/** "2026-05-04" → "May 4". */
function fmtWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** minutes → "1h 12m" / "47m". */
function fmtHm(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
