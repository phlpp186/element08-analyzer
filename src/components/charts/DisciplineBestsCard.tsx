/**
 * Discipline Bests — table of the diver's best result per pool discipline.
 * Static / DYN-family / DNF / "other". Sorted by ORDER inside the
 * analytics module so the row order is stable.
 */
import {
  fmtBestValue,
  type BestRecord,
} from '../../lib/analytics/poolBests';
import { useChartTheme, type ChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';

const DISC_LABELS: Record<BestRecord['discipline'], string> = {
  STA:   'Static',
  DYN:   'DYN',
  DYNB:  'DYN Bifins',
  DNF:   'DNF',
  other: 'Other',
};

/** Per-discipline dot colours from the chart theme. */
function discColors(ct: ChartTheme): Record<BestRecord['discipline'], string> {
  return {
    STA:   ct.accent,
    DYN:   ct.green,
    DYNB:  ct.highlight,
    DNF:   ct.amber,
    other: ct.textDim,
  };
}

interface Props {
  bests: BestRecord[];
}

export function DisciplineBestsCard({ bests }: Props) {
  const t = useT();
  const DISC_COLORS = discColors(useChartTheme());
  if (bests.length === 0) {
    return (
      <ChartCard
        title={t('Discipline Bests')}
        description={t('Your longest hold (Static) or furthest distance (DYN-family) per discipline.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No pool dives in this backup yet.')}
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={t('Discipline Bests')}
      description={t('Your longest hold (Static) or furthest distance (DYN-family) per discipline.')}
    >
      <ul className="divide-y divide-border">
        {bests.map((b) => (
          <li
            key={b.discipline}
            className="flex items-center justify-between py-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: DISC_COLORS[b.discipline] }}
              />
              <span className="font-mono text-xs uppercase tracking-widest text-textDim">
                {b.discipline === 'STA'
                  ? t('Static')
                  : b.discipline === 'other'
                    ? t('Other')
                    : DISC_LABELS[b.discipline]}
              </span>
            </div>
            <div className="text-right">
              <div className="font-heading text-2xl tracking-wide text-text">
                {fmtBestValue(b)}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-textDim">
                {new Date(b.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {' · '}
                {b.sessionName}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
