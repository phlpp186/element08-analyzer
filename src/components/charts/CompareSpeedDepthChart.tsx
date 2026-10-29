/**
 * CompareSpeedDepthChart — the app's "speed vs depth" compare view on the web
 * (asked for 2026-10-24). Depth runs down the side, speed out from a centre
 * line: descent to the left, ascent to the right, one colour per dive. Hover
 * reads every dive's descent and ascent speed at that depth. With exactly two
 * dives, the difference every 5 m is printed beside the curves in the colour
 * of the faster dive, as in the app. An optional band marks 1 m/s either way.
 */
import { useMemo } from 'react';
import ReactECharts from './EChart';
import type { DepthDiveData } from '../../lib/analytics/diveProfile';
import {
  speedAtDepth,
  speedByDepth,
  speedDeltas,
  type SpeedByDepth,
} from '../../lib/analytics/speedByDepth';
import { useChartTheme, withAlpha, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { escapeHtml } from '../../lib/safeHtml';

export interface SpeedDepthDive {
  color: string;
  label: string;
  data: DepthDiveData;
  dive: {
    profile?: DepthDiveData['points'];
    depth: number;
    diveTime: number;
    descentTime?: number;
    hangTime?: number;
  };
}

/** Half-width of the shaded "controlled speed" band, m/s. */
const BAND_SPEED = 1;

export function CompareSpeedDepthChart({
  dives,
  showBand,
  height = 460,
}: {
  dives: SpeedDepthDive[];
  showBand: boolean;
  height?: number;
}) {
  const ct = useChartTheme();
  const t = useT();
  const curves = useMemo(() => dives.map((d) => speedByDepth(d.dive)), [dives]);
  const option = useMemo(
    () => buildOption(dives, curves, showBand, ct, t),
    [dives, curves, showBand, ct, t],
  );
  const fallback = dives.filter((_, i) => curves[i].fallback);
  return (
    <div>
      <ReactECharts option={option} style={{ height }} notMerge />
      {fallback.length > 0 && (
        <p className="mt-1 text-[11px] text-textDim">
          {t('Dashed: no depth profile recorded, drawn from the dive’s descent and ascent times.')}
        </p>
      )}
    </div>
  );
}

function buildOption(
  dives: SpeedDepthDive[],
  curves: SpeedByDepth[],
  showBand: boolean,
  ct: ChartTheme,
  t: (s: string) => string,
) {
  let maxSpeed = 0;
  let maxDepth = 1;
  for (const c of curves)
    for (const p of [...c.descent, ...c.ascent]) {
      if (p.spd > maxSpeed) maxSpeed = p.spd;
      if (p.depth > maxDepth) maxDepth = p.depth;
    }
  for (const d of dives) if (d.dive.depth > maxDepth) maxDepth = d.dive.depth;
  const twoUp = dives.length === 2;
  // Room either side for the two-dive delta labels.
  const xMax = Math.max(showBand ? BAND_SPEED * 1.15 : 0, maxSpeed) * (twoUp ? 1.45 : 1.1) || 1;
  const deltas = twoUp ? speedDeltas(curves[0], curves[1], maxDepth) : [];
  const fmt = (v: number) => v.toFixed(2);

  const lineSeries = dives.flatMap((d, i) => {
    const c = curves[i];
    const style = {
      color: d.color,
      width: 2.2,
      type: c.fallback ? ('dashed' as const) : ('solid' as const),
    };
    return [
      {
        name: d.label,
        type: 'line',
        showSymbol: false,
        smooth: false,
        lineStyle: style,
        itemStyle: { color: d.color },
        data: c.descent.map((p) => [-p.spd, p.depth]),
        ...(i === 0
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { color: ct.axisLine, type: 'solid', width: 1 },
                data: [{ xAxis: 0 }],
              },
              markArea: showBand
                ? {
                    silent: true,
                    itemStyle: { color: withAlpha(ct.green, 0.1) },
                    // The switch above the chart names the band; a label inside it
                    // crossed the curves on a narrow screen.
                    label: { show: false },
                    data: [[{ xAxis: -BAND_SPEED }, { xAxis: BAND_SPEED }]],
                  }
                : undefined,
            }
          : {}),
      },
      {
        name: d.label,
        type: 'line',
        showSymbol: false,
        smooth: false,
        lineStyle: style,
        itemStyle: { color: d.color },
        data: c.ascent.map((p) => [p.spd, p.depth]),
      },
    ];
  });

  // The two-dive differences, as labels pinned near each outer edge.
  const deltaSeries = twoUp
    ? [
        {
          type: 'scatter',
          silent: true,
          symbolSize: 0,
          tooltip: { show: false },
          data: deltas.flatMap((r) =>
            (['descent', 'ascent'] as const)
              .filter((side) => r[side] != null)
              .map((side) => {
                const v = r[side] as number;
                const even = Math.abs(v) < 0.005;
                return {
                  value: [side === 'descent' ? -xMax * 0.9 : xMax * 0.9, r.depth],
                  label: {
                    show: true,
                    formatter: even ? '=' : `+${fmt(Math.abs(v))}`,
                    color: even ? ct.textDim : v > 0 ? dives[0].color : dives[1].color,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: ct.fontFamily,
                  },
                };
              }),
          ),
        },
      ]
    : [];

  return {
    animation: false,
    grid: { left: 48, right: 16, top: 28, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        axis: 'y',
        lineStyle: { color: ct.textDim, type: 'dashed' },
      },
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontSize: 12 },
      formatter: (params: { axisValue?: number | string }[] | { axisValue?: number | string }) => {
        const p = Array.isArray(params) ? params[0] : params;
        const depth = Number(p?.axisValue);
        if (!Number.isFinite(depth)) return '';
        const rows = dives.map((d, i) => {
          const down = speedAtDepth(curves[i].descent, depth);
          const up = speedAtDepth(curves[i].ascent, depth);
          const v = (x: number | null) => (x == null ? '–' : fmt(x));
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${d.color};margin-right:6px"></span>${escapeHtml(d.label)}<br/><span style="opacity:.75;margin-left:14px">↓ ${v(down)} · ↑ ${v(up)} m/s</span>`;
        });
        return `<b>${depth.toFixed(1)} m</b><br/>${rows.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'value',
      min: -xMax,
      max: xMax,
      name: `← ${t('Descent')}   m/s   ${t('Ascent')} →`,
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: ct.textDim, fontSize: 11 },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        formatter: (v: number) => Math.abs(v).toFixed(1),
      },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      max: Math.ceil(maxDepth / 5) * 5,
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        formatter: (v: number) => `${v} m`,
      },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [...lineSeries, ...deltaSeries],
  };
}
