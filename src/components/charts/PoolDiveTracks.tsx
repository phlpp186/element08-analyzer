/**
 * PoolDiveTracks — synchronized multi-track timeline for a single pool
 * dive. Same crosshair-sync mechanism as DepthDiveTracks (echarts.connect)
 * but the track set is different:
 *
 *   1. HEART RATE  — always shown when ≥2 HR points. Vertical lap markers
 *                    overlaid. Contractions marked as red dots on the line.
 *   2. DEPTH       — only when the dive carries depth data (some dive
 *                    computers record pool depth too).
 *   3. SPEED       — only when speed samples are present.
 *
 * No depth alarms here (pool sessions don't use them); for pace coaching
 * we surface lap markers as bright vertical lines with labels (L1, L2, ...).
 */
import { useCallback, useMemo } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type { PoolDiveData } from '../../lib/analytics/poolDiveProfile';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';

interface Props {
  data: PoolDiveData;
  /** Unique chart-group id (stable across re-renders for the same dive). */
  groupId: string;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

export function PoolDiveTracks({ data, groupId }: Props) {
  const ct = useChartTheme();
  const t = useT();
  const lapLines = useMemo(
    () =>
      data.lapEndTimes.map((t, i) => ({
        xAxis: t,
        label: {
          formatter: `L${i + 1}`,
          color: '#00e5cc',
          fontSize: 10,
          position: 'insideEndTop' as const,
        },
        lineStyle: { color: '#00e5cc', type: 'solid' as const, width: 1, opacity: 0.5 },
      })),
    [data.lapEndTimes],
  );

  const contractionMarks = useMemo(
    () =>
      data.contractionTimes.map((t) => ({
        coord: pickValueAt(data.hrSeries, t) ?? [t, 0],
        symbol: 'pin',
        symbolSize: 14,
        itemStyle: { color: '#ef5350' },
      })),
    [data.contractionTimes, data.hrSeries],
  );

  const hrOption = useMemo(
    () => buildLineOption({
      series: data.hrSeries,
      color: '#ff5f9e',
      unit: 'bpm',
      startT: data.startT,
      endT: data.endT,
      markLines: lapLines,
      markPoints: contractionMarks,
    }, ct),
    [data, lapLines, contractionMarks, ct],
  );

  const depthOption = useMemo(
    () => buildLineOption({
      series: data.depthSeries,
      color: '#4fc3f7',
      unit: 'm',
      startT: data.startT,
      endT: data.endT,
      inverseY: true,
      markLines: lapLines,
    }, ct),
    [data, lapLines, ct],
  );

  const speedOption = useMemo(
    () => buildLineOption({
      series: data.speedSeries,
      color: '#ffa726',
      unit: 'm/s',
      startT: data.startT,
      endT: data.endT,
      markLines: lapLines,
    }, ct),
    [data, lapLines, ct],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      echarts.connect(groupId);
    },
    [groupId],
  );

  return (
    <div className="space-y-4">
      {data.hasHR && (
        <>
          <TrackHeader label={t('Heart Rate')} unit="bpm" hint={data.contractionTimes.length > 0 ? `${data.contractionTimes.length} ${data.contractionTimes.length === 1 ? t('contraction') : t('contractions')} ${t('marked')}` : undefined} />
          <ReactECharts
            option={hrOption}
            style={{ height: 200 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {data.hasDepth && (
        <>
          <TrackHeader label={t('Depth')} unit="m" />
          <ReactECharts
            option={depthOption}
            style={{ height: 160 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {data.hasSpeed && (
        <>
          <TrackHeader label={t('Speed')} unit="m/s" />
          <ReactECharts
            option={speedOption}
            style={{ height: 140 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}
      {!data.hasHR && !data.hasDepth && !data.hasSpeed && (
        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center text-textDim">
          {t('No profile data recorded for this dive.')}
        </div>
      )}
    </div>
  );
}

function TrackHeader({ label, unit, hint }: { label: string; unit: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {label}
      </h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">{unit}</span>
      {hint && (
        <span className="font-mono text-[10px] text-textDim opacity-50">· {hint}</span>
      )}
    </div>
  );
}

interface LineOptionParams {
  series: [number, number][];
  color: string;
  unit: string;
  startT: number;
  endT: number;
  inverseY?: boolean;
  markLines?: any[];
  markPoints?: any[];
}

function buildLineOption(p: LineOptionParams, ct: ChartTheme) {
  const empty = p.series.length < 2;
  return {
    grid: GRID,
    animation: false,
    axisPointer: { link: AXIS_POINTER_LINK, lineStyle: { color: p.color, opacity: 0.4 } },
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui', fontSize: 12 },
      trigger: 'axis',
      axisPointer: { type: 'line' as const },
      formatter: (params: any) => {
        if (empty) return '';
        const point = Array.isArray(params) ? params[0] : params;
        const [t, v] = point.value as [number, number];
        return `t=${fmtSec(t)}<br/>${typeof v === 'number' ? v.toFixed(1) : v} ${p.unit}`;
      },
    },
    xAxis: {
      type: 'value',
      min: p.startT,
      max: p.endT,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: p.inverseY,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        type: 'line',
        data: p.series,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color: p.color, width: 1.8 },
        markLine: p.markLines && p.markLines.length > 0
          ? { silent: true, symbol: 'none', data: p.markLines }
          : undefined,
        markPoint: p.markPoints && p.markPoints.length > 0
          ? { data: p.markPoints, label: { show: false } }
          : undefined,
      },
    ],
  };
}

/** Find the series y-value at or just past the given x — used to anchor
 *  a marker (e.g. contraction) onto the rendered line. Returns null when
 *  the series is empty or doesn't cover that x yet. */
function pickValueAt(series: [number, number][], x: number): [number, number] | null {
  if (series.length === 0) return null;
  for (let i = 0; i < series.length; i++) {
    if (series[i][0] >= x) return [x, series[i][1]];
  }
  return [x, series[series.length - 1][1]];
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
