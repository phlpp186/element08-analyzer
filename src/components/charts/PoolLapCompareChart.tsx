/**
 * PoolLapCompareChart — the same lap, dive against dive.
 *
 * Grouped bars: one cluster per lap, one bar per selected dive in its slot
 * colour. Where the dive carries diver-confirmed strokes, a second panel
 * repeats the layout with strokes per lap, and the two read together: a lap
 * that got slower on FEWER strokes is a diver losing propulsion, a lap that got
 * slower on MORE is a diver losing efficiency, and the total time says neither.
 *
 * Deliberately NOT normalised or padded. Dives with different lap counts sit
 * side by side with gaps where one of them ended, because a 100 m and a 75 m
 * are a legitimate comparison for the first three laps and inventing a fourth
 * for the shorter one would be a lie about the swim.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import type { LapSplit } from '../../lib/analytics/lapSplits';

export interface LapCompareDive {
  color: string;
  label: string;
  laps: LapSplit[];
}

interface Props {
  dives: LapCompareDive[];
}

export function PoolLapCompareChart({ dives }: Props) {
  const ct = useChartTheme();
  const t = useT();

  const withLaps = useMemo(() => dives.filter((d) => d.laps.length > 0), [dives]);
  const maxLaps = useMemo(
    () => withLaps.reduce((m, d) => Math.max(m, d.laps.length), 0),
    [withLaps],
  );
  const anyStrokes = useMemo(
    () => withLaps.some((d) => d.laps.some((l) => l.strokes != null)),
    [withLaps],
  );

  const categories = useMemo(
    () => Array.from({ length: maxLaps }, (_, i) => `L${i + 1}`),
    [maxLaps],
  );

  const timeOption = useMemo(
    () =>
      buildBarOption(
        withLaps.map((d) => ({
          name: d.label,
          color: d.color,
          // ECharts skips a null, which is what leaves the gap where a shorter
          // dive ended rather than drawing it as a zero-second lap.
          data: categories.map((_, i) => d.laps[i]?.seconds ?? null),
        })),
        categories,
        's',
        ct,
      ),
    [withLaps, categories, ct],
  );

  const strokeOption = useMemo(
    () =>
      buildBarOption(
        withLaps.map((d) => ({
          name: d.label,
          color: d.color,
          data: categories.map((_, i) => d.laps[i]?.strokes ?? null),
        })),
        categories,
        '',
        ct,
      ),
    [withLaps, categories, ct],
  );

  if (withLaps.length === 0 || maxLaps === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-10 text-center text-sm text-textDim">
        {t('No lap splits on these dives. A dynamic gets them from the watch, or from the turns you enter in the logbook.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
          {t('Lap times')} <span className="opacity-60">· s</span>
        </h3>
        <ReactECharts option={timeOption} style={{ height: 260 }} opts={{ renderer: 'canvas' }} notMerge />
      </div>
      {anyStrokes && (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
            {t('Strokes per lap')}{' '}
            <span className="opacity-60">· {t('diver-confirmed only')}</span>
          </h3>
          <ReactECharts
            option={strokeOption}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
        </div>
      )}
    </div>
  );
}

interface BarSeries {
  name: string;
  color: string;
  data: (number | null)[];
}

function buildBarOption(series: BarSeries[], categories: string[], unit: string, ct: ChartTheme) {
  return {
    animation: false,
    grid: { left: 48, right: 16, top: 34, bottom: 24 },
    legend: {
      top: 0,
      textStyle: { color: ct.textDim, fontFamily: 'Nunito, system-ui', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui', fontSize: 12 },
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      valueFormatter: (v: number | null) =>
        v == null ? '–' : `${Number(v).toFixed(unit === 's' ? 1 : 0)}${unit}`,
    },
    xAxis: {
      type: 'category' as const,
      data: categories,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: series.map((s) => ({
      type: 'bar' as const,
      name: s.name,
      data: s.data,
      itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] as [number, number, number, number] },
      barMaxWidth: 28,
    })),
  };
}
