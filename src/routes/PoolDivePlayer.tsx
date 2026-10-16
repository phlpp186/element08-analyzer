/**
 * PoolDivePlayer: one pool dive on one screen.
 *
 * URL: /session/:sessionId/pool/:diveIdx[?tab=hr|depth|speed|motion]
 *
 * Same frame as the depth dive page (DivePageLayout): one chart at a time on
 * the left, stats for the open tab + remarks + the session's dives on the
 * right. The tab lives in the URL so it survives stepping between dives.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { extractPoolDiveData, type PoolDiveData } from '../lib/analytics/poolDiveProfile';
import { PoolDiveTracks } from '../components/charts/PoolDiveTracks';
import { PoolSignalTracks } from '../components/charts/PoolSignalTracks';
import {
  extractPoolTraceData,
  type PoolTraceData,
  type TraceDiveLike,
} from '../lib/analytics/poolTrace';
import { lapSplits } from '../lib/analytics/lapSplits';
import { seriesSummary } from '../lib/analytics/diveTabStats';
import { FullscreenDive, type FullscreenTab } from '../components/FullscreenDive';
import {
  ChartBody,
  ChartCard,
  DiveHeader,
  DiveListCard,
  DivePage,
  PrevNext,
  RemarksCard,
  StatsCard,
  type ChartTab,
  type StatTile,
} from '../components/DivePageLayout';
import { fmtSec, formatClock } from '../lib/divePage';
import type { ParsedSession } from '../schema/backup';
import { formatDate } from '../lib/format';
import { useT } from '../i18n';

type Tab = 'hr' | 'depth' | 'speed' | 'motion';
type PoolSession = Extract<ParsedSession, { mode: 'pool' }>;

/** The pool-dive fields this page reads (the schema keeps dives loose). */
interface PoolDiveRow extends TraceDiveLike {
  discipline: string;
  diveType?: string;
  distance: number | null;
  diveTime: number;
  si?: number;
  turns?: number | null;
  lapTimes?: number[];
  contractions?: number[];
  hrHighest?: number | null;
  hrLowest?: number | null;
  remarks?: string | null;
  rating?: number | null;
  profile?: { t: number; hr: number | null; depth: number | null; speed: number | null }[];
  hrProfile?: { t: number; hr: number }[];
}

export function PoolDivePlayer() {
  const t = useT();
  const { sessionId, diveIdx } = useParams<{ sessionId: string; diveIdx: string }>();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'pool') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to sessions')}
        </Link>
        <p className="mt-8 text-textDim">{t('Pool dive not found.')}</p>
      </div>
    );
  }

  const dives = (session.dives ?? []) as unknown as PoolDiveRow[];
  const idx = Number(diveIdx);
  const dive = dives[idx];
  if (!dive) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to={`/session/${session.id}`}
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to session')}
        </Link>
        <p className="mt-8 text-textDim">{t('Dive index out of range.')}</p>
      </div>
    );
  }

  return <PoolDiveView session={session} dives={dives} idx={idx} dive={dive} />;
}

/** "50m", or the hold time for a static. */
function headline(d: PoolDiveRow): string {
  return d.discipline === 'STA' ? fmtSec(d.diveTime) : `${d.distance ?? 0}m`;
}

