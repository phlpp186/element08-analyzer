/**
 * CompareSeasons — period-based analysis with four visualization tabs:
 *
 *   - Overlay      (Phase 5a) — one line per period on a shared x-axis,
 *                  aligned weeks-before-anchor. Compare prep shapes.
 *   - Periodization (Phase 5b) — week × metric heatmap for ONE period.
 *                  Spot peak / deload / taper patterns within a cycle.
 *   - Summary       (Phase 5c) — one row per period: totals + mode mix.
 *   - Exercises     (Phase 5e) — scatter of every individual hold/dive
 *                  in ONE period. Raw training-log granularity: density
 *                  of training days + spread of efforts at a glance.
 *
 * All tabs share the user-defined periods (useCompareStore), so periods
 * added in one tab are visible in the others without re-entry.
 *
 * The /compare/dives sibling route handles single-dive overlay; the two
 * modes share CompareModeHeader.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { CompareModeHeader } from '../components/CompareModeHeader';
import { useCompareStore } from '../stores/useCompareStore';
import {
  aggregatePeriods,
  defaultPeriod,
  METRICS,
  type Metric,
} from '../lib/analytics/periodCompare';
import { buildPeriodMatrix } from '../lib/analytics/periodMatrix';
import { summarizePeriods } from '../lib/analytics/periodSummary';
import {
  extractExercises,
  type ExerciseMode,
} from '../lib/analytics/periodExercises';
import { PeriodEditor } from '../components/PeriodEditor';
import { PeriodComparisonChart } from '../components/charts/PeriodComparisonChart';
import { PeriodHeatmap } from '../components/charts/PeriodHeatmap';
import { PeriodsSummary } from '../components/PeriodsSummary';
import { ExerciseScatter } from '../components/charts/ExerciseScatter';

type Tab = 'overlay' | 'heatmap' | 'summary' | 'exercises';

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
  {
    id: 'exercises',
    label: 'Exercises',
    description: 'Every hold/dive in one period as a dot. Training-log granularity.',
  },
];

const EXERCISE_MODES: { id: ExerciseMode; label: string }[] = [
  { id: 'breathhold', label: 'Breath hold' }, // dry holds + pool STA
  { id: 'depth',      label: 'Depth' },
  { id: 'pool',       label: 'Pool distance' }, // DYN / DYNB / DNF / other
];

export function CompareSeasons() {
  const backup = useBackupStore((s) => s.backup);
  const periods = useCompareStore((s) => s.periods);
  const metric = useCompareStore((s) => s.metric);
  const setMetric = useCompareStore((s) => s.setMetric);
  const addPeriod = useCompareStore((s) => s.addPeriod);

  const [tab, setTab] = useState<Tab>('overlay');
  // Periodization + Exercises are both "pick one period" views — they
  // share the selection so switching between them keeps your period.
  const [singlePeriodId, setSinglePeriodId] = useState<string | null>(null);
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>('breathhold');

  if (!backup) return <Navigate to="/" replace />;

  const sessions = backup.data.sessions;

  useEffect(() => {
    if (periods.length === 0) {
      const suggested = defaultPeriod(sessions);
      if (suggested) addPeriod(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single-period views (Periodization, Exercises) default to the first
  // period and follow along if the selected one gets deleted.
  useEffect(() => {
    if (periods.length === 0) {
      if (singlePeriodId !== null) setSinglePeriodId(null);
      return;
    }
    if (singlePeriodId == null || !periods.some((p) => p.id === singlePeriodId)) {
      setSinglePeriodId(periods[0].id);
    }
  }, [periods, singlePeriodId]);

  const overlay = useMemo(
    () => aggregatePeriods(sessions, periods, metric),
    [sessions, periods, metric],
  );
  const metricDef = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  const singlePeriod = periods.find((p) => p.id === singlePeriodId) ?? null;
  const matrix = useMemo(
    () => (singlePeriod ? buildPeriodMatrix(sessions, singlePeriod) : null),
    [sessions, singlePeriod],
  );
  const summaries = useMemo(
    () => summarizePeriods(sessions, periods),
    [sessions, periods],
  );
  const exerciseData = useMemo(
    () => (singlePeriod ? extractExercises(sessions, singlePeriod, exerciseMode) : null),
    [sessions, singlePeriod, exerciseMode],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CompareModeHeader
        mode="seasons"
        description="Define one period per training cycle. The Overlay tab compares shapes across multiple periods; the Periodization tab zooms in on one period's week-by-week intensity profile."
      />

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
                  selectedId={singlePeriodId}
                  onChange={setSinglePeriodId}
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

          {tab === 'exercises' && (
            <>
              {periods.length > 1 && (
                <PeriodPicker
                  selectedId={singlePeriodId}
                  onChange={setSinglePeriodId}
                  periods={periods}
                />
              )}
              {/* Mode picker drives the y-axis: hold time / max depth /
                  dive time. */}
              <div className="flex flex-wrap gap-2">
                {EXERCISE_MODES.map((m) => {
                  const active = exerciseMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setExerciseMode(m.id)}
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
              {exerciseData ? (
                <ExerciseScatter data={exerciseData} mode={exerciseMode} />
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-16 text-center text-textDim">
                  Add a period in the right panel to see its exercises.
                </div>
              )}
            </>
          )}
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
