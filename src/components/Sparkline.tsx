/**
 * Sparkline — a tiny inline SVG profile for a dive row, so a diver can pick
 * the interesting dive without opening each one. No ECharts: this renders
 * hundreds of times in a long session list, so it stays a single cheap path.
 *
 * `invert` flips the y-axis for depth profiles (deeper = lower).
 */
import { useChartTheme } from '../lib/chartTheme';

export function Sparkline({
  values,
  invert = false,
  color,
  width = 96,
  height = 34,
}: {
  values: number[];
  invert?: boolean;
  /** Line/fill colour; defaults to the theme accent. */
  color?: string;
  width?: number;
  height?: number;
}) {
  const ct = useChartTheme();
  const stroke = color ?? ct.accent;
  if (values.length < 2) return <div style={{ width, height }} aria-hidden />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const pad = 2;
  const innerH = height - pad * 2;

  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * width;
    const norm = (v - min) / span; // 0..1
    const y = invert ? pad + norm * innerH : pad + (1 - norm) * innerH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="shrink-0"
    >
      <path d={area} fill={stroke} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
