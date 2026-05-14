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
import { spo2ExposureZones } from '../lib/analytics/spo2Zones';
import { disciplineBests } from '../lib/analytics/poolBests';
import { distanceDistribution } from '../lib/analytics/poolDistance';
import { trainingDaysHeatmap } from '../lib/analytics/heatmap';
import {
  sessionTagDistribution,
  effortDistribution,
  weeklyVolume,
} from '../lib/analytics/balance';
import { SpO2ZonesChart } from '../components/charts/SpO2ZonesChart';
import { DisciplineBestsCard } from '../components/charts/DisciplineBestsCard';
import { DistanceDistributionChart } from '../components/charts/DistanceDistributionChart';
import { TrainingHeatmap } from '../components/charts/TrainingHeatmap';
import { SessionTagDistributionChart } from '../components/charts/SessionTagDistributionChart';
import { EffortDistributionChart } from '../components/charts/EffortDistributionChart';
import { WeeklyVolumeChart } from '../components/charts/WeeklyVolumeChart';

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

  if (!backup) return <Navigate to="/" replace />;

  // All four calculations are memoized against the backup. They're cheap
  // but we recompute on tab switches otherwise.
  const sessions = backup.data.sessions;
  const zones = useMemo(() => spo2ExposureZones(sessions), [sessions]);
  const bests = useMemo(() => disciplineBests(sessions), [sessions]);
  const distBins = useMemo(() => distanceDistribution(sessions), [sessions]);
  const heatmap = useMemo(() => trainingDaysHeatmap(sessions), [sessions]);
  const tagDist = useMemo(() => sessionTagDistribution(sessions), [sessions]);
  const effortDist = useMemo(() => effortDistribution(sessions), [sessions]);
  const weekVol = useMemo(() => weeklyVolume(sessions), [sessions]);

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
          <div className="lg:col-span-2">
            <SpO2ZonesChart zones={zones} />
            <ComingSoon items={[
              'Recovery Time per Hold',
              'Hold Duration trend',
              'Contractions per 30s band',
              'Dive Reflex: First Minute',
              'HR Drop after Contractions',
            ]} />
          </div>
        )}

        {tab === 'depth' && (
          <div className="lg:col-span-2">
            <ComingSoon items={[
              'Depth distribution',
              'Avg Speed per Depth Band',
              'Hang time analysis',
              'Discipline progression',
            ]} />
          </div>
        )}

        {tab === 'pool' && (
          <>
            <DisciplineBestsCard bests={bests} />
            <DistanceDistributionChart bins={distBins} />
            <div className="lg:col-span-2">
              <ComingSoon items={[
                'Pace per dive (lap times)',
                'Heart rate per dive',
                'CO₂/O₂ training mix',
              ]} />
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
