/**
 * Pool Pace per Dive — pace (s/100m) per training dive over time. Every dive
 * is a faint dot; one line per discipline runs through each session's pace
 * (its total time over its total distance), so several dives on one day no
 * longer draw a vertical streak. Lines end in a label with the latest
 * session's pace. Lower = faster.
 */
import ReactECharts from './EChart';
import type { PacePoint, PaceSeries } from '../../lib/analytics/poolPace';
import { mixHex, useChartTheme, withAlpha } from '../../lib/chartTheme';
import { useT } from '../../i18n';
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

/** One point per session: its dives' combined pace. */
function sessionPace(points: PacePoint[]): { date: string; pace: number; dives: number }[] {
  const by = new Map<string, { time: number; dist: number; dives: number }>();
  for (const p of points) {
    const e = by.get(p.date) ?? { time: 0, dist: 0, dives: 0 };
    e.time += p.diveTime;
    e.dist += p.distance;
    e.dives += 1;
    by.set(p.date, e);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => ({ date, pace: (e.time / e.dist) * 100, dives: e.dives }));
}

/** A step for the pace axis that keeps about 4-6 labels apart. */
function paceStep(range: number): number {
  if (range <= 20) return 5;
  if (range <= 45) return 10;
  if (range <= 80) return 15;
  return 30;
}

export function PoolPaceChart({ series }: Props) {
  const ct = useChartTheme();
  const t = useT();
  if (series.length === 0) {
    return (
      <ChartCard
        title={t('Pace per Dive')}
        description={t('Average pace per training dive. Lower is faster.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No pool dives with distance data in this backup yet.')}
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
  const step = paceStep(yMax - yMin);
  const sessions = series.map((s) => ({ s, avg: sessionPace(s.points) }));
  const endLabel = (s: PaceSeries, avg: { pace: number }[]) =>
    `${s.discipline} ${fmtPace(avg[avg.length - 1].pace)}`;
  let labelChars = 0;
  for (const { s, avg } of sessions) labelChars = Math.max(labelChars, endLabel(s, avg).length);

  const option = {
    grid: { left: 64, right: 24 + labelChars * 6.5, top: 12, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text },
      formatter: (p: any) => {
        const dateStr = new Date(p.value[0]).toLocaleDateString();
        const head = `<span style="color:${p.color}">●</span> ${p.seriesName}<br/>${dateStr} · ${fmtPace(p.value[1])}`;
        const meta = p.data?.meta;
        if (meta?.distance != null) {
          return `${head}<br/><span style="opacity:0.7">${meta.distance}m ${t('in')} ${Math.round(meta.diveTime)}s</span>`;
        }
        return meta?.dives != null
          ? `${head}<br/><span style="opacity:0.7">${t('Session pace')} · ${meta.dives} ${t(meta.dives === 1 ? 'dive' : 'dives')}</span>`
          : head;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        hideOverlap: true,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      // Whole steps, so two labels can never land on top of each other.
      min: Math.max(0, Math.floor((yMin - step * 0.3) / step) * step),
      max: Math.ceil((yMax + step * 0.3) / step) * step,
      interval: step,
      inverse: true, // Lower pace = faster, so faster appears higher.
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine, type: 'dashed' } },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        formatter: (v: number) => fmtPace(v),
      },
    },
    // End labels of disciplines at a similar pace would overlap; shift them.
    labelLayout: { moveOverlap: 'shiftY' },
    series: sessions.flatMap(({ s, avg }) => [
      {
        name: s.discipline,
        type: 'scatter',
        symbolSize: 6,
        data: s.points.map((p) => ({
          value: [p.date, p.pace],
          meta: { distance: p.distance, diveTime: p.diveTime },
        })),
        itemStyle: { color: withAlpha(s.color, 0.35) },
        emphasis: { itemStyle: { color: s.color } },
      },
      {
        name: s.discipline,
        type: 'line',
        smooth: 0.25,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        data: avg.map((a) => ({ value: [a.date, a.pace], meta: { dives: a.dives } })),
        lineStyle: {
          color: s.color,
          width: 2.5,
          ...(ct.glow ? { shadowBlur: 10, shadowColor: withAlpha(s.color, 0.55) } : {}),
        },
        itemStyle: { color: ct.surface, borderColor: s.color, borderWidth: 2 },
        endLabel: {
          show: true,
          formatter: () => endLabel(s, avg),
          color: mixHex(s.color, '#000000', 0.78),
          backgroundColor: s.color,
          borderRadius: 6,
          padding: [3, 7],
          fontSize: 11,
          fontWeight: 700,
          distance: 8,
        },
      },
    ]),
  };

  return (
    <ChartCard
      title={t('Pace per Dive')}
      description={t('Each dot is a dive; the line is each session’s pace. Higher on the chart = faster.')}
    >
      <ReactECharts option={option} style={{ height: 260 }} notMerge />
    </ChartCard>
  );
}
