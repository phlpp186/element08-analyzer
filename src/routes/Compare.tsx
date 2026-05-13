/**
 * Compare — period-based analysis with two visualization tabs:
 *
 *   - Overlay      (Phase 5a) — one line per period on a shared x-axis,
 *                  aligned weeks-before-anchor. Best for comparing prep
 *                  shape across multiple seasons.
 *   - Periodization (Phase 5b) — week × metric heatmap for ONE selected
 *                  period. Best for spotting peak / deload / taper
 *                  patterns within a single cycle.
 *
 * Both tabs share the user-defined periods (useCompareStore) and the
 * same metric definitions, so periods added here are visible in both
 * views without re-entry.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { useCompareStore } from '../stores/useCompareStore';
import {
  aggregatePeriods,
  defaultPeriod,
  METRICS,
  type Metric,
} from '../lib/analytics/periodCompare';
import { buildPeriodMatrix } from '../lib/analytics/periodMatrix';
import { summarizePeriods } from '../lib/analytics/periodSummary';
import { PeriodEditor } from '../components/PeriodEditor';
import { PeriodComparisonChart } from '../components/charts/PeriodComparisonChart';
import { PeriodHeatmap } from '../components/charts/PeriodHeatmap';
import { PeriodsSummary } from '../components/PeriodsSummary';

type Tab = 'overlay' | 'heatmap' | 'summary';

const TABS: { id: Tab; label: string; description: string }[] = [
  {
    id: 'overlay',
    label: 'Overlay',
    description: 'One line per period, aligned weeks-before-anchor. Compare shapes.',
  },
  {
    id: 'heatmap',
    label: 'Periodization',
    description: 'Week × metric grid for one period. See peaks and deloads.',
  },
  {
    id: 'summary',
    label: 'Summary',
    description: 'One row per period: totals, peak week, and mode mix.',
  },
];

export function Compare() {
  const backup = useBackupStore((s) => s.backup);
  const periods = useCompareStore((s) => s.periods);
  const metric = useCompareStore((s) => s.metric);
  const setMetric = useCompareStore((s) => s.setMetric);
  const addPeriod = useCompareStore((s) => s.addPeriod);

  const [tab, setTab] = useState<Tab>('overlay');
  const [heatmapPeriodId, setHeatmapPeriodId] = useState<string | null>(null);

  if (!backup) return <Navigate to="/" replace />;

  const sessions = backup.data.sessions;

  useEffect(() => {
    if (periods.length === 0) {
      const suggested = defaultPeriod(sessions);
      if (suggested) addPeriod(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heatmap shows ONE period; default to the first one and follow along
  // if the selected one gets deleted.
  useEffect(() => {
    if (periods.length === 0) {
      if (heatmapPeriodId !== null) setHeatmapPeriodId(null);
      return;
    }
    if (heatmapPeriodId == null || !periods.some((p) => p.id === heatmapPeriodId)) {
      setHeatmapPeriodId(periods[0].id);
    }
  }, [periods, heatmapPeriodId]);

  const overlay = useMemo(
    () => aggregatePeriods(sessions, periods, metric),
    [sessions, periods, metric],
  );
  const metricDef = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  const heatmapPeriod = periods.find((p) => p.id === heatmapPeriodId) ?? null;
  const matrix = useMemo(
    () => (heatmapPeriod ? buildPeriodMatrix(sessions, heatmapPeriod) : null),
    [sessions, heatmapPeriod],
  );
  const summaries = useMemo(
    () => summarizePeriods(sessions, periods),
    [sessions, periods],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            Compare seasons
          </h1>
          <p className="mt-1 max-w-xl text-sm text-textDim">
            Define one period per training cycle. The Overlay tab compares
            shapes across multiple periods; the Periodization tab zooms in
            on one period's week-by-week intensity profile.
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
      </header>

      <nav className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors',
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-textDim hover:text-text',
              ].join(' ')}
              title={t.description}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {tab === 'overlay' && (
            <>
              <MetricSelector value={metric} onChange={setMetric} />
              <PeriodComparisonChart
                series={overlay.series}
                xLabels={overlay.xLabels}
                metric={metricDef}
              />
            </>
          )}

          {tab === 'heatmap' && (
            <>
              {periods.length > 1 && (
                <PeriodPicker
                  selectedId={heatmapPeriodId}
                  onChange={setHeatmapPeriodId}
                  periods={periods}
                />
              )}
              {matrix && <PeriodHeatmap matrix={matrix} />}
              {!matrix && (
                <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
                  Add a period in the right panel to see its periodization.
                </div>
              )}
            </>
          )}

          {tab === 'summary' && <PeriodsSummary summaries={summaries} />}
        </div>
        <PeriodEditor />
      </div>
    </div>
  );
}

function MetricSelector({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (m: Metric) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {METRICS.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={[
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-textDim hover:border-accent hover:text-accent',
            ].join(' ')}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodPicker({
  selectedId,
  onChange,
  periods,
}: {
  selectedId: string | null;
  onChange: (id: string) => void;
  periods: { id: string; label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
        Showing:
      </span>
      {periods.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={[
              'flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors',
              active
                ? 'border-accent text-accent'
                : 'border-border text-textDim hover:border-accent hover:text-accent',
            ].join(' ')}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
