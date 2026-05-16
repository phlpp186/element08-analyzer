/**
 * Insights — analytics dashboard.
 *
 * Phase 2a (this commit): four flagship charts across three tabs.
 * Breath Hold tab → SpO₂ Exposure Zones.
 * Pool tab → Discipline Bests + Distance Distribution.
 * Balance tab → Training Days heatmap.
 * Depth tab is scaffolded but empty for now (Phase 2b lands its first chart).
 *
 * Each chart calls a pure function from `src/lib/analytics/` to produce
 * its data. That separation is what'll let us extract analytics into a
 * shared package later without rewriting the components.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { spo2LowestPerSession } from '../lib/analytics/spo2Zones';
import { disciplineBests } from '../lib/analytics/poolBests';
import { distanceDistribution } from '../lib/analytics/poolDistance';
import { trainingDaysHeatmap } from '../lib/analytics/heatmap';
import {
  sessionTagDistribution,
  effortDistribution,
  weeklyVolume,
} from '../lib/analytics/balance';
import {
  depthDistribution,
  speedPerDepthBand,
  hangTimeDistribution,
  disciplineProgression,
  type BandStep,
} from '../lib/analytics/depthInsights';
import { poolPaceProgression } from '../lib/analytics/poolPace';
import { poolHrPerDive } from '../lib/analytics/poolHr';
import { poolSessionTypeMix } from '../lib/analytics/poolSessionTypes';
import {
  holdDurationTrend,
  contractionsPerBand,
  recoveryTimePerHold,
  diveReflexFirstMinute,
  hrAroundContractions,
} from '../lib/analytics/holdTrends';
import { SpO2ZonesChart } from '../components/charts/SpO2ZonesChart';
import { DisciplineBestsCard } from '../components/charts/DisciplineBestsCard';
import { DistanceDistributionChart } from '../components/charts/DistanceDistributionChart';
import { TrainingHeatmap } from '../components/charts/TrainingHeatmap';
import { SessionTagDistributionChart } from '../components/charts/SessionTagDistributionChart';
import { EffortDistributionChart } from '../components/charts/EffortDistributionChart';
import { WeeklyVolumeChart } from '../components/charts/WeeklyVolumeChart';
import { DepthDistributionChart } from '../components/charts/DepthDistributionChart';
import { SpeedPerDepthBandChart } from '../components/charts/SpeedPerDepthBandChart';
import { HangTimeDistributionChart } from '../components/charts/HangTimeDistributionChart';
import { DisciplineProgressionChart } from '../components/charts/DisciplineProgressionChart';
import { PoolPaceChart } from '../components/charts/PoolPaceChart';
import { PoolHrChart } from '../components/charts/PoolHrChart';
import { PoolSessionTypeMixChart } from '../components/charts/PoolSessionTypeMixChart';
import { HoldDurationTrendChart } from '../components/charts/HoldDurationTrendChart';
import { ContractionsPerBandChart } from '../components/charts/ContractionsPerBandChart';
import { RecoveryTimeChart } from '../components/charts/RecoveryTimeChart';
import { DiveReflexFirstMinuteChart } from '../components/charts/DiveReflexFirstMinuteChart';
import { HrAroundContractionsChart } from '../components/charts/HrAroundContractionsChart';

type Tab = 'breathhold' | 'depth' | 'pool' | 'balance';

const TABS: { id: Tab; label: string }[] = [
  { id: 'breathhold', label: 'Breath Hold' },
  { id: 'depth',      label: 'Depth' },
  { id: 'pool',       label: 'Pool' },
  { id: 'balance',    label: 'Balance' },
];

export function Insights() {
  const backup = useBackupStore((s) => s.backup);
  const [tab, setTab] = useState<Tab>('breathhold');
  const [bandStep, setBandStep] = useState<BandStep>(10);

  if (!backup) return <Navigate to="/" replace />;

  // All calculations are memoized against the backup. They're cheap but
  // we recompute on tab switches otherwise.
  const sessions = backup.data.sessions;
  const spo2Trend = useMemo(() => spo2LowestPerSession(sessions), [sessions]);
  const bests = useMemo(() => disciplineBests(sessions), [sessions]);
  const distBins = useMemo(() => distanceDistribution(sessions), [sessions]);
  const heatmap = useMemo(() => trainingDaysHeatmap(sessions), [sessions]);
  const tagDist = useMemo(() => sessionTagDistribution(sessions), [sessions]);
  const effortDist = useMemo(() => effortDistribution(sessions), [sessions]);
  const weekVol = useMemo(() => weeklyVolume(sessions), [sessions]);
  const depthBins = useMemo(() => depthDistribution(sessions), [sessions]);
  const speedBands = useMemo(
    () => speedPerDepthBand(sessions, bandStep),
    [sessions, bandStep],
  );
  const hangStats = useMemo(() => hangTimeDistribution(sessions), [sessions]);
  const progression = useMemo(() => disciplineProgression(sessions), [sessions]);
  const poolPace = useMemo(() => poolPaceProgression(sessions), [sessions]);
  const poolHr = useMemo(() => poolHrPerDive(sessions), [sessions]);
  const poolTypeMix = useMemo(() => poolSessionTypeMix(sessions), [sessions]);
  const holdDur = useMemo(() => holdDurationTrend(sessions), [sessions]);
  const contractionBands = useMemo(() => contractionsPerBand(sessions), [sessions]);
  const recoveryTimes = useMemo(() => recoveryTimePerHold(sessions), [sessions]);
  const firstMinute = useMemo(() => diveReflexFirstMinute(sessions), [sessions]);
  const hrAroundC = useMemo(() => hrAroundContractions(sessions), [sessions]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            Insights
          </h1>
          <p className="mt-1 font-mono text-xs text-textDim">
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
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
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {tab === 'breathhold' && (
          <>
            <div className="lg:col-span-2">
              <SpO2ZonesChart data={spo2Trend} />
            </div>
            <div className="lg:col-span-2">
              <HoldDurationTrendChart series={holdDur} />
            </div>
            <RecoveryTimeChart points={recoveryTimes} />
            <ContractionsPerBandChart bands={contractionBands} />
            <DiveReflexFirstMinuteChart points={firstMinute} />
            <HrAroundContractionsChart points={hrAroundC} />
          </>
        )}

        {tab === 'depth' && (
          <>
            <DepthDistributionChart bins={depthBins} />
            <SpeedPerDepthBandChart
              bands={speedBands}
              step={bandStep}
              onStepChange={setBandStep}
            />
            <HangTimeDistributionChart stats={hangStats} />
            <DisciplineProgressionChart series={progression} />
          </>
        )}

        {tab === 'pool' && (
          <>
            <DisciplineBestsCard bests={bests} />
            <DistanceDistributionChart bins={distBins} />
            <div className="lg:col-span-2">
              <PoolPaceChart series={poolPace} />
            </div>
            <div className="lg:col-span-2">
              <PoolHrChart points={poolHr} />
            </div>
            <div className="lg:col-span-2">
              <PoolSessionTypeMixChart buckets={poolTypeMix} />
            </div>
          </>
        )}

        {tab === 'balance' && (
          <>
            <div className="lg:col-span-2">
              <TrainingHeatmap series={heatmap.series} />
            </div>
            <SessionTagDistributionChart data={tagDist} />
            <EffortDistributionChart data={effortDist} />
            <div className="lg:col-span-2">
              <WeeklyVolumeChart data={weekVol} />
            </div>
            <div className="lg:col-span-2">
              <ComingSoon items={['Plan adherence']} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ComingSoon({ items }: { items: string[] }) {
  return (
    <section className="mt-6 rounded-lg border border-dashed border-border bg-panel px-6 py-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-textDim">
        coming next
      </p>
      <ul className="grid grid-cols-1 gap-1 text-sm text-textDim sm:grid-cols-2">
        {items.map((it) => (
          <li key={it}>· {it}</li>
        ))}
      </ul>
    </section>
  );
}
