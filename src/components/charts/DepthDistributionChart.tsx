/**
 * Depth Distribution — a dot plot: every dive is one dot, stacked in 1 m
 * columns at its max depth and coloured by discipline (Philipp, 2026-10-22).
 * Hover shows the dive, a click opens it. Dots size themselves to the card,
 * so a large logbook still fits; the stack in each column runs oldest at the
 * bottom so a discipline's colour stays grouped.
 * Warm-up / safety / excluded dives are filtered out upstream.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from './EChart';
import type { DepthDot } from '../../lib/analytics/depthInsights';
import { useChartTheme } from '../../lib/chartTheme';
import { useElementWidth } from '../../lib/divePage';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';
import { escapeHtml } from '../../lib/safeHtml';

interface Props {
  dots: DepthDot[];
}

const HEIGHT = 240;
const GRID = { left: 36, right: 12, top: 30, bottom: 30 };
/** Largest and smallest dot, px. */
const MAX_DOT = 9;
const MIN_DOT = 2;

interface Placed {
  dot: DepthDot;
  /** Column centre, m. */
  x: number;
  /** Position in the column's stack, 1-based. */
  y: number;
}

/** Stack the dots per 1 m column, grouped by discipline, oldest first. */
function place(dots: DepthDot[]): { placed: Placed[]; tallest: number } {
  const cols = new Map<number, DepthDot[]>();
  for (const d of dots) {
    const c = Math.floor(d.depth);
    const list = cols.get(c) ?? [];
    list.push(d);
    cols.set(c, list);
  }
  const placed: Placed[] = [];
  let tallest = 0;
  for (const [c, list] of cols) {
    list.sort((a, b) => a.discipline.localeCompare(b.discipline) || a.date.localeCompare(b.date));
    list.forEach((dot, i) => placed.push({ dot, x: c + 0.5, y: i + 1 }));
    if (list.length > tallest) tallest = list.length;
  }
  return { placed, tallest };
}

export function DepthDistributionChart({ dots }: Props) {
  const ct = useChartTheme();
  const t = useT();
  const navigate = useNavigate();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { placed, tallest } = useMemo(() => place(dots), [dots]);

  const option = useMemo(() => {
    let maxDepth = 0;
    let minDepth = Infinity;
    for (const d of dots) {
      if (d.depth > maxDepth) maxDepth = d.depth;
      if (d.depth < minDepth) minDepth = d.depth;
    }
    const xMax = Math.max(10, Math.ceil((maxDepth + 1) / 10) * 10);
    // Start at the shallowest dive's ten, so the columns get the room.
    const xMin = Number.isFinite(minDepth) ? Math.min(xMax - 10, Math.floor(minDepth / 10) * 10) : 0;
    // One dot fits its column's width and its share of the height.
    const colW = (Math.max(width, 200) - GRID.left - GRID.right) / (xMax - xMin);
    const rowH = (HEIGHT - GRID.top - GRID.bottom) / Math.max(tallest, 1);
    const size = Math.max(MIN_DOT, Math.min(MAX_DOT, colW * 0.9, rowH * 0.9));

    const byDisc = new Map<string, { color: string; data: unknown[] }>();
    for (const p of placed) {
      const entry = byDisc.get(p.dot.discipline) ?? { color: p.dot.color, data: [] };
      entry.data.push({ value: [p.x, p.y], dot: p.dot });
      byDisc.set(p.dot.discipline, entry);
    }
    return {
      animation: false,
      grid: GRID,
      legend: {
        top: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: ct.textDim, fontSize: 10 },
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: { data: { dot: DepthDot }; color: string }) => {
          const d = p.data.dot;
          return `<span style="color:${p.color}">●</span> ${escapeHtml(d.discipline)} · ${d.depth}m<br/>${new Date(d.date).toLocaleDateString()}`;
        },
      },
      xAxis: {
        type: 'value',
        min: xMin,
        max: xMax,
        interval: xMax - xMin > 60 ? 20 : 10,
        axisLine: { lineStyle: { color: ct.axisLine } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: ct.textDim, fontSize: 10, formatter: '{value}m' },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: Math.max(tallest, 1) + 0.5,
        show: false,
      },
      series: [...byDisc.entries()].map(([name, { color, data }]) => ({
        name,
        type: 'scatter',
        data,
        symbolSize: size,
        itemStyle: { color, opacity: 0.95 },
        emphasis: { scale: 1.8, itemStyle: { borderColor: '#ffffff', borderWidth: 1.5 } },
        cursor: 'pointer',
      })),
    };
  }, [dots, placed, tallest, width, ct]);

  const onEvents = useMemo(
    () => ({
      click: (p: { data?: { dot?: DepthDot } }) => {
        const d = p.data?.dot;
        if (d) navigate(`/session/${d.sessionId}/dive/${d.diveIdx}`);
      },
    }),
    [navigate],
  );

  if (dots.length === 0) {
    return (
      <ChartCard
        title={t('Depth Distribution')}
        description={t('How your dives are distributed across the depth range.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No depth dives in this backup yet.')}
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={t('Depth Distribution')}
      description={t('Each dot is one dive, stacked at its max depth. Click a dot to open the dive. Warm-ups and safeties are excluded.')}
    >
      <div ref={ref}>
        <ReactECharts option={option} onEvents={onEvents} style={{ height: HEIGHT }} notMerge />
      </div>
    </ChartCard>
  );
}
