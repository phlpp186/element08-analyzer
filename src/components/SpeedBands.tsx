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
import { useChartTheme } from '../lib/chartTheme';
import { useT } from '../i18n';

function fmtTime(s: number): string {
  if (s < 60) return `${s.toFixed(1).replace(/\.0$/, '')}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function PhaseCell({ agg, color }: { agg: PhaseAgg; color: string }) {
  const speed = bandSpeed(agg);
  if (speed == null) {
    return <span className="font-mono text-xs text-textDim opacity-40">–</span>;
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="font-semibold" style={{ color }}>
        {speed.toFixed(2)} m/s
      </span>
      <span className="ml-2 text-textDim">{fmtTime(agg.time)}</span>
    </span>
  );
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
          className={[
            'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
            size === s
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

export function SpeedBandsTable({ rows }: { rows: BandRow[] }) {
  const t = useT();
  const ct = useChartTheme();
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-x-4 border-b border-border bg-abyss px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('Band')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('Descent')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('Ascent')}
        </span>
      </div>
      <ul className="divide-y divide-border bg-panel">
        {rows.map((r) => (
          <li key={r.lo} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-x-4 px-4 py-2">
            <span className="inline-flex w-fit rounded-full border border-border bg-abyss px-2.5 py-0.5 font-mono text-[11px] text-text tabular-nums">
              {bandLabel(r)}
            </span>
            <PhaseCell agg={r.desc} color={ct.amber} />
            <PhaseCell agg={r.asc} color={ct.red} />
          </li>
        ))}
      </ul>
    </div>
  );
}
