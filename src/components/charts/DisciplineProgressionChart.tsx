/**
 * Discipline Progression — running max depth over time, one step-line per
 * discipline. The line plateaus between PBs and steps up on each new PB.
 * Trailing segment extends to today so the current PB reads as a plateau.
 *
 * Each line ends in a label with its current best (no legend to decode), the
 * current PB is a large dot, earlier PBs are rings, and the discipline that
 * gained most this calendar year gets a "+N m in YEAR" badge (Philipp's
 * option A, 2026-10-22).
 */
import ReactECharts from './EChart';
import type { DisciplineSeries } from '../../lib/analytics/depthInsights';
import { mixHex, useChartTheme, withAlpha } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';
import { escapeHtml } from '../../lib/safeHtml';

interface Props {
  series: DisciplineSeries[];
}

export function DisciplineProgressionChart({ series }: Props) {
  const ct = useChartTheme();
  const t = useT();
  if (series.length === 0) {
    return (
      <ChartCard
        title={t('Discipline Progression')}
        description={t('Personal best depth over time, per discipline.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No depth dives in this backup yet.')}
        </p>
      </ChartCard>
    );
  }

  let yMax = 0;
  for (const s of series) for (const p of s.points) if (p.depth > yMax) yMax = p.depth;

  const yStep = yMax > 60 ? 20 : 10;
  const year = new Date().getFullYear();
  const best = biggestGain(series, year);
  const endLabel = (s: DisciplineSeries) => `${s.discipline} ${currentBest(s).depth}m`;
  // Room on the right for the longest end label.
  let labelChars = 0;
  for (const s of series) labelChars = Math.max(labelChars, endLabel(s).length);
  const ink = (c: string) => mixHex(c, '#000000', 0.78);

  const option = {
    grid: { left: 44, right: 24 + labelChars * 7, top: 30, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text },
      formatter: (p: any) => {
        const [date, depth] = p.value as [string, number];
        return `<span style="color:${p.color}">●</span> ${escapeHtml(p.seriesName)}<br/>${date} · ${depth.toFixed(1)}m`;
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
      min: 0,
      // A whole number of steps, so the top label never crowds the one below.
      max: Math.ceil((yMax + 4) / yStep) * yStep,
      interval: yStep,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine, type: 'dashed' } },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        formatter: '{value}m',
      },
    },
    // End labels of disciplines on a similar best would overlap; shift them.
    labelLayout: { moveOverlap: 'shiftY' },
    series: series.map((s) => {
      const cur = currentBest(s);
      return {
        name: s.discipline,
        type: 'line',
        step: 'end',
        showSymbol: true,
        symbol: 'circle',
        data: s.points.map((p, i) => {
          const value = [p.date, p.depth] as [string, number];
          // The trailing today-point only extends the plateau: no dot.
          if (i === cur.extension) return { value, symbolSize: 0 };
          if (i === cur.index) {
            return {
              value,
              symbolSize: 12,
              itemStyle: { color: s.color, borderColor: '#ffffff', borderWidth: 2 },
            };
          }
          return {
            value,
            symbolSize: 7,
            itemStyle: { color: ct.surface, borderColor: s.color, borderWidth: 2 },
          };
        }),
        lineStyle: {
          color: s.color,
          width: 2.5,
          // Set here rather than left to the chart finish, which skips the
          // glow above four series; a handful of steps costs nothing.
          ...(ct.glow ? { shadowBlur: 10, shadowColor: withAlpha(s.color, 0.55) } : {}),
        },
        itemStyle: { color: s.color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(s.color, 0.16) },
              { offset: 1, color: withAlpha(s.color, 0) },
            ],
          },
        },
        endLabel: {
          show: true,
          formatter: () => endLabel(s),
          color: ink(s.color),
          backgroundColor: s.color,
          borderRadius: 6,
          padding: [3, 7],
          fontSize: 11,
          fontWeight: 700,
          distance: 8,
        },
        markPoint:
          best && best.discipline === s.discipline
            ? {
                silent: true,
                data: [
                  {
                    coord: [best.from.date, best.from.depth],
                    symbol: 'roundRect',
                    symbolSize: [best.label(t).length * 6.4 + 16, 20],
                    symbolOffset: [0, -22],
                    itemStyle: { color: ct.amber },
                    label: {
                      formatter: () => best.label(t),
                      color: ink(ct.amber),
                      fontSize: 10,
                      fontWeight: 700,
                    },
                  },
                ],
              }
            : undefined,
      };
    }),
  };

  return (
    <ChartCard
      title={t('Discipline Progression')}
      description={t('Personal best depth over time, per discipline. Each dot is a new PB; the line plateaus until the next one.')}
    >
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </ChartCard>
  );
}

/** The current PB of a series: its last real point, and the index of the
 *  trailing today-point that only extends the plateau (-1 when the PB is
 *  today). A PB is always deeper than the one before, so two equal depths at
 *  the end mean the last one is that extension. */
function currentBest(s: DisciplineSeries): { index: number; extension: number; depth: number } {
  const n = s.points.length;
  const extended = n >= 2 && s.points[n - 1].depth === s.points[n - 2].depth;
  const index = extended ? n - 2 : n - 1;
  return { index, extension: extended ? n - 1 : -1, depth: s.points[index].depth };
}

/** The discipline that gained most in `year`: from its best before the year
 *  (or its first PB of the year, when it started then) to its current best.
 *  Null when nothing improved this year. */
function biggestGain(series: DisciplineSeries[], year: number) {
  let best: {
    discipline: string;
    gain: number;
    from: { date: string; depth: number };
    label: (t: (s: string) => string) => string;
  } | null = null;
  for (const s of series) {
    const cur = currentBest(s);
    const pbs = s.points.slice(0, cur.index + 1);
    const before = pbs.filter((p) => Number(p.date.slice(0, 4)) < year);
    const during = pbs.filter((p) => Number(p.date.slice(0, 4)) === year);
    if (during.length === 0) continue;
    const base = before.length > 0 ? before[before.length - 1] : during[0];
    const gain = Math.round(cur.depth - base.depth);
    if (gain >= 1 && (!best || gain > best.gain)) {
      best = {
        discipline: s.discipline,
        gain,
        // The badge sits over the year's first step up.
        from: during[0],
        label: (t) =>
          `${s.discipline} ${t('+{gain}m in {year}').replace('{gain}', String(gain)).replace('{year}', String(year))}`,
      };
    }
  }
  return best;
}
