/**
 * Avg Speed Per Depth Band — grouped bars per band, one for descent and
 * one for ascent. Dive-level descentSpeed / ascentSpeed are bucketed by
 * the band the dive's max-depth fell into, then averaged.
 *
 * The band height is a user-controlled toggle (5 / 10 / 20 m) so the same
 * data set can be inspected coarse or fine.
 */
import ReactECharts from 'echarts-for-react';
import type { BandStep, SpeedBand } from '../../lib/analytics/depthInsights';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartCard } from './ChartCard';

interface Props {
  bands: SpeedBand[];
  step: BandStep;
  onStepChange: (s: BandStep) => void;
}

const DESCENT_COLOR = '#ffa726'; // amber — matches the depth player
const ASCENT_COLOR = '#ef5350'; // red

export function SpeedPerDepthBandChart({ bands, step, onStepChange }: Props) {
  const ct = useChartTheme();
  const controls = <StepPills value={step} onChange={onStepChange} />;

  if (bands.length === 0) {
    return (
      <ChartCard
        title="Avg Speed Per Depth Band"
        description="Average descent and ascent speed of dives that reached each band."
        controls={controls}
      >
        <p className="py-8 text-center text-sm text-textDim">
          Not enough depth dives with speeds yet.
        </p>
      </ChartCard>
    );
  }

  const labels = bands.map((b) => `${b.band}–${b.band + b.step}`);
  const option = {
    grid: { left: 40, right: 16, top: 28, bottom: 40, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Inter, system-ui' },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        const idx = arr[0]?.dataIndex ?? 0;
        const band = bands[idx];
        const head = `${band.band}–${band.band + band.step}m · ${band.count} dive${
          band.count === 1 ? '' : 's'
        }`;
        const lines = arr.map(
          (p: any) =>
            `<span style="color:${p.color}">●</span> ${p.seriesName}: ${(
              p.value as number
            ).toFixed(2)} m/s`,
        );
        return [head, ...lines].join('<br/>');
      },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      itemWidth: 12,
      itemHeight: 6,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      name: 'metres',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        formatter: '{value}',
      },
    },
    series: [
      {
        name: 'Descent',
        type: 'bar',
        data: bands.map((b) => round2(b.descentSpeed)),
        itemStyle: { color: DESCENT_COLOR, borderRadius: [3, 3, 0, 0] },
        barWidth: '36%',
        barGap: '15%',
      },
      {
        name: 'Ascent',
        type: 'bar',
        data: bands.map((b) => round2(b.ascentSpeed)),
        itemStyle: { color: ASCENT_COLOR, borderRadius: [3, 3, 0, 0] },
        barWidth: '36%',
      },
    ],
  };

  return (
    <ChartCard
      title="Avg Speed Per Depth Band"
      description="Average descent and ascent speed of dives whose max depth fell in each band. Needs at least two dives per band."
      controls={controls}
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}

function StepPills({
  value,
  onChange,
}: {
  value: BandStep;
  onChange: (s: BandStep) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
        Band
      </span>
      {([5, 10, 20] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={[
            'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
            value === s
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-textDim hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          {s}m
        </button>
      ))}
    </div>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;
