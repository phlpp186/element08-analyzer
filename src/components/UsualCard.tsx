/**
 * UsualCard — a dive against the diver's usual (lib/analytics/usualCompare):
 * a tile per figure with its difference, and one line on what stands out.
 * Shared by the depth and pool dive pages; differences are stated, not
 * judged, since a faster descent or a lower heart rate is not always better.
 */
import type { UsualCompare, UsualKind, UsualMetric, UsualRow } from '../lib/analytics/usualCompare';
import { TONE_VAR, type Tone } from '../lib/tones';
import { fmtSec } from '../lib/divePage';
import { useT } from '../i18n';
import { SideCard } from './DivePageLayout';

const LABEL: Record<UsualMetric, string> = {
  descentSpeed: 'Descent speed',
  ascentSpeed: 'Ascent speed',
  hangTime: 'Hang',
  diveTime: 'Dive time',
  pace: 'Pace /100m',
  minHr: 'Min HR',
  avgHr: 'Avg HR',
};

const TONE: Record<UsualMetric, Tone> = {
  descentSpeed: 'profile',
  ascentSpeed: 'amber',
  hangTime: 'recover',
  diveTime: 'highlight',
  pace: 'amber',
  minHr: 'red',
  avgHr: 'hero',
};

function fmt(kind: UsualKind, v: number): string {
  if (kind === 'speed') return `${v.toFixed(2)} m/s`;
  if (kind === 'pace') return fmtSec(v);
  if (kind === 'bpm') return `${Math.round(v)} bpm`;
  return fmtSec(v);
}

export function UsualCard({ usual }: { usual: UsualCompare }) {
  const t = useT();
  const diff = (r: UsualRow): string => {
    const p = String(Math.round(Math.abs(r.delta)));
    switch (r.kind) {
      case 'speed':
        if (Math.abs(r.delta) < 0.5) return t('as usual');
        return (r.delta > 0 ? t('▲ {p}% faster') : t('▼ {p}% slower')).replace('{p}', p);
      case 'pace':
        // Pace is time per distance: more is slower.
        if (Math.abs(r.delta) < 0.5) return t('as usual');
        return (r.delta > 0 ? t('▼ {p}% slower') : t('▲ {p}% faster')).replace('{p}', p);
      case 'bpm':
        if (Math.abs(r.delta) < 1) return t('as usual');
        return (r.delta > 0 ? t('▲ {n} bpm higher') : t('▼ {n} bpm lower')).replace('{n}', p);
      default:
        if (Math.abs(r.delta) < 1) return t('as usual');
        return (r.delta > 0 ? t('▲ {s} longer') : t('▼ {s} shorter')).replace('{s}', fmtSec(Math.abs(r.delta)));
    }
  };
  const s = usual.standout;
  const standout = s
    ? t('{metric}: {value} against your usual {usual}.')
        .replace('{metric}', t(LABEL[s.metric]))
        .replace('{value}', fmt(s.kind, s.value))
        .replace('{usual}', fmt(s.kind, s.usual))
    : t('A usual dive for this depth.');
  return (
    <SideCard title={t('Against your usual')} className="shrink-0">
      <p className="-mt-1 mb-2 font-mono text-[10px] text-textDim">
        {t('{disc} at {from}–{to} m · {n} dives')
          .replace('{disc}', usual.discipline)
          .replace('{from}', String(usual.from))
          .replace('{to}', String(usual.to))
          .replace('{n}', String(usual.count))}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {usual.rows.map((r) => (
          <div
            key={r.metric}
            className="tile min-w-0 break-words px-3 py-2"
            style={{ '--tone': TONE_VAR[TONE[r.metric]] } as React.CSSProperties}
          >
            <div className="tile-value font-num text-lg font-bold tabular-nums">{fmt(r.kind, r.value)}</div>
            <div className="tile-label font-mono text-[10px] font-extrabold uppercase tracking-widest">
              {t(LABEL[r.metric])}
            </div>
            <div className="tile-label font-mono text-[10px] opacity-90">{diff(r)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-textDim">{standout}</p>
    </SideCard>
  );
}