function PoolDiveView({
  session,
  dives,
  idx,
  dive,
}: {
  session: PoolSession;
  dives: PoolDiveRow[];
  idx: number;
  dive: PoolDiveRow;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const diveUrl = (i: number) => `/session/${session.id}/pool/${i}${search}`;
  const [fullscreen, setFullscreen] = useState(false);
  const [fsTab, setFsTab] = useState<'hr' | 'depth' | 'speed'>('hr');

  const data = useMemo(() => extractPoolDiveData(dive), [dive]);
  const traceData = useMemo(() => extractPoolTraceData(dive), [dive]);
  const hasTracks = data.hasHR || data.hasDepth || data.hasSpeed;

  const tabs: ChartTab<Tab>[] = [
    ...(data.hasHR ? [{ id: 'hr' as const, label: t('Heart rate') }] : []),
    ...(data.hasDepth ? [{ id: 'depth' as const, label: t('Depth') }] : []),
    ...(data.hasSpeed ? [{ id: 'speed' as const, label: t('Speed') }] : []),
    ...(traceData ? [{ id: 'motion' as const, label: t('Motion trace') }] : []),
  ];
  const requested = searchParams.get('tab');
  const tab: Tab | null = tabs.find((x) => x.id === requested)?.id ?? tabs[0]?.id ?? null;

  function selectTab(id: Tab) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // The first available tab is the default, so it needs no parameter.
        if (id === tabs[0]?.id) next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  }

  const hasPrev = idx > 0;
  const hasNext = idx < dives.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fullscreen) return;
      const el = document.activeElement;
      if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (e.key === 'ArrowLeft' && hasPrev) navigate(`/session/${session.id}/pool/${idx - 1}${search}`);
      else if (e.key === 'ArrowRight' && hasNext)
        navigate(`/session/${session.id}/pool/${idx + 1}${search}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, hasPrev, hasNext, idx, session.id, navigate, search]);

  const nContr = data.contractionTimes.length;
  const caption: Record<Tab, string> = {
    hr: `${t('Heart Rate')} · bpm${
      nContr > 0 ? ` · ${nContr} ${nContr === 1 ? t('contraction') : t('contractions')} ${t('marked')}` : ''
    }`,
    depth: `${t('Depth')} · m`,
    speed: `${t('Speed')} · m/s`,
    // The trace draws its own titled header (with whose marks they are).
    motion: '',
  };

  const tiles = statTiles(tab, { dive, data, trace: traceData }, t);
  const statsTitle = tab ? (tabs.find((x) => x.id === tab)?.label ?? '') : t('Dive');

  const chart = (
    <ChartCard
      tabs={tabs}
      active={tab}
      onTab={selectTab}
      caption={tab ? caption[tab] || undefined : undefined}
      actions={
        hasTracks && (
          <button
            onClick={() => {
              setFsTab(
                tab === 'hr' || tab === 'depth' || tab === 'speed'
                  ? tab
                  : data.hasHR
                    ? 'hr'
                    : data.hasDepth
                      ? 'depth'
                      : 'speed',
              );
              setFullscreen(true);
            }}
            title={t('Fullscreen analysis')}
            className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-textDim transition-colors hover:border-accent hover:text-accent"
          >
            ⛶ {t('Fullscreen')}
          </button>
        )
      }
    >
      {tab == null ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center text-textDim">
          {t('No profile data recorded for this dive.')}
        </div>
      ) : tab === 'motion' && traceData ? (
        <ChartBody>
          {(h) => (
            <PoolSignalTracks
              data={traceData}
              groupId={`pool-sig-${session.id}-${idx}`}
              fitHeight={h - 4}
            />
          )}
        </ChartBody>
      ) : (
        <ChartBody>
          {(h) => (
            <PoolDiveTracks
              key={tab}
              bare
              data={data}
              groupId={`pool-${session.id}-${idx}`}
              solo={tab === 'motion' ? 'hr' : tab}
              chartHeight={Math.max(200, h - 4)}
            />
          )}
        </ChartBody>
      )}
    </ChartCard>
  );

  const side = (
    <>
      <StatsCard title={statsTitle} tiles={tiles} empty={t('No data for this view.')} />
      <RemarksCard
        title={t('Remarks')}
        remarks={dive.remarks}
        facts={[
          ...(dive.rating != null ? [{ label: t('Dive effort'), value: `${dive.rating}/10` }] : []),
          ...(session.rating != null
            ? [{ label: t('Session effort'), value: `${session.rating}/10` }]
            : []),
        ]}
      />
      <DiveListCard
        title={t('Dives')}
        items={dives.map((d, i) => ({
          key: String(i),
          to: diveUrl(i),
          label: `${t('Dive')} ${i + 1}`,
          detail: `${d.discipline} · ${headline(d)}${d.discipline === 'STA' ? '' : ` · ${fmtSec(d.diveTime)}`}`,
          current: i === idx,
          dim: d.diveType === 'excluded',
        }))}
      />
    </>
  );

  // Pool sessions carry their own HH:mm start; fall back to the timestamp.
  const startTime = typeof session.startTime === 'string' && session.startTime
    ? session.startTime
    : formatClock(session.date);
  const header = (
    <DiveHeader
      backTo={`/session/${session.id}`}
      backLabel={session.name || t('session')}
      title={`${t('Dive')} ${idx + 1} · ${dive.discipline} · ${headline(dive)}`}
      meta={[
        fmtSec(dive.diveTime),
        `${formatDate(session.date)}${startTime ? ` ${startTime}` : ''}`,
        ...(dive.si && dive.si > 0 ? [`SI ${fmtSec(dive.si)}`] : []),
      ].join(' · ')}
      nav={
        <PrevNext
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={() => navigate(diveUrl(idx - 1))}
          onNext={() => navigate(diveUrl(idx + 1))}
          label={`${t('Dive')} ${idx + 1} ${t('of')} ${dives.length}`}
          prevLabel={t('prev')}
          nextLabel={t('next')}
        />
      }
    />
  );

  return (
    <>
      <DivePage header={header} chart={chart} side={side} />
      {fullscreen && (
        <FullscreenDive
          title={`${dive.discipline} · ${headline(dive)}`}
          subtitle={`${formatDate(session.date)} · ${t('Dive')} ${idx + 1} ${t('of')} ${dives.length}`}
          tabs={
            [
              ...(data.hasHR ? [{ id: 'hr', label: t('Heart Rate') }] : []),
              ...(data.hasDepth ? [{ id: 'depth', label: t('Depth') }] : []),
              ...(data.hasSpeed ? [{ id: 'speed', label: t('Speed') }] : []),
            ] as FullscreenTab[]
          }
          active={fsTab}
          onTab={(id) => setFsTab(id as typeof fsTab)}
          onClose={() => setFullscreen(false)}
        >
          {(h) => (
            <PoolDiveTracks
              data={data}
              groupId={`pool-fs-${session.id}-${idx}`}
              solo={fsTab}
              chartHeight={Math.max(220, h - 32)}
            />
          )}
        </FullscreenDive>
      )}
    </>
  );
}

const bpm = (v: number) => `${Math.round(v)} bpm`;
const ms = (v: number) => `${v.toFixed(2)} m/s`;
// fmtSec prints 0 as a dash; a reading at the first sample is t=0s.
const at = (s: number) => `t=${s > 0 ? fmtSec(s) : '0s'}`;

/** The stat tiles for one tab (or the dive's basics when it has no charts).
 *  Only values the dive actually carries; missing ones are left out. */
function statTiles(
  tab: Tab | null,
  ctx: { dive: PoolDiveRow; data: PoolDiveData; trace: PoolTraceData | null },
  t: (s: string) => string,
): StatTile[] {
  const { dive, data, trace } = ctx;
  const tiles: StatTile[] = [];
  const add = (label: string, value: string | null, sub?: string) => {
    if (value != null) tiles.push({ label, value, sub });
  };
  const distance = dive.distance != null && dive.distance > 0 ? dive.distance : null;
  const laps = lapSplits(dive);
  const turns = dive.turns != null && dive.turns > 0 ? dive.turns : null;

  if (tab === null) {
    add(t('Dive time'), dive.diveTime > 0 ? fmtSec(dive.diveTime) : null);
    add(t('Distance'), distance != null ? `${distance}m` : null);
    add(t('Turns'), turns != null ? String(turns) : null);
    add(t('HR high'), dive.hrHighest != null ? bpm(dive.hrHighest) : null);
    add(t('HR low'), dive.hrLowest != null ? bpm(dive.hrLowest) : null);
  } else if (tab === 'hr') {
    const s = seriesSummary(data.hrSeries);
    if (s) {
      add(t('Start'), bpm(s.start));
      add(t('Minimum'), bpm(s.min), at(s.minT));
      const drop = s.start - s.min;
      add(
        t('Drop'),
        drop > 0 ? `-${Math.round(drop)} bpm` : null,
        drop > 0 ? `${Math.round((drop / s.start) * 100)}%` : undefined,
      );
      add(t('At surface'), bpm(s.end));
    }
    add(t('HR high'), dive.hrHighest != null ? bpm(dive.hrHighest) : s ? bpm(s.max) : null);
    if (data.contractionTimes.length > 0) {
      add(
        t('Contractions'),
        String(data.contractionTimes.length),
        at(Math.min(...data.contractionTimes)),
      );
    }
  } else if (tab === 'depth') {
    const s = seriesSummary(data.depthSeries);
    if (s) {
      add(t('Max depth'), `${s.max.toFixed(1)}m`, at(s.maxT));
      const avg = data.depthSeries.reduce((sum, [, d]) => sum + d, 0) / data.depthSeries.length;
      add(t('Avg depth'), `${avg.toFixed(1)}m`);
    }
    add(t('Dive time'), dive.diveTime > 0 ? fmtSec(dive.diveTime) : null);
    add(t('Distance'), distance != null ? `${distance}m` : null);
  } else if (tab === 'speed') {
    add(t('Distance'), distance != null ? `${distance}m` : null);
    add(t('Dive time'), dive.diveTime > 0 ? fmtSec(dive.diveTime) : null);
    add(t('Avg speed'), distance != null && dive.diveTime > 0 ? ms(distance / dive.diveTime) : null);
    const s = seriesSummary(data.speedSeries);
    add(t('Peak speed'), s && s.max > 0 ? ms(s.max) : null, s ? at(s.maxT) : undefined);
    if (laps.length > 1) {
      const sorted = [...laps].sort((a, b) => a.seconds - b.seconds);
      add(t('Fastest lap'), fmtSec(sorted[0].seconds), `L${sorted[0].lap}`);
      add(t('Slowest lap'), fmtSec(sorted[sorted.length - 1].seconds), `L${sorted[sorted.length - 1].lap}`);
    } else {
      add(t('Turns'), turns != null ? String(turns) : null);
    }
  } else if (tab === 'motion' && trace) {
    add(t('Turns'), String(trace.turns.length));
    add(t('Laps'), laps.length > 0 ? String(laps.length) : null);
    add(t('Strokes'), trace.strokes.length > 0 ? String(trace.strokes.length) : null);
    add(t('Kicks'), trace.kicks.length > 0 ? String(trace.kicks.length) : null);
    const counted = laps.filter((l) => l.strokes != null);
    if (counted.length > 0) {
      const avg = counted.reduce((sum, l) => sum + (l.strokes ?? 0), 0) / counted.length;
      add(t('Strokes per lap'), avg.toFixed(1));
    }
    add(t('Dive time'), dive.diveTime > 0 ? fmtSec(dive.diveTime) : null);
  }
  return tiles;
}
