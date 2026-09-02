/**
 * RangeReadout — the A→B panel: what the diver did between two points you
 * dragged across the profile.
 *
 * Shared verbatim with element08-coach. All of the thinking is in
 * lib/analytics/rangeStats; this only decides what to show, and the one rule
 * it applies is the module's: when `avgSpeed` is null the selection turned
 * around inside itself (or never moved), so a net metres-per-second figure
 * would describe a diver who was standing still. The distance actually
 * travelled goes in its place, labelled as such, rather than a confident wrong
 * number in the same slot.
 */
import type { RangeStats, RangeDirection } from '../lib/analytics/rangeStats';

const ARROW: Record<RangeDirection, string> = {
  descent: '↓',
  ascent: '↑',
  hang: '↔',
  mixed: '↕',
};

function fmtClock(s: number): string {
  const whole = Math.floor(s);
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function RangeReadout({
  stats,
  t,
  onClear,
}: {
  stats: RangeStats;
  t: (s: string) => string;
  onClear: () => void;
}) {
  const label: Record<RangeDirection, string> = {
    descent: t('descent'),
    ascent: t('ascent'),
    hang: t('hang'),
    mixed: t('turns around'),
  };

  const cells: { label: string; value: string }[] = [
    { label: t('Start'), value: `${stats.startDepth.toFixed(1)} m` },
    { label: t('End'), value: `${stats.endDepth.toFixed(1)} m` },
    {
      label: t('Δ depth'),
      value: `${Math.abs(stats.deltaDepth).toFixed(1)} m`,
    },
    { label: t('Δ time'), value: fmtClock(stats.dt) },
    stats.avgSpeed != null
      ? { label: t('Avg speed'), value: `${stats.avgSpeed.toFixed(2)} m/s` }
      : { label: t('Travelled'), value: `${stats.pathDistance.toFixed(1)} m` },
  ];
  // The recorded speed channel and the depth channel are two different
  // instruments, and they do not always agree: a watch that logs a SMOOTHED
  // vertical speed can report a peak BELOW the average the depth samples
  // imply (a real dive in the demo set: channel peak 1.28 m/s across a stretch
  // the depth curve covers at 1.63 m/s). A panel that says peak < average
  // reads as broken, and rightly so. Show the recorded peak only where it is
  // consistent with the rest of the panel; otherwise say nothing, because the
  // honest answer is that the two channels disagree.
  // Compared at the precision it is PRINTED at. A profile whose two channels
  // agree exactly (peak 1.21, average 1.2103) would otherwise drop the peak
  // over a difference no one can see.
  const reference = stats.avgSpeed ?? stats.pathSpeed;
  if (stats.maxSpeed != null && stats.maxSpeed + 0.005 >= reference) {
    cells.push({ label: t('Peak speed'), value: `${stats.maxSpeed.toFixed(2)} m/s` });
  }
  if (stats.avgHr != null) {
    cells.push({ label: t('Avg HR'), value: `${Math.round(stats.avgHr)} bpm` });
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-panel px-4 py-3">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          A → B
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {ARROW[stats.direction]} {label[stats.direction]}
        </span>
        <span className="font-mono text-[10px] text-textDim opacity-60">
          {fmtClock(stats.startT)}–{fmtClock(stats.endT)}
        </span>
        <button
          onClick={onClear}
          className="ml-auto font-mono text-[10px] uppercase tracking-widest text-textDim transition-colors hover:text-accent"
        >
          {t('clear')}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="font-heading text-lg tracking-wide text-text tabular-nums">
              {c.value}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-textDim">
              {c.label}
            </div>
          </div>
        ))}
      </div>
      {stats.avgSpeed == null && stats.direction === 'mixed' && (
        <p className="mt-2 font-mono text-[10px] text-textDim opacity-70">
          {t('This selection changes direction, so an average speed across it would report a diver who barely moved. Metres travelled is shown instead.')}
        </p>
      )}
    </div>
  );
}
