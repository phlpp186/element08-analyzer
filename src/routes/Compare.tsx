/**
 * Compare — aligned-to-event cross-season comparison view.
 *
 * Users define one or more named "periods" (typically anchored to a race
 * day). Each period contributes one line to the chart, all aligned by
 * weeks-before-anchor so the prep curves are directly comparable.
 *
 * Defaults: if the user lands with no periods defined, suggest a single
 * "Last 12 weeks" period anchored on the most recent session date so
 * they see something useful immediately.
 */
import { useEffect, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { useCompareStore } from '../stores/useCompareStore';
import {
  aggregatePeriods,
  defaultPeriod,
  METRICS,
  type Metric,
} from '../lib/analytics/periodCompare';
import { PeriodEditor } from '../components/PeriodEditor';
import { PeriodComparisonChart } from '../components/charts/PeriodComparisonChart';

export function Compare() {
  const backup = useBackupStore((s) => s.backup);
  const periods = useCompareStore((s) => s.periods);
  const metric = useCompareStore((s) => s.metric);
  const setMetric = useCompareStore((s) => s.setMetric);
  const addPeriod = useCompareStore((s) => s.addPeriod);

  if (!backup) return <Navigate to="/" replace />;

  const sessions = backup.data.sessions;

  // First-visit nudge: drop in one auto-period so the chart isn't empty.
  // Runs only when periods is empty AND we have data; deletes by the user
  // afterward are respected because we never re-seed.
  useEffect(() => {
    if (periods.length === 0) {
      const suggested = defaultPeriod(sessions);
      if (suggested) addPeriod(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { series, xLabels } = useMemo(
    () => aggregatePeriods(sessions, periods, metric),
    [sessions, periods, metric],
  );

  const metricDef = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            Compare seasons
          </h1>
          <p className="mt-1 max-w-xl text-sm text-textDim">
            Define one period per training cycle (typically anchored to a
            race day). Each period draws its own line, aligned by
            weeks-before-anchor so the prep curves overlay directly.
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <MetricSelector value={metric} onChange={setMetric} />
          <PeriodComparisonChart
            series={series}
            xLabels={xLabels}
            metric={metricDef}
          />
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
