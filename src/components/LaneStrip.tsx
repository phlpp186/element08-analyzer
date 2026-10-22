/**
 * LaneStrip — the pool dive as its lengths, one block each over the chart
 * below it: the swim direction, the split and the pace per 100 m, coloured
 * as the chart's lap bands (fastest green, slowest amber). It shares the
 * chart's plot margins so every block sits over its lap.
 */
import { lapBounds, lapColors, lapSplitSeconds } from '../lib/analytics/lapColors';
import { mixHex, useChartTheme } from '../lib/chartTheme';
import { fmtSec } from '../lib/divePage';

/** The pool chart's plot margins (PoolDiveTracks GRID). */
const PLOT = { left: 56, right: 16 };

export function LaneStrip({
  lapEndTimes,
  lapSeconds,
  startT,
  endT,
  distance,
}: {
  lapEndTimes: number[];
  /** The stored splits, quoted on the blocks. */
  lapSeconds: number[];
  startT: number;
  endT: number;
  /** The dive's distance, for the pace of each (equal) length. */
  distance: number | null;
}) {
  const ct = useChartTheme();
  const bounds = lapBounds(lapEndTimes, startT, endT);
  const span = endT - startT;
  if (bounds.length < 2 || span <= 0) return null;
  const secs = lapSplitSeconds(bounds, lapSeconds);
  const colors = lapColors(secs, ct);
  const length = distance != null && distance > 0 ? distance / bounds.length : null;

  return (
    <div className="flex gap-0.5" style={{ marginLeft: PLOT.left, marginRight: PLOT.right }}>
      {bounds.map(([a, b], i) => {
        const share = (b - a) / span;
        const c = colors[i];
        return (
          <div
            key={i}
            className="flex h-8 min-w-0 items-center justify-between gap-1 overflow-hidden rounded-md px-2 font-num text-xs font-bold"
            style={{
              width: `${share * 100}%`,
              background: c,
              borderBottom: `3px solid ${mixHex(c, '#000000', 0.35)}`,
              color: mixHex(c, '#000000', 0.78),
            }}
            title={`${secs[i].toFixed(1)}s`}
          >
            {/* Out and back: odd lengths away from the start wall. */}
            <span className="whitespace-nowrap">
              {i % 2 === 0 ? '▶' : '◀'} {secs[i].toFixed(1)}s
            </span>
            {length != null && share > 0.16 && (
              <span className="whitespace-nowrap text-[10px] opacity-80">
                {fmtSec((secs[i] / length) * 100)}/100m
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
