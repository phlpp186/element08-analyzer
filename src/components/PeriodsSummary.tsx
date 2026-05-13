/**
 * PeriodsSummary — table view: one row per Period, columns for the
 * roll-up metrics.
 *
 * Designed for at-a-glance side-by-side comparison: total sessions /
 * holds / hours, the week where each period peaked, and a mode-mix bar
 * that visually conveys "this was mostly a depth season" vs "mostly
 * pool". Click a column header would be a nice future extension for
 * sorting; v1 keeps the order users typed.
 */
import type { PeriodSummary } from '../lib/analytics/periodSummary';

interface Props {
  summaries: PeriodSummary[];
}

const MODE_COLORS = {
  dry: '#66bb6a',   // recover green
  depth: '#4fc3f7', // accent blue
  pool: '#ff5f9e',  // highlight pink
} as const;

const MODE_LABELS = {
  dry: 'Dry',
  depth: 'Depth',
  pool: 'Pool',
} as const;

export function PeriodsSummary({ summaries }: Props) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
        Add at least one period in the right panel to see its roll-up.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="w-full min-w-[820px]">
        <thead className="bg-abyss">
          <tr className="font-mono text-[10px] uppercase tracking-widest text-textDim">
            <Th label="Period" align="left" />
            <Th label="Weeks" />
            <Th label="Sessions" />
            <Th label="Days" />
            <Th label="Dry holds" />
            <Th label="Hours" />
            <Th label="Pool m" />
            <Th label="Max depth" />
            <Th label="Peak wk" />
            <Th label="Mode mix" align="left" />
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.period.id} className="border-t border-border">
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.period.color }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-heading text-sm tracking-wide text-text">
                      {s.period.label}
                    </div>
                    <div className="font-mono text-[10px] text-textDim">
                      anchor {s.period.anchorDate}
                    </div>
                  </div>
                </div>
              </td>
              <Td>{s.period.weeksBefore}</Td>
              <Td>{s.totalSessions}</Td>
              <Td>{s.totalTrainingDays}</Td>
              <Td>{s.totalDryHolds || '—'}</Td>
              <Td>{fmtHours(s.totalMinutes)}</Td>
              <Td>{s.totalPoolDistance > 0 ? `${s.totalPoolDistance}m` : '—'}</Td>
              <Td>{s.maxDepth > 0 ? `${s.maxDepth}m` : '—'}</Td>
              <Td>
                {s.peakSessionsWeek != null
                  ? s.peakSessionsWeek === 0
                    ? 'target'
                    : `${s.peakSessionsWeek}w`
                  : '—'}
              </Td>
              <td className="px-3 py-3" style={{ minWidth: 140 }}>
                <ModeMixBar mix={s.modeMix} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ label, align = 'right' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <th
      className={[
        'px-3 py-2',
        align === 'left' ? 'text-left' : 'text-right',
      ].join(' ')}
    >
      {label}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-3 text-right font-mono text-sm text-text">
      {children}
    </td>
  );
}

function ModeMixBar({ mix }: { mix: { dry: number; depth: number; pool: number } }) {
  const total = mix.dry + mix.depth + mix.pool;
  if (total === 0) {
    return <span className="font-mono text-xs text-textDim">—</span>;
  }
  const parts: { key: 'dry' | 'depth' | 'pool'; pct: number }[] = [
    { key: 'dry',   pct: (mix.dry   / total) * 100 },
    { key: 'depth', pct: (mix.depth / total) * 100 },
    { key: 'pool',  pct: (mix.pool  / total) * 100 },
  ].filter((p) => p.pct > 0);

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div
            key={p.key}
            style={{ width: `${p.pct}%`, backgroundColor: MODE_COLORS[p.key] }}
            title={`${MODE_LABELS[p.key]} ${p.pct.toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-3 font-mono text-[10px] text-textDim">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: MODE_COLORS[p.key] }}
            />
            {Math.round(p.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtHours(min: number): string {
  if (min <= 0) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
