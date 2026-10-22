/**
 * PeriodScoreboard — the Summary tab's headline: the first period's figures
 * as coloured blocks, each with its change against the second period
 * (Philipp's option C, 2026-10-22). A quick pick puts the recent period
 * first, so the arrows read as "now against before". With one period the
 * blocks stand without arrows; the full table of every period follows below.
 */
import type { PeriodSummary } from '../lib/analytics/periodSummary';
import { TONE_VAR, type Tone } from '../lib/tones';
import { useT } from '../i18n';
import { ModeMixBar } from './PeriodsSummary';

interface Block {
  label: string;
  tone: Tone;
  value: (s: PeriodSummary) => number | null;
  fmt: (v: number) => string;
}

function fmtHours(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)}m`;
}

const BLOCKS: Block[] = [
  { label: 'Sessions', tone: 'accent', value: (s) => s.totalSessions, fmt: (v) => String(Math.round(v)) },
  { label: 'Training days', tone: 'recover', value: (s) => s.totalTrainingDays, fmt: (v) => String(Math.round(v)) },
  { label: 'Hours', tone: 'highlight', value: (s) => s.totalMinutes, fmt: fmtHours },
  { label: 'Deepest', tone: 'hero', value: (s) => (s.maxDepth > 0 ? s.maxDepth : null), fmt: (v) => `${Math.round(v * 10) / 10}m` },
  { label: 'Pool distance', tone: 'profile', value: (s) => s.totalPoolDistance, fmt: fmtDistance },
  { label: 'Dry holds', tone: 'amber', value: (s) => s.totalDryHolds, fmt: (v) => String(Math.round(v)) },
  {
    label: 'Sessions per training week',
    tone: 'accent',
    value: (s) => s.avgSessionsPerActiveWeek,
    fmt: (v) => v.toFixed(1),
  },
];

export function PeriodScoreboard({ summaries }: { summaries: PeriodSummary[] }) {
  const t = useT();
  if (summaries.length === 0) return null;
  const [now, before] = summaries;
  // Against an empty period every arrow would just repeat the figure.
  const against = before && before.totalSessions > 0 ? before : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodChip summary={now} />
        {before && (
          <>
            <span className="font-num text-sm text-textDim">{t('vs')}</span>
            <PeriodChip summary={before} />
            {!against && (
              <span className="font-mono text-[11px] text-textDim">{t('no sessions in this period')}</span>
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BLOCKS.map((b) => {
          const v = b.value(now);
          const prev = against ? b.value(against) : null;
          const delta = v != null && prev != null ? v - prev : null;
          return (
            <div
              key={b.label}
              className="tile min-w-0 px-4 py-3"
              style={{ '--tone': TONE_VAR[b.tone] } as React.CSSProperties}
            >
              <div className="tile-value flex flex-wrap items-baseline gap-x-2 font-num font-bold tabular-nums">
                <span className="text-2xl">{v != null ? b.fmt(v) : '–'}</span>
                {delta != null && Math.abs(delta) > 1e-9 && (
                  <span className="text-sm">
                    {delta > 0 ? '▲' : '▼'} {b.fmt(Math.abs(delta))}
                  </span>
                )}
              </div>
              <div className="tile-label mt-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest">
                {t(b.label)}
              </div>
            </div>
          );
        })}
        <div className="board min-w-0 px-4 py-3">
          <div className="mb-2 font-mono text-[10px] font-extrabold uppercase tracking-widest text-textDim">
            {t('Mode mix')}
          </div>
          <ModeMixBar mix={now.modeMix} />
        </div>
      </div>
    </section>
  );
}

function PeriodChip({ summary }: { summary: PeriodSummary }) {
  const c = summary.period.color;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-num text-sm font-bold"
      style={{
        background: c,
        color: `color-mix(in srgb, ${c}, #000 78%)`,
        borderBottom: `3px solid color-mix(in srgb, ${c}, #000 35%)`,
      }}
    >
      {summary.period.label}
    </span>
  );
}
