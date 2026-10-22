/**
 * SpeedBands: the per-depth-band pacing table and its band-size switch. The
 * numbers (and the conventions behind them: hangs excluded, split at the
 * deepest sample, partial last band) live in lib/analytics/speedBands.
 */
import {
  bandLabel,
  bandSpeed,
  type BandRow,
  type BandSize,
  type PhaseAgg,
} from '../lib/analytics/speedBands';
import { useT } from '../i18n';
import { pillCls } from '../lib/divePage';

function fmtTime(s: number): string {
  if (s < 60) return `${s.toFixed(1).replace(/\.0$/, '')}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Band-size switch; lives in the dive page's control row. */
export function BandSizePicker({
  size,
  onSize,
}: {
  size: BandSize;
  onSize: (s: BandSize) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
        {t('Band')}
      </span>
      {([5, 10, 20] as const).map((s) => (
        <button
          key={s}
          onClick={() => onSize(s)}
          className={pillCls(size === s)}
        >
          {s}m
        </button>
      ))}
    </div>
  );
}

/** One side's bar: grows from the centre labels outward (descent to the
 *  left, ascent to the right), its length the band's speed against the
 *  dive's fastest band. The fastest band of each side glows. */
function Bar({
  agg,
  max,
  side,
  best,
}: {
  agg: PhaseAgg;
  max: number;
  side: 'desc' | 'asc';
  best: boolean;
}) {
  const speed = bandSpeed(agg);
  const tone = side === 'desc' ? 'rgb(var(--c-profile))' : 'rgb(var(--c-amber))';
  const value = (
    // On a phone the time drops out so the bar keeps its room.
    <span className="w-9 shrink-0 font-num text-xs tabular-nums sm:w-24">
      {speed == null ? (
        <span className="text-textDim opacity-40">–</span>
      ) : (
        <>
          <span className="font-bold" style={{ color: tone }}>
            {speed.toFixed(2)}
          </span>
          <span className="ml-1.5 hidden text-textDim sm:inline">{fmtTime(agg.time)}</span>
        </>
      )}
    </span>
  );
  const bar = (
    <div className={`flex min-w-0 flex-1 ${side === 'desc' ? 'justify-end' : ''}`}>
      {speed != null && (
        <div
          className={`h-3.5 ${best ? 'bar-best' : ''}`}
          style={{
            '--tone': tone,
            width: `${Math.max(2, (speed / max) * 100)}%`,
            background: tone,
            borderRadius: side === 'desc' ? '7px 3px 3px 7px' : '3px 7px 7px 3px',
            borderBottom: `3px solid color-mix(in srgb, ${tone}, #000 35%)`,
          } as React.CSSProperties}
        />
      )}
    </div>
  );
  return (
    <div className={`flex min-w-0 items-center gap-2 ${side === 'desc' ? 'text-right' : ''}`}>
      {side === 'desc' ? (
        <>
          {value}
          {bar}
        </>
      ) : (
        <>
          {bar}
          {value}
        </>
      )}
    </div>
  );
}

export function SpeedBandsTable({ rows }: { rows: BandRow[] }) {
  const t = useT();
  if (rows.length === 0) return null;
  const speeds = (phase: 'desc' | 'asc') => rows.map((r) => bandSpeed(r[phase]) ?? 0);
  const desc = speeds('desc');
  const asc = speeds('asc');
  const argmax = (xs: number[]) => xs.reduce((best, v, i) => (v > xs[best] ? i : best), 0);
  const bestDesc = argmax(desc);
  const bestAsc = argmax(asc);
  const max = Math.max(desc[bestDesc] ?? 0, asc[bestAsc] ?? 0);

  return (
    <div className="chart-well rounded-xl px-3 py-2 sm:px-4">
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-x-2 pb-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3">
        <span className="text-right font-mono text-[10px] uppercase tracking-widest text-profile">
          ‹ {t('Descent')} m/s
        </span>
        <span className="text-center font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('Band')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber">
          {t('Ascent')} m/s ›
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li
            key={r.lo}
            className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3"
          >
            <Bar agg={r.desc} max={max} side="desc" best={i === bestDesc && desc[i] > 0} />
            <span className="text-center font-num text-xs font-bold text-text tabular-nums">
              {bandLabel(r)}
            </span>
            <Bar agg={r.asc} max={max} side="asc" best={i === bestAsc && asc[i] > 0} />
          </li>
        ))}
      </ul>
    </div>
  );
}
