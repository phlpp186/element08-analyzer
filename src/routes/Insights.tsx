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
import { useT } from '../i18n';
import { useBackupStore } from '../stores/useBackupStore';
import { spo2LowestPerSession } from '../lib/analytics/spo2Zones';
import { minSpo2VsDuration, type LungVol } from '../lib/analytics/holdTrends';
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
import { earlyTurnStats, mouthfillStats } from '../lib/analytics/technique';
import { poolPaceProgression } from '../lib/analytics/poolPace';
import { poolHrPerDive } from '../lib/analytics/poolHr';
import { poolSessionTypeMix } from '../lib/analytics/poolSessionTypes';
import {
  holdDurationTrend,
  contractionsPerBand,
  recoveryTimePerHold,
  diveReflexFirstMinute,
  hrAroundContractions,
  // minSpo2VsDuration imported above with the LungVol type re-export.
} from '../lib/analytics/holdTrends';
import { MinSpo2VsDurationChart } from '../components/charts/MinSpo2VsDurationChart';
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
import { EarlyTurnCard } from '../components/charts/EarlyTurnCard';
import { MouthfillCard } from '../components/charts/MouthfillCard';
import { TONE_VAR } from '../lib/tones';
import {
  balanceHeadline,
  breathHoldHeadline,
  depthHeadline,
  periodStart,
  poolHeadline,
  sessionsInPeriod,
  type Period,
  type TabHeadline,
} from '../lib/analytics/insightHeadlines';
import type { ParsedSession } from '../schema/backup';

type Tab = 'breathhold' | 'depth' | 'pool' | 'balance';

const PERIODS: { id: Period; label: string }[] = [
  { id: '3m', label: '3 months' },
  { id: '12m', label: '12 months' },
  { id: 'all', label: 'All time' },
];

const PERIOD_KEY = 'element08.insightsPeriod';

function readPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (v === '3m' || v === '12m' || v === 'all') return v;
  } catch {
    /* storage blocked: fall through */
  }
  return 'all';
}

const NO_SESSIONS: ParsedSession[] = [];

const TABS: { id: Tab; label: string }[] = [
  { id: 'breathhold', label: 'Breath Hold' },
  { id: 'depth',      label: 'Depth' },
  { id: 'pool',       label: 'Pool' },
  { id: 'balance',    label: 'Balance' },
];

