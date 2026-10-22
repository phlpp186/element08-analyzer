/**
 * Progress — the "how am I doing" home (Phase 1 of the progress-companion
 * direction, 2026-07-27). Default landing after a backup loads.
 *
 * Composition: PB KPI tiles with a recent-improvement delta, goal progress
 * (athlete_profiles.goals pulled for signed-in users, matched against the
 * loaded logbook), the depth PB progression (reused Insights chart) with
 * hold/pool trajectory fallbacks, and a 12-week consistency strip.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ReactECharts from '../components/charts/EChart';
import { useBackupStore } from '../stores/useBackupStore';
import { useAuth } from '../lib/supabase/AuthProvider';
import { pullAthleteGoals } from '../lib/supabase/athleteProfile';
import {
  progressKpis,
  pbTrajectory,
  primaryTrajectoryMode,
  weeklyConsistency,
  goalProgress,
  fmtHold,
  type TrajectoryMode,
  type CloudGoal,
} from '../lib/analytics/progress';
import { disciplineProgression } from '../lib/analytics/depthInsights';
import { DisciplineProgressionChart } from '../components/charts/DisciplineProgressionChart';
import { ChartCard } from '../components/charts/ChartCard';
import { useChartTheme } from '../lib/chartTheme';
import { useT } from '../i18n';
import type { ParsedSession } from '../schema/backup';
import { modeLabel } from '../lib/format';

// ─── KPI tile ────────────────────────────────────────────────────────────────

function KpiTile({
  value,
  label,
  delta,
  tone,
}: {
  value: string;
  label: string;
  delta?: string | null;
  /** CSS colour of the tile (see .tile). */
  tone: string;
}) {
  return (
    <div className="tile px-5 py-4" style={{ '--tone': tone } as React.CSSProperties}>
      <div className="tile-value font-num text-2xl font-extrabold">{value}</div>
      <div className="tile-label mt-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest">
        {label}
      </div>
      {delta ? <div className="tile-label mt-1 text-xs font-bold">{delta}</div> : null}
    </div>
  );
}

// ─── trajectory chart for hold / pool (depth reuses DisciplineProgression) ───

function TrajectoryChart({ mode }: { mode: Exclude<TrajectoryMode, 'depth'> }) {
  const backup = useBackupStore((s) => s.backup);
  const ct = useChartTheme();
  const t = useT();
  const points = useMemo(
    () => (backup ? pbTrajectory(backup.data.sessions, mode) : []),
    [backup, mode],
  );
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-textDim">
        {t('No sessions of this kind in this backup yet.')}
      </p>
    );
  }
  const fmt = (v: number) => (mode === 'hold' ? fmtHold(v) : `${Math.round(v)}m`);
  const option = {
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text },
      formatter: (p: { value: [number, number] }) => {
        const [ts, v] = p.value;
        return `${new Date(ts).toLocaleDateString()} · ${fmt(v)}`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: ct.textDim, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        formatter: (v: number) => fmt(v),
      },
    },
    series: [
      {
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: points.map((p) => [p.t, p.runningMax]),
        lineStyle: { color: ct.accent, width: 2 },
        itemStyle: { color: ct.accent },
      },
      {
        type: 'scatter',
        symbolSize: 7,
        data: points.filter((p) => p.isPb).map((p) => [p.t, p.runningMax]),
        itemStyle: { color: ct.highlight },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 240 }} notMerge />;
}

// ─── consistency strip ───────────────────────────────────────────────────────

const MODE_TONE: Record<ParsedSession['mode'], string> = {
  depth: 'rgb(var(--c-modeDepth))',
  pool: 'rgb(var(--c-modePool))',
  dry: 'rgb(var(--c-modeDry))',
};

/** Most height the block area takes, px; it shrinks to the busiest week. */
const STACK_H = 140;
const BLOCK_GAP = 3;

/** One block per session, stacked per week and coloured by mode, with the
 *  average of the completed weeks as a dashed line (Philipp's option A,
 *  2026-10-22). */
