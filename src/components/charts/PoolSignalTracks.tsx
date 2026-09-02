/**
 * PoolSignalTracks — the motion signal of one pool dive, stacked on a shared
 * time axis, the way the mobile app's trace editor draws it:
 *
 *   |ACCEL|   push-offs and strokes as spikes
 *   |GYRO|    stroke rhythm
 *   HEADING   turns as steps
 *   MAG       the magnetometer heading, FIT imports only
 *
 * Read-only: the coach sees what the diver confirmed, and cannot edit it.
 *
 * TURNS run the FULL height, through every channel, because a turn shows up in
 * all three at once (push-off in accel, rotation in gyro, step in heading) and
 * reading them against each other is the entire point of stacking. The app
 * learned this the hard way — its turn marks used to stop above the heading
 * band, which is where a turn is most legible. SOLID is the diver's own mark;
 * DASHED is the detector's proposal on a dive nobody has corrected yet, so a
 * coach can tell "he swam this" from "a detector thinks he swam this".
 *
 * STROKES AND KICKS stay on the rotation band, where rhythm lives. The app
 * draws them full height, but the app is an EDITOR — the diver is placing one
 * mark at a time and needs it against every channel. Here you are reading, and
 * a 50 m DNF is twenty-odd strokes: full height, they are a picket fence with a
 * signal somewhere behind it. Neutral rather than red, so they stay quiet
 * against three already-coloured channels.
 *
 * Own chart group, never the HR one: these seconds are window-relative and the
 * HR track's are dive-relative (see poolTrace).
 */
