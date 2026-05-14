/**
 * PeriodHeatmap — week × metric grid for one Period.
 *
 * Visual: each cell is a colored rectangle whose intensity scales with
 * the value's fraction of the column max. Hovering surfaces the exact
 * value; the target week is highlighted with a left border.
 *
 * Why CSS grid instead of ECharts: this is a literal table with mixed
 * numeric and label cells. Hand-rolling the grid gives us perfect text
 * alignment, accessible cell semantics, and zero chart-library overhead
 * for what is effectively a styled <table>.
 */
import type { PeriodMatrix } from '../../lib/analytics/periodMatrix';
import { METRICS, type Metric } from '../../lib/analytics/periodCompare';

interface Props {
  matrix: PeriodMatrix;
}

export function PeriodHeatmap({ matrix }: Props) {
  const cellColumns = METRICS.length;
  // Grid template: 80px for the week label, then equal columns for metrics.
  const gridTemplate = `80px repeat(${cellColumns}, minmax(80px, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <div className="min-w-[640px]">
        {/* Header */}
        <div
          className="grid border-b border-border bg-abyss"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <HeaderCell label="Week" />
          {METRICS.map((m) => (
            <HeaderCell key={m.id} label={m.label} unit={m.unit} />
          ))}
        </div>

        {/* Rows */}
        {matrix.rows.map((row) => (
          <div
            key={row.weekOffset}
            className={[
              'grid border-b border-border last:border-b-0',
              row.isAnchorWeek ? 'border-l-2 border-l-accent bg-deep' : '',
            ].join(' ')}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex items-center px-3 py-2 font-mono text-xs text-textDim">
              {row.label}
            </div>
            {METRICS.map((m) => (
              <Cell
                key={m.id}
                value={row.values[m.id]}
                max={matrix.columnMax[m.id]}
                metricId={m.id}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-3 border-t border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          low
        </span>
        <div className="flex h-2 w-32 overflow-hidden rounded-full">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div
              key={v}
              className="h-full flex-1"
              style={{ backgroundColor: colorForFraction(v) }}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          high
        </span>
      </div>
    </div>
  );
}

function HeaderCell({ label, unit }: { label: string; unit?: string }) {
  return (
    <div className="border-l border-border px-3 py-2 first:border-l-0">
      <div className="font-mono text-[10px] uppercase tracking-widest text-textDim">
        {label}
      </div>
      {unit && (
        <div className="font-mono text-[9px] uppercase tracking-widest text-textDim opacity-50">
          {unit}
        </div>
      )}
    </div>
  );
}

function Cell({
  value,
  max,
  metricId,
}: {
  value: number;
  max: number;
  metricId: Metric;
}) {
  const fraction = max > 0 ? value / max : 0;
  const isZero = value === 0;
  return (
    <div
      className="border-l border-border px-3 py-2 first:border-l-0"
      style={{ backgroundColor: isZero ? 'transparent' : colorForFraction(fraction) }}
      title={`${formatValue(metricId, value)} (peak ${formatValue(metricId, max)})`}
    >
      <span
        className={[
          'font-mono text-sm',
          isZero ? 'text-textDim opacity-40' : 'text-text',
        ].join(' ')}
      >
        {formatValue(metricId, value)}
      </span>
    </div>
  );
}

/** Map [0..1] → hex color along a dim → accent ramp. The lowest value
 *  is nearly invisible (panel color) and the highest is the accent blue,
 *  matching the brand palette used elsewhere. */
function colorForFraction(f: number): string {
  // RGB lerp from #1a1a1a (panel) to #4fc3f7 (accent)
  const from = [0x1a, 0x1a, 0x1a];
  const to = [0x4f, 0xc3, 0xf7];
  const clamped = Math.max(0, Math.min(1, f));
  const r = Math.round(from[0] + (to[0] - from[0]) * clamped);
  const g = Math.round(from[1] + (to[1] - from[1]) * clamped);
  const b = Math.round(from[2] + (to[2] - from[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatValue(metric: Metric, v: number): string {
  if (v === 0) return '–';
  switch (metric) {
    case 'totalMinutes':
      if (v >= 60) {
        const h = Math.floor(v / 60);
        const m = Math.round(v % 60);
        return m === 0 ? `${h}h` : `${h}h ${m}m`;
      }
      return `${Math.round(v)}m`;
    case 'poolDistance':
    case 'maxDepth':
    case 'longestPoolDive':
      return `${v}m`;
    case 'longestHold': {
      // Stored as seconds → m:ss.
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    default:
      return `${v}`;
  }
}