function ConsistencyStrip() {
  const backup = useBackupStore((s) => s.backup);
  const t = useT();
  const bars = useMemo(() => (backup ? weeklyConsistency(backup.data.sessions) : []), [backup]);
  if (bars.length === 0) return null;

  let best = 0;
  for (const b of bars) if (b.count > best) best = b.count;
  const max = Math.max(1, best);
  // Blocks shrink when a busy week would not fit, never below a sliver.
  const blockH = Math.max(4, Math.min(26, (STACK_H - (max - 1) * BLOCK_GAP) / max));
  const step = blockH + BLOCK_GAP;
  const areaH = max * step + 8;
  // The current week is still running, so the average leaves it out.
  const done = bars.slice(0, -1);
  const avg = done.reduce((sum, b) => sum + b.count, 0) / Math.max(1, done.length);
  const thisWeek = bars[bars.length - 1].count;
  const present = (['depth', 'pool', 'dry'] as const).filter((m) =>
    bars.some((b) => b.modes.includes(m)),
  );

  const chip = (label: string, tone: string) => (
    <span
      className="tile inline-flex items-center px-2.5 py-1"
      style={{ '--tone': tone } as React.CSSProperties}
    >
      <span className="tile-value font-num text-xs font-bold">{label}</span>
    </span>
  );

  return (
    <ChartCard
      title={t('Consistency')}
      description={t('Sessions per week, last 12 weeks.')}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip(`${t('This week')} ${thisWeek}`, 'rgb(var(--c-amber))')}
        {chip(`${t('Best week')} ${best}`, 'rgb(var(--c-highlight))')}
        <span className="ml-auto flex flex-wrap gap-3">
          {present.map((m) => (
            <span key={m} className="flex items-center gap-1.5 font-mono text-[11px] text-textDim">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MODE_TONE[m] }} />
              {t(modeLabel(m))}
            </span>
          ))}
        </span>
      </div>
      {/* The right gutter holds the average's label clear of the blocks. */}
      <div className="relative pl-1 pr-24">
        <div className="relative flex items-end gap-1.5 sm:gap-2" style={{ height: areaH }}>
          {bars.map((b) => (
            <div
              key={b.weekStart}
              className="flex flex-1 flex-col-reverse"
              style={{ gap: BLOCK_GAP }}
              title={`${b.count}`}
            >
              {b.modes.length === 0 ? (
                <div
                  className="rounded border border-dashed border-textDim/50"
                  style={{ height: blockH }}
                />
              ) : (
                b.modes.map((m, i) => (
                  <div
                    key={i}
                    className="rounded"
                    style={{
                      height: blockH,
                      background: MODE_TONE[m],
                      borderTop: `2px solid color-mix(in srgb, ${MODE_TONE[m]}, #fff 40%)`,
                      borderBottom: `3px solid color-mix(in srgb, ${MODE_TONE[m]}, #000 35%)`,
                    }}
                  />
                ))
              )}
            </div>
          ))}
          {avg > 0 && (
            <div
              className="pointer-events-none absolute -right-24 left-0 border-t-2 border-dashed border-amber/80"
              style={{ bottom: avg * step }}
            >
              <span className="tile absolute -top-3 right-0 px-2 py-0.5" style={{ '--tone': 'rgb(var(--c-amber))' } as React.CSSProperties}>
                <span className="tile-value font-num text-[10px] font-bold">
                  {t('avg {n}/week').replace('{n}', avg.toFixed(1))}
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-2">
          {bars.map((b, i) => (
            <span
              key={b.weekStart}
              // On a phone every other date (and always this week's) so they fit.
              className={`min-w-0 flex-1 whitespace-nowrap text-center font-mono text-[9px] ${i === bars.length - 1 ? 'font-bold text-amber' : `text-textDim ${(bars.length - 1 - i) % 2 === 1 ? 'max-sm:invisible' : ''}`}`}
            >
              {new Date(b.weekStart).toLocaleDateString(undefined, {
                month: 'numeric',
                day: 'numeric',
              })}
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// ─── goals card ──────────────────────────────────────────────────────────────

function GoalsCard({ goals }: { goals: CloudGoal[] }) {
  const backup = useBackupStore((s) => s.backup);
  const t = useT();
  const rows = useMemo(
    () => (backup ? goalProgress(backup.data.sessions, goals) : []),
    [backup, goals],
  );
  if (rows.length === 0) return null;
  return (
    <div className="board p-5">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-textDim">
        {t('Goals')}
      </h2>
      <div className="flex flex-col gap-3">
        {rows.map(({ goal, current, fraction }) => (
          <div key={goal.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-text">{goal.text}</span>
              {fraction != null && goal.target ? (
                <span className="shrink-0 font-bold text-recover">
                  {Math.round(fraction * 100)}%
                </span>
              ) : null}
            </div>
            {fraction != null && goal.target ? (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-recover"
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </div>
                <div className="mt-1 font-mono text-[10px] text-textDim">
                  {goal.target.unit === 'sec' ? fmtHold(current) : `${Math.round(current)}m`} /{' '}
                  {goal.target.unit === 'sec'
                    ? fmtHold(goal.target.value)
                    : `${goal.target.value}m`}{' '}
                  · {goal.target.discipline}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── the route ───────────────────────────────────────────────────────────────

const MODES: { id: TrajectoryMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'hold', label: 'Breath hold' },
  { id: 'pool', label: 'Pool' },
];

export function Progress() {
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const filename = useBackupStore((s) => s.filename);
  const clear = useBackupStore((s) => s.clear);
  const { session } = useAuth();
  const [goals, setGoals] = useState<CloudGoal[]>([]);
  const [mode, setMode] = useState<TrajectoryMode | null>(null);

  useEffect(() => {
    // Async in both branches so no setState runs synchronously inside the
    // effect (react-hooks/set-state-in-effect).
    let cancelled = false;
    void (session ? pullAthleteGoals() : Promise.resolve([])).then((g) => {
      if (!cancelled) setGoals(g);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Hooks above any early return; compute defaults lazily below it.
  const sessions = backup?.data.sessions;
  const kpis = useMemo(() => (sessions ? progressKpis(sessions) : null), [sessions]);
  const progression = useMemo(() => (sessions ? disciplineProgression(sessions) : []), [sessions]);
  const activeMode: TrajectoryMode = mode ?? (sessions ? primaryTrajectoryMode(sessions) : 'depth');

  if (!backup || !kpis) return <Navigate to="/" replace />;

  const deltaTxt = (delta: number, fmt: (v: number) => string) =>
    delta > 0 ? `▲ +${fmt(delta)} ${t('in 6 months')}` : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">{t('Progress')}</h1>
          {filename && <p className="mt-1 font-mono text-xs text-textDim">{filename}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link
            to="/sessions"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('sessions')} →
          </Link>
          <Link
            to="/insights"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('insights')} →
          </Link>
          <Link
            to="/compare"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('compare')} →
          </Link>
          <Link
            to="/playground"
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            {t('playground')} →
          </Link>
          <button
            onClick={clear}
            className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
          >
            ← {t('load different file')}
          </button>
        </div>
      </header>

      {/* KPI tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          value={kpis.deepest.value > 0 ? `${kpis.deepest.value.toFixed(1)}m` : '—'}
          label={
            kpis.deepest.discipline
              ? `${t('Deepest')} · ${kpis.deepest.discipline}`
              : t('Deepest')
          }
          delta={deltaTxt(kpis.deepest.delta, (v) => `${v.toFixed(1)}m`)}
          tone="rgb(var(--c-hero))"
        />
        <KpiTile
          value={kpis.longestHold.value > 0 ? fmtHold(kpis.longestHold.value) : '—'}
          label={t('Longest hold')}
          delta={deltaTxt(kpis.longestHold.delta, fmtHold)}
          tone="rgb(var(--c-highlight))"
        />
        <KpiTile
          value={kpis.longestPoolDive.value > 0 ? `${Math.round(kpis.longestPoolDive.value)}m` : '—'}
          label={
            kpis.longestPoolDive.discipline
              ? `${t('Longest pool dive')} · ${kpis.longestPoolDive.discipline}`
              : t('Longest pool dive')
          }
          delta={deltaTxt(kpis.longestPoolDive.delta, (v) => `${Math.round(v)}m`)}
          tone="rgb(var(--c-amber))"
        />
        <KpiTile
          value={String(kpis.sessions4w.current)}
          label={t('Sessions, last 4 weeks')}
          delta={
            kpis.sessions4w.prior > 0
              ? `${t('vs')} ${kpis.sessions4w.prior} ${t('the 4 weeks before')}`
              : null
          }
          tone="rgb(var(--c-accent))"
        />
      </div>

      {/* Goals (signed-in, with targets) */}
      {goals.length > 0 && (
        <div className="mb-6">
          <GoalsCard goals={goals} />
        </div>
      )}

      {/* PB trajectory */}
      <div className="mb-3 flex items-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`pill px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${activeMode === m.id ? 'pill-on' : ''}`}
          >
            {t(m.label)}
          </button>
        ))}
      </div>
      <div className="mb-6">
        {activeMode === 'depth' ? (
          <DisciplineProgressionChart series={progression} />
        ) : (
          <ChartCard
            title={activeMode === 'hold' ? t('Breath-hold progression') : t('Pool progression')}
            description={t('Personal best over time. Dots mark new PBs.')}
          >
            <TrajectoryChart mode={activeMode} />
          </ChartCard>
        )}
      </div>

      <ConsistencyStrip />
    </div>
  );
}