export function Insights() {
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const [tab, setTab] = useState<Tab>('breathhold');
  const [bandStep, setBandStep] = useState<BandStep>(10);
  /** Tab-wide lung-volume filter for the Breath Hold tab. Null = all. */
  const [lungVol, setLungVol] = useState<LungVol | null>(null);
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* storage blocked: the choice lasts this visit */
    }
  };

  // Every chart and headline sees only the chosen period. All calculations
  // are memoized: cheap, but they would rerun on every tab switch.
  const allSessions = backup?.data.sessions ?? NO_SESSIONS;
  const sessions = useMemo(() => sessionsInPeriod(allSessions, period), [allSessions, period]);
  const spo2Trend = useMemo(() => spo2LowestPerSession(sessions, lungVol), [sessions, lungVol]);
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
  const earlyTurn = useMemo(() => earlyTurnStats(sessions), [sessions]);
  const mouthfill = useMemo(() => mouthfillStats(sessions), [sessions]);
  const poolPace = useMemo(() => poolPaceProgression(sessions), [sessions]);
  const poolHr = useMemo(() => poolHrPerDive(sessions), [sessions]);
  const poolTypeMix = useMemo(() => poolSessionTypeMix(sessions), [sessions]);
  const holdDur = useMemo(() => holdDurationTrend(sessions, lungVol), [sessions, lungVol]);
  const contractionBands = useMemo(() => contractionsPerBand(sessions, lungVol), [sessions, lungVol]);
  const recoveryTimes = useMemo(() => recoveryTimePerHold(sessions, lungVol), [sessions, lungVol]);
  const firstMinute = useMemo(() => diveReflexFirstMinute(sessions, lungVol), [sessions, lungVol]);
  const hrAroundC = useMemo(() => hrAroundContractions(sessions, lungVol), [sessions, lungVol]);
  const minSpo2Holds = useMemo(() => minSpo2VsDuration(sessions, lungVol), [sessions, lungVol]);

  const headline: TabHeadline = useMemo(() => {
    if (tab === 'depth') {
      return depthHeadline(t, { bins: depthBins, bands: speedBands, hang: hangStats, progression });
    }
    if (tab === 'pool') return poolHeadline(t, { sessions, bests, bins: distBins });
    if (tab === 'balance') {
      return balanceHeadline(t, {
        sessions,
        tags: tagDist,
        effort: effortDist,
        start: periodStart(period),
      });
    }
    return breathHoldHeadline(t, { sessions, holds: holdDur, spo2: spo2Trend, recovery: recoveryTimes });
  }, [tab, t, depthBins, speedBands, hangStats, progression, sessions, bests, distBins, tagDist, effortDist, period, holdDur, spo2Trend, recoveryTimes]);

  if (!backup) return <Navigate to="/" replace />;
  const periodEmpty = sessions.length === 0 && allSessions.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-text">
            {t('Insights')}
          </h1>
          <p className="mt-1 font-mono text-xs text-textDim">
            {sessions.length} {t(sessions.length === 1 ? 'session' : 'sessions')}
          </p>
        </div>
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to sessions')}
        </Link>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="board flex w-fit max-w-full flex-wrap gap-1.5 p-1.5">
          {TABS.map((tabItem) => {
            const active = tab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`pill px-5 py-2 font-mono text-xs uppercase tracking-widest ${active ? 'pill-on' : ''}`}
              >
                {t(tabItem.label)}
              </button>
            );
          })}
        </nav>
        <div role="radiogroup" aria-label={t('Period')} className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`pill px-3 py-1 font-mono text-[11px] uppercase tracking-widest ${period === p.id ? 'pill-on' : ''}`}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      {periodEmpty ? (
        // The charts' own empty states say "in this backup", which is wrong
        // when only the period is empty.
        <p className="board mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-text">
          {t('No sessions in this period.')}
          <button onClick={() => setPeriod('all')} className="pill pill-on px-3 py-1 font-mono text-[11px] uppercase tracking-widest">
            {t('All time')}
          </button>
        </p>
      ) : (
        <HeadlineStrip headline={headline} />
      )}

      <main className={`grid grid-cols-1 gap-6 lg:grid-cols-2 ${periodEmpty ? 'hidden' : ''}`}>
        {tab === 'breathhold' && (
          <>
            <div className="lg:col-span-2">
              <LungVolFilterPills value={lungVol} onChange={setLungVol} />
            </div>
            <div className="lg:col-span-2">
              <SpO2ZonesChart data={spo2Trend} />
            </div>
            <div className="lg:col-span-2">
              <MinSpo2VsDurationChart points={minSpo2Holds} />
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
            <div className="lg:col-span-2">
              <DisciplineProgressionChart series={progression} />
            </div>
            <DepthDistributionChart bins={depthBins} />
            <SpeedPerDepthBandChart
              bands={speedBands}
              step={bandStep}
              onStepChange={setBandStep}
            />
            <HangTimeDistributionChart stats={hangStats} />
            <EarlyTurnCard stats={earlyTurn} />
            <MouthfillCard stats={mouthfill} />
          </>
        )}

        {tab === 'pool' && (
          <>
            <div className="lg:col-span-2">
              <PoolPaceChart series={poolPace} />
            </div>
            <DisciplineBestsCard bests={bests} />
            <DistanceDistributionChart bins={distBins} />
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
              <ComingSoon items={[t('Plan adherence')]} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** The tab's four headline blocks and its one-line takeaway. */
function HeadlineStrip({ headline }: { headline: TabHeadline }) {
  return (
    <section className="mb-6 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {headline.blocks.map((b) => (
          <div
            key={b.label}
            className="tile min-w-0 break-words px-4 py-3"
            style={{ '--tone': TONE_VAR[b.tone] } as React.CSSProperties}
          >
            <div className="tile-value font-num text-2xl font-bold tabular-nums">{b.value}</div>
            <div className="tile-label mt-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest">
              {b.label}
            </div>
          </div>
        ))}
      </div>
      {headline.takeaway && (
        <p className="board px-4 py-3 font-heading text-base text-text">{headline.takeaway}</p>
      )}
    </section>
  );
}

function LungVolFilterPills({
  value,
  onChange,
}: {
  value: LungVol | null;
  onChange: (v: LungVol | null) => void;
}) {
  const t = useT();
  const opts: { id: LungVol | null; label: string }[] = [
    { id: null,  label: 'All' },
    { id: 'FL',  label: 'FL' },
    { id: 'FRC', label: 'FRC' },
    { id: 'RV',  label: 'RV' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
        {t('Lung volume:')}
      </span>
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.label}
            onClick={() => onChange(o.id)}
            className={`pill px-3 py-1 font-mono text-[11px] ${active ? 'pill-on' : ''}`}
          >
            {o.id === null ? t(o.label) : o.label}
          </button>
        );
      })}
    </div>
  );
}

function ComingSoon({ items }: { items: string[] }) {
  const t = useT();
  return (
    <section className="mt-6 rounded-lg border border-dashed border-border bg-panel px-6 py-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-textDim">
        {t('coming next')}
      </p>
      <ul className="grid grid-cols-1 gap-1 text-sm text-textDim sm:grid-cols-2">
        {items.map((it) => (
          <li key={it}>· {it}</li>
        ))}
      </ul>
    </section>
  );
}
