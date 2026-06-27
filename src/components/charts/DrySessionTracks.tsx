/**
 * DrySessionTracks — synchronized SpO₂ + HR timeline for one dry
 * breath-hold session, plus a block strip below showing Rest / Hold /
 * Recover segments.
 *
 * Same crosshair-sync mechanism as the depth and pool players.
 *
 * Hold blocks are shaded behind the SpO₂ line to make the link between
 * hold-onset and saturation drop visible at a glance. Contraction taps
 * appear as red diamonds on the HR line at their logged time.
 */
import { useCallback, useMemo } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type { DryBlock, DrySessionData } from '../../lib/analytics/drySessionProfile';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';

type TFn = (s: string) => string;

interface Props {
  data: DrySessionData;
  groupId: string;
}

const GRID = { left: 56, right: 16, top: 10, bottom: 24 };
const AXIS_POINTER_LINK = [{ xAxisIndex: 'all' as const }];

const BLOCK_COLORS = {
  Rest:    { fill: 'rgba(79, 195, 247, 0.10)', label: '#4fc3f7' },
  Hold:    { fill: 'rgba(239, 83, 80, 0.14)',  label: '#ef5350' },
  Recover: { fill: 'rgba(102, 187, 106, 0.10)', label: '#66bb6a' },
} as const;

export function DrySessionTracks({ data, groupId }: Props) {
  const ct = useChartTheme();
  const t = useT();
  const holdBands = useMemo(
    () =>
      data.blocks
        .filter((b) => b.type === 'Hold')
        .map((b) => ({
          startT: b.startT,
          endT: b.endT,
          color: BLOCK_COLORS.Hold.fill,
        })),
    [data.blocks],
  );

  // Anchor contraction markers onto the HR series at the matching time
  // (or on a baseline if HR isn't available).
  const contractionMarks = useMemo(
    () =>
      data.contractions.map((c) => ({
        coord: pickValueAt(data.hrSeries, c.t) ?? [c.t, 0],
        symbol: 'diamond',
        symbolSize: 10,
        itemStyle: { color: '#ef5350' },
      })),
    [data.contractions, data.hrSeries],
  );

  const spo2Option = useMemo(
    () => buildLineOption({
      series: data.spo2Series,
      color: '#4fc3f7',
      unit: '%',
      startT: data.startT,
      endT: data.endT,
      bands: holdBands,
    }, ct),
    [data, holdBands, ct],
  );

  const hrOption = useMemo(
    () => buildLineOption({
      series: data.hrSeries,
      color: '#ff5f9e',
      unit: 'bpm',
      startT: data.startT,
      endT: data.endT,
      bands: holdBands,
      markPoints: contractionMarks,
    }, ct),
    [data, holdBands, contractionMarks, ct],
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
      {data.spo2Series.length >= 2 && (
        <>
          <TrackHeader label="SpO₂" unit="%" />
          <ReactECharts
            option={spo2Option}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {data.hrSeries.length >= 2 && (
        <>
          <TrackHeader
            label={t('Heart Rate')}
            unit="bpm"
            hint={data.contractions.length > 0 ? `${data.contractions.length} ${data.contractions.length === 1 ? t('contraction') : t('contractions')}` : undefined}
          />
          <ReactECharts
            option={hrOption}
            style={{ height: 180 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </>
      )}

      {data.blocks.length > 0 && (
        <>
          <TrackHeader label={t('Block Timeline')} unit={`${t('Rest')} / ${t('Hold')} / ${t('Recover')}`} />
          <BlockStrip blocks={data.blocks} startT={data.startT} endT={data.endT} t={t} />
        </>
      )}

      {!data.hasOxy && data.blocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center text-textDim">
          {t('No oximeter readings or block timeline recorded for this session.')}
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

/** Compact horizontal strip showing the block sequence. Pure DOM (no
 *  ECharts) because the data is so simple — one colored rectangle per
 *  block, width proportional to its duration. */
function BlockStrip({
  blocks,
  startT,
  endT,
  t,
}: {
  blocks: DryBlock[];
  startT: number;
  endT: number;
  t: TFn;
}) {
  const total = Math.max(endT - startT, 1);
  // The strip is offset by the chart grid's left axis (56px) + right
  // padding (16px) so that block boundaries line up vertically with the
  // shaded markAreas in the SpO2 and HR charts above. The values mirror
  // `GRID` at the top of this file — keep them in sync.
  return (
    <div className="rounded-md border border-border bg-panel py-3" style={{ paddingLeft: 56, paddingRight: 16 }}>
      <div className="flex h-8 overflow-hidden rounded">
        {blocks.map((b, i) => {
          const pct = ((b.endT - b.startT) / total) * 100;
          const c = BLOCK_COLORS[b.type];
          return (
            <div
              key={i}
              className="flex items-center justify-center border-r border-deep last:border-r-0"
              style={{ width: `${pct}%`, backgroundColor: c.fill }}
              title={`${t(b.type)} · ${fmtSec(b.endT - b.startT)}`}
            >
              {pct > 4 && (
                <span
                  className="font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: c.label }}
                >
                  {b.type[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-textDim">
        <span>{fmtSec(startT)}</span>
        <span>{fmtSec(endT)}</span>
      </div>
    </div>
  );
}

interface LineOptionParams {
  series: [number, number][];
  color: string;
  unit: string;
  startT: number;
  endT: number;
  bands?: { startT: number; endT: number; color: string }[];
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
        markArea: p.bands && p.bands.length > 0
          ? {
              silent: true,
              itemStyle: { opacity: 1 },
              // No name — the dedicated block strip below the charts is the
              // source of truth for block labels. Letting ECharts render a
              // name here clips against the chart's tight top padding.
              data: p.bands.map((b) => [
                { xAxis: b.startT, itemStyle: { color: b.color } },
                { xAxis: b.endT },
              ]),
            }
          : undefined,
        markPoint: p.markPoints && p.markPoints.length > 0
          ? { data: p.markPoints, label: { show: false } }
          : undefined,
      },
    ],
  };
}

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
