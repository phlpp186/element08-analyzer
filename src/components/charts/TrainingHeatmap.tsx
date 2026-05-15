/**
 * Training Days Heatmap — calendar grid of sessions per day across the
 * past year. Color intensity scales with session count.
 *
 * ECharts has a built-in calendar series that gives us GitHub-style
 * contribution graph visuals without bespoke layout code.
 */
import ReactECharts from 'echarts-for-react';
import type { HeatmapDay } from '../../lib/analytics/heatmap';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  series: HeatmapDay[];
}

export function TrainingHeatmap({ series }: Props) {
  const ct = useChartTheme();
  if (series.length === 0) {
    return (
      <ChartCard
        title="Training Days"
        description="Sessions per day, past year."
      >
        <p className="py-8 text-center text-sm text-textDim">No sessions yet.</p>
      </ChartCard>
    );
  }

  const start = series[0].date;
  const end = series[series.length - 1].date;
  const max = Math.max(...series.map((d) => d.count), 1);

  const option = {
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (p: any) => {
        const date = p.value[0];
        const count = p.value[1];
        return `${date}<br/>${count} session${count === 1 ? '' : 's'}`;
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max,
      inRange: {
        // Brand-aligned ramp: dim panel → bright accent
        color: [ct.splitLine, '#1f3a4d', '#2a5f7d', '#3a8cbf', '#4fc3f7'],
      },
    },
    calendar: {
      top: 20,
      left: 32,
      right: 8,
      cellSize: ['auto', 14],
      range: [start, end],
      orient: 'horizontal',
      splitLine: { show: false },
      itemStyle: {
        color: ct.tooltipBg,
        borderColor: '#080808',
        borderWidth: 2,
      },
      yearLabel: { show: false },
      monthLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        nameMap: [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        ],
      },
      dayLabel: {
        firstDay: 1, // Monday first
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 9,
        nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: series.map((d) => [d.date, d.count]),
      },
    ],
  };

  // Stats summary
  const total = series.reduce((sum, d) => sum + d.count, 0);
  const activeDays = series.filter((d) => d.count > 0).length;
  const longestStreak = (() => {
    let best = 0;
    let cur = 0;
    for (const d of series) {
      if (d.count > 0) {
        cur++;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }
    return best;
  })();

  return (
    <ChartCard
      title="Training Days"
      description="Sessions per day, past year."
    >
      <ReactECharts option={option} style={{ height: 180 }} notMerge />
      <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-center">
        <Stat label="Sessions" value={String(total)} />
        <Stat label="Active days" value={String(activeDays)} />
        <Stat label="Longest streak" value={`${longestStreak}d`} />
      </dl>
    </ChartCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-heading text-2xl tracking-wide text-text">{value}</dd>
      <dt className="mt-1 font-mono text-[10px] uppercase tracking-widest text-textDim">
        {label}
      </dt>
    </div>
  );
}
