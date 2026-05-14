/**
 * PoolOverlayChart — pool-dive comparison.
 *
 * Pool dives carry little profile data until the dedicated pool computer
 * ships, so the overlay is deliberately modest:
 *   - Heart rate vs dive time, one line per dive — only for dives that
 *     recorded HR.
 *   - Average speed (distance / dive time) as one horizontal bar per dive,
 *     so speed stays comparable even when no HR was recorded. Static dives
 *     (no distance) have no bar.
 *
 * When nothing is plottable the route still shows the stat table.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

export interface OverlayPoolDive {
  color: string;
  /** Unique series name — drives the legend. */
  label: string;
  /** [t, bpm] over dive time. Empty when no HR was recorded. */
  hrSeries: [number, number][];
  /** distance / diveTime, or null for static dives / missing distance. */
  avgSpeed: number | null;
}

interface Props {
  dives: OverlayPoolDive[];
}

const GRID = { left: 48, right: 16, top: 30, bottom: 24 };

export function PoolOverlayChart({ dives }: Props) {
  const hrDives = useMemo(() => dives.filter((d) => d.hrSeries.length >= 2), [dives]);
  const hrOption = useMemo(() => buildHrOption(hrDives), [hrDives]);

  const hasSpeed = dives.some((d) => d.avgSpeed != null);
  const maxSpeed = Math.max(0, ...dives.map((d) => d.avgSpeed ?? 0));

  if (hrDives.length === 0 && !hasSpeed) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
        The selected dives have no heart rate or distance recorded — see the
        comparison table below.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hrDives.length > 0 && (
        <>
          <PanelHeader label="Heart Rate" unit="bpm" />
          <ReactECharts
            option={hrOption}
            style={{ height: 260 }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
        </>
      )}

      {hasSpeed && (
        <>
          <PanelHeader label="Average speed" unit="m/s" />
          <div className="space-y-2 rounded-lg border border-border bg-panel p-4">
            {dives.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="w-44 shrink-0 truncate font-mono text-[11px] text-textDim">
                  {d.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-abyss">
                  {d.avgSpeed != null && maxSpeed > 0 && (
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${(d.avgSpeed / maxSpeed) * 100}%`,
                        backgroundColor: d.color,
                      }}
                    />
                  )}
                </div>
                <span className="w-20 shrink-0 text-right font-heading text-sm text-text">
                  {d.avgSpeed != null ? `${d.avgSpeed.toFixed(2)} m/s` : 'static'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({ label, unit }: { label: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {label}
      </h3>
      <span className="font-mono text-[10px] text-textDim opacity-60">{unit}</span>
    </div>
  );
}

function buildHrOption(dives: OverlayPoolDive[]) {
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const d of dives) {
    for (const [t] of d.hrSeries) {
      if (t < xMin) xMin = t;
      if (t > xMax) xMax = t;
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = 0;
    xMax = 0;
  }

  return {
    grid: GRID,
    animation: false,
    legend: {
      top: 0,
      textStyle: { color: '#9a9a9e', fontFamily: 'Inter, system-ui', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 6,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#101010',
      borderColor: '#262626',
      textStyle: { color: '#f4f4f5', fontFamily: 'Inter, system-ui', fontSize: 12 },
      axisPointer: { type: 'line' as const },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        const head = `t=${fmtSec(arr[0]?.value?.[0] ?? 0)}`;
        const lines = arr
          .filter((p: any) => p.value && p.value[1] != null)
          .map(
            (p: any) =>
              `<span style="color:${p.color}">●</span> ${p.seriesName}: ${(
                p.value[1] as number
              ).toFixed(0)} bpm`,
          );
        return [head, ...lines].join('<br/>');
      },
    },
    xAxis: {
      type: 'value',
      min: xMin,
      max: xMax,
      axisLabel: { formatter: (v: number) => fmtSec(v), color: '#9a9a9e', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262626' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#9a9a9e', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
    },
    series: dives.map((d) => ({
      name: d.label,
      type: 'line',
      data: d.hrSeries,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: d.color, width: 1.8 },
      itemStyle: { color: d.color },
    })),
  };
}

function fmtSec(s: number): string {
  const abs = Math.abs(Math.round(s));
  if (abs < 60) return `${abs}s`;
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