import { useCallback, useMemo } from 'react';
import * as echarts from 'echarts/core';
import ReactECharts from 'echarts-for-react';
import type { PoolTraceData } from '../../lib/analytics/poolTrace';
import { useChartTheme, withAlpha, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';

interface Props {
  data: PoolTraceData;
  /** Unique chart-group id, distinct from the dive's HR group. */
  groupId: string;
}

const GRID = { left: 56, right: 16, top: 8, bottom: 22 };

export function PoolSignalTracks({ data, groupId }: Props) {
  const ct = useChartTheme();
  const t = useT();

  const line = useCallback(
    (x: number, color: string, dashed: boolean, opacity: number, width = 1.5) => ({
      xAxis: x,
      lineStyle: {
        color,
        width,
        opacity,
        type: dashed ? ('dashed' as const) : ('solid' as const),
      },
      label: { show: false },
    }),
    [],
  );

  // Turns: the same set on every channel, which is what makes them read as one
  // line down the stack.
  const turnLines = useMemo(
    () =>
      data.turns.map((x) => line(x, ct.green, !data.confirmed, data.confirmed ? 0.95 : 0.7)),
    [data.turns, data.confirmed, ct, line],
  );

  // Strokes and kicks: rotation band only, thin and quiet, so twenty of them
  // annotate the rhythm instead of erasing it.
  const rhythmLines = useMemo(
    () => [
      ...data.strokes.map((x) => line(x, ct.text, false, 0.3, 1)),
      ...data.kicks.map((x) => line(x, ct.text, true, 0.4, 1)),
    ],
    [data.strokes, data.kicks, ct, line],
  );

  // Window padding, shaded out. The watch brackets a dive loosely with the
  // button press; this is the diver saying where the dive really was.
  const markAreas = useMemo(() => {
    if (!data.bracket) return [];
    const shade = { color: withAlpha(ct.accent, 0.06) };
    return [
      [{ xAxis: data.startT, itemStyle: shade }, { xAxis: data.bracket.start }],
      [{ xAxis: data.bracket.end, itemStyle: shade }, { xAxis: data.endT }],
    ];
  }, [data.bracket, data.startT, data.endT, ct]);

  const tracks = useMemo(
    () =>
      [
        { key: 'accel', label: t('Acceleration'), unit: 'g', series: data.accel, color: ct.accent, marks: turnLines },
        { key: 'gyro', label: t('Rotation'), unit: '°/s', series: data.gyro, color: ct.amber, marks: [...turnLines, ...rhythmLines] },
        { key: 'heading', label: t('Heading'), unit: '°', series: data.heading, color: ct.highlight, marks: turnLines },
        { key: 'mag', label: t('Compass heading'), unit: '°', series: data.magHeading, color: ct.highlight, marks: turnLines },
      ].filter((tr) => tr.series.length >= 2),
    [data, ct, t, turnLines, rhythmLines],
  );

  const handleReady = useCallback(
    (chart: { group?: string }) => {
      chart.group = groupId;
      echarts.connect(groupId);
    },
    [groupId],
  );

  if (tracks.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
          {t('Motion trace')}
        </h3>
        <span className="font-mono text-[10px] text-textDim opacity-60">
          {data.confirmed ? t('diver-confirmed marks') : t("detector's marks, uncorrected")}
        </span>
        {data.headingSource === 'gyro' && data.magHeading.length === 0 && (
          <span className="font-mono text-[10px] text-textDim opacity-50">
            · {t('heading is integrated gyro, so it drifts')}
          </span>
        )}
      </div>

      <Legend data={data} ct={ct} t={t} />

      {tracks.map((tr) => (
        <div key={tr.key}>
          <div className="flex items-baseline gap-3 px-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-textDim">
              {tr.label}
            </span>
            <span className="font-mono text-[10px] text-textDim opacity-60">{tr.unit}</span>
          </div>
          <ReactECharts
            option={buildSignalOption(
              {
                series: tr.series,
                color: tr.color,
                unit: tr.unit,
                startT: data.startT,
                endT: data.endT,
                markLines: tr.marks,
                markAreas,
              },
              ct,
            )}
            style={{ height: 110 }}
            opts={{ renderer: 'canvas' }}
            onChartReady={handleReady}
            notMerge
          />
        </div>
      ))}
    </div>
  );
}

function Legend({
  data,
  ct,
  t,
}: {
  data: PoolTraceData;
  ct: ChartTheme;
  t: (s: string) => string;
}) {
  const items: { color: string; dashed: boolean; label: string }[] = [];
  if (data.turns.length > 0) {
    items.push({
      color: ct.green,
      dashed: !data.confirmed,
      label: `${data.turns.length} ${data.turns.length === 1 ? t('turn') : t('turns')}`,
    });
  }
  if (data.strokes.length > 0) {
    items.push({ color: ct.text, dashed: false, label: `${data.strokes.length} ${t('strokes')}` });
  }
  if (data.kicks.length > 0) {
    items.push({ color: ct.text, dashed: true, label: `${data.kicks.length} ${t('kicks')}` });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 font-mono text-[10px] text-textDim">
          <span
            aria-hidden
            style={{
              width: 14,
              height: 0,
              borderTopWidth: 2,
              borderTopStyle: it.dashed ? 'dashed' : 'solid',
              borderTopColor: it.color,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

interface SignalOptionParams {
  series: [number, number][];
  color: string;
  unit: string;
  startT: number;
  endT: number;
  markLines: unknown[];
  markAreas: unknown[];
}

function buildSignalOption(p: SignalOptionParams, ct: ChartTheme) {
  return {
    grid: GRID,
    animation: false,
    // Linked to the OTHER SIGNAL TRACKS only (see the group id above): one
    // crosshair down the stack is how a turn is read across three channels.
    axisPointer: { link: [{ xAxisIndex: 'all' as const }], lineStyle: { color: p.color, opacity: 0.4 } },
    tooltip: {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui', fontSize: 12 },
      trigger: 'axis' as const,
      axisPointer: { type: 'line' as const },
      formatter: (params: unknown) => {
        const point = Array.isArray(params) ? params[0] : params;
        const value = (point as { value?: [number, number] })?.value;
        if (!value) return '';
        const [x, v] = value;
        return `t=${fmtSec(x)}<br/>${v.toFixed(2)} ${p.unit}`;
      },
    },
    xAxis: {
      type: 'value' as const,
      min: p.startT,
      max: p.endT,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: ct.textDim, fontSize: 10 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      scale: true,
      axisLabel: { color: ct.textDim, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        type: 'line' as const,
        data: p.series,
        showSymbol: false,
        // A 5 Hz channel over a long dive is thousands of points; lttb keeps
        // the spikes (which ARE the signal) while drawing a fraction of them.
        sampling: 'lttb' as const,
        lineStyle: { color: p.color, width: 1.2 },
        markLine:
          p.markLines.length > 0
            ? { silent: true, symbol: 'none' as const, data: p.markLines }
            : undefined,
        markArea: p.markAreas.length > 0 ? { silent: true, data: p.markAreas } : undefined,
      },
    ],
  };
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
