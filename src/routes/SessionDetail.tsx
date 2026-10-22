/**
 * SessionDetail — one session at a glance (Philipp's option A with the
 * overlay, 2026-10-22): the session's figures as coloured blocks, its notes
 * and gear, a chart of all its dives (depth: the profiles laid over each
 * other; pool: a bar per dive; dry: a bar per hold), and the dive list.
 * Pointing at a dive in the list lights it up in the chart. A dive opens
 * its player; dry sessions open the timeline player.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useT } from '../i18n';
import { ModeBlock } from '../components/ModeBlock';
import { useChartTheme, withAlpha, type ChartTheme } from '../lib/chartTheme';
import { useBackupStore } from '../stores/useBackupStore';
import { useDiveCompareStore } from '../stores/useDiveCompareStore';
import { Sparkline } from '../components/Sparkline';
import { DiveOverlayChart } from '../components/charts/DiveOverlayChart';
import ReactECharts from '../components/charts/EChart';
import { extractDiveData } from '../lib/analytics/diveProfile';
import { includeDive } from '../lib/analytics/diveFilter';
import { formatDate, modeColorClass, modeLabel } from '../lib/format';
import { sessionBest } from '../lib/sessionMonth';
import { clock, holds, sessionBlocks, sessionGear } from '../lib/sessionStats';
import { TONE_VAR } from '../lib/tones';
import type { ParsedSession } from '../schema/backup';

/** Downsample a profile series to at most `n` evenly-spaced points for a
 *  cheap sparkline. */
function sample(values: number[], n = 60): number[] {
  if (values.length <= n) return values;
  const step = values.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

export function SessionDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);
  // The dive (or hold) the pointer is on in the list: lit in the chart.
  const [hover, setHover] = useState<number | null>(null);

  if (!backup) return <Navigate to="/" replace />;

  const numericId = Number(id);
  const session = Number.isFinite(numericId) ? getSession(numericId) : undefined;

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <BackLink />
        <p className="mt-8 text-textDim">{t('Session not found.')}</p>
      </div>
    );
  }

  const best = sessionBest(session);
  const place = (session as { location?: string | null }).location?.trim();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BackLink />

      <header className="mt-6 mb-6 flex items-center gap-4">
        <ModeBlock mode={session.mode} size={56} />
        <div className="min-w-0">
          <span
            className={['font-mono text-[10px] uppercase tracking-widest', modeColorClass(session.mode)].join(' ')}
          >
            {t(modeLabel(session.mode))} · {formatDate(session.date)}
            {place ? ` · ${place}` : ''}
          </span>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 font-heading text-3xl tracking-wide text-text">
            <span>{session.name || t('Untitled session')}</span>
            {best && <span className="hero-num whitespace-nowrap text-[2.1rem] leading-none">{best.text}</span>}
          </h1>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {sessionBlocks(session, t).map((b) => (
          <div
            key={b.label}
            className="tile min-w-0 px-4 py-3"
            style={{ '--tone': TONE_VAR[b.tone] } as React.CSSProperties}
          >
            <div className="tile-value truncate font-num text-xl font-bold tabular-nums">{b.value}</div>
            <div className="tile-label mt-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest">
              {b.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {session.mode === 'depth' && <DepthOverlay session={session} hover={hover} />}
        {session.mode === 'pool' && <PoolBars session={session} hover={hover} />}
        {session.mode === 'dry' && <HoldBars session={session} />}
        <NotesCard session={session} />
      </div>

      {session.mode === 'depth' && <DepthDiveList session={session} onHover={setHover} />}
      {session.mode === 'pool' && <PoolDiveList session={session} onHover={setHover} />}
      {session.mode === 'dry' && <DryOpenPlayer sessionId={session.id} />}
    </div>
  );
}

function BackLink() {
  const t = useT();
  return (
    <Link
      to="/sessions"
      className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
    >
      ← {t('back to sessions')}
    </Link>
  );
}

// ─── Notes and gear ─────────────────────────────────────────────────────────

function NotesCard({ session }: { session: ParsedSession }) {
  const t = useT();
  const remarks = session.remarks?.trim() ?? '';
  const diveNotes = ((session as { dives?: { remarks?: string | null }[] }).dives ?? [])
    .map((d, i) => ({ i, text: d.remarks?.trim() ?? '' }))
    .filter((n) => n.text !== '');
  const gear = sessionGear(session, t);
  return (
    <section className="board p-4">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">{t('Notes')}</h2>
      {remarks === '' && diveNotes.length === 0 ? (
        <p className="text-sm text-textDim">{t('No notes for this session.')}</p>
      ) : (
        <>
          {remarks && <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{remarks}</p>}
          {diveNotes.length > 0 && (
            <ul className={`space-y-1.5 ${remarks ? 'mt-3' : ''}`}>
              {diveNotes.map((n) => (
                <li key={n.i} className="flex gap-2 text-xs leading-relaxed">
                  <span className="shrink-0 font-mono text-textDim">
                    {t('Dive')} {n.i + 1}
                  </span>
                  <span className="text-text/85">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {gear.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gear.map((g) => (
            <span key={g} className="pill px-2.5 py-0.5 text-xs">
              {g}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Depth ──────────────────────────────────────────────────────────────────

interface DepthDiveRow {
  depth: number;
  diveTime: number;
  descentTime?: number;
  ascentTime?: number;
  hangTime?: number;
  discipline?: string;
  diveType?: string | null;
  rating?: number | null;
  hr?: number | null;
  profile?: { t: number; d: number }[];
}

/** All the session's profiles on one chart, in the profile colour, later
 *  dives a little stronger; the hovered one lit, the rest faded. */
function DepthOverlay({ session, hover }: { session: ParsedSession; hover: number | null }) {
  const t = useT();
  const ct = useChartTheme();
  const drawn = useMemo(
    () =>
      ((session as { dives?: DepthDiveRow[] }).dives ?? [])
        .map((d, i) => ({ i, data: extractDiveData(d as never) }))
        .filter((x) => x.data.depthSeries.length >= 2),
    [session],
  );
  if (drawn.length === 0) {
    return (
      <section className="board p-6 text-center text-sm text-textDim">
        {t('No dive profiles in this session.')}
      </section>
    );
  }
  const dives = drawn.map((x, k) => {
    const base = 0.4 + 0.6 * ((k + 1) / drawn.length);
    const alpha = hover == null ? base : hover === x.i ? 1 : 0.15;
    return { color: withAlpha(ct.profile, alpha), label: `${t('Dive')} ${x.i + 1}`, data: x.data };
  });
  return (
    <section className="board p-3">
      <h2 className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {t('All dives')}
      </h2>
      <DiveOverlayChart dives={dives} align="start" metric="depth" height={300} showLegend={false} />
    </section>
  );
}

function DepthDiveList({ session, onHover }: { session: ParsedSession; onHover: (i: number | null) => void }) {
  const t = useT();
  const ct = useChartTheme();
  const navigate = useNavigate();
  const setPicks = useDiveCompareStore((s) => s.setPicks);
  const dives: DepthDiveRow[] = (session as { dives?: DepthDiveRow[] }).dives ?? [];
  if (dives.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-panel py-12 text-center text-textDim">
        {t('This depth session has no dives recorded.')}
      </p>
    );
  }
  // The three deepest dives that have a profile, ready to compare.
  const comparable = dives
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => includeDive(d.diveType) && Array.isArray(d.profile) && d.profile.length >= 2)
    .sort((a, b) => b.d.depth - a.d.depth)
    .slice(0, 3);
  return (
    <section className="board overflow-hidden">
      <ul className="divide-y divide-border" onMouseLeave={() => onHover(null)}>
        {dives.map((d, idx) => {
          const depths = Array.isArray(d.profile)
            ? sample(d.profile.map((p) => p.d).filter((x) => typeof x === 'number'))
            : [];
          return (
            <li key={idx} onMouseEnter={() => onHover(idx)}>
              <Link
                to={`/session/${session.id}/dive/${idx}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-abyss/60"
              >
                <div className="w-16 shrink-0 font-mono text-xs uppercase tracking-widest text-textDim">
                  {t('Dive')} {idx + 1}
                </div>
                <EffortBar rating={d.rating ?? null} />
                {depths.length > 1 ? (
                  <Sparkline values={depths} invert color={ct.profile} />
                ) : (
                  <div className="w-24 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-num text-lg font-bold tracking-wide text-profile">{d.depth}m</div>
                  <div className="font-mono text-xs text-textDim">
                    {fmtSec(d.diveTime)} · {t('descent')} {fmtSec(d.descentTime ?? 0)} · {t('hang')}{' '}
                    {fmtSec(d.hangTime ?? 0)} · {t('ascent')} {fmtSec(d.ascentTime ?? 0)}
                    {d.discipline ? ` · ${d.discipline}` : ''}
                  </div>
                </div>
                <span className="font-mono text-xs text-textDim">→</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {comparable.length >= 2 && (
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => {
              setPicks('depth', comparable.map(({ i }) => ({ sessionId: session.id, idx: i })));
              navigate('/compare/dives');
            }}
            className="pill pill-on px-4 py-1.5 text-sm"
          >
            {t('Compare dives {list}').replace(
              '{list}',
              comparable
                .map(({ i }) => i + 1)
                .sort((a, b) => a - b)
                .join(', '),
            )}
          </button>
        </div>
      )}
    </section>
  );
}

/** The dive's effort as a short coloured bar (green easy, amber hard, red
 *  max), blank when the dive was not rated. */
function EffortBar({ rating }: { rating: number | null }) {
  const tone = rating == null ? null : rating >= 8 ? 'red' : rating >= 6 ? 'amber' : 'recover';
  return (
    <span
      className="h-6 w-1.5 shrink-0 rounded-full"
      style={{ background: tone ? TONE_VAR[tone] : 'rgb(var(--c-border))' }}
      title={rating != null ? `${rating}/10` : undefined}
    />
  );
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Bars (pool dives, dry holds) ───────────────────────────────────────────

interface BarItem {
  label: string;
  value: number | null;
  text: string;
  color: string;
}

/** One bar per item with its value on top; the hovered one lit. */
function ItemBars({ title, items, hover }: { title: string; items: BarItem[]; hover: number | null }) {
  const ct = useChartTheme();
  const option = {
    grid: { left: 8, right: 8, top: 24, bottom: 24, containLabel: false },
    xAxis: {
      type: 'category',
      data: items.map((x) => x.label),
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: ct.textDim, fontSize: 10 },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        barWidth: '62%',
        data: items.map((x, i) => ({
          value: x.value,
          itemStyle: {
            color: x.color,
            opacity: hover == null || hover === i ? 1 : 0.3,
            borderRadius: [6, 6, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          color: ct.text,
          fontSize: 11,
          fontWeight: 700,
          formatter: (p: { dataIndex: number }) => items[p.dataIndex]?.text ?? '',
        },
      },
    ],
  };
  return (
    <section className="board p-3">
      <h2 className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">{title}</h2>
      <ReactECharts option={option} style={{ height: 260 }} notMerge />
    </section>
  );
}

// ─── Pool ──────────────────────────────────────────────────────────────────

interface PoolDiveRow {
  discipline: 'STA' | 'DYN' | 'DYNB' | 'DNF' | 'other';
  distance: number | null;
  diveTime: number;
  si: number;
  turns?: number | null;
  rating?: number | null;
  hrHighest?: number | null;
  hrLowest?: number | null;
  profile?: { t: number; hr?: number; depth?: number }[];
  hrProfile?: { t: number; hr: number }[];
}

/** Per-discipline colours from the chart theme — matches DisciplineBestsCard. */
function poolDiscColors(ct: ChartTheme): Record<PoolDiveRow['discipline'], string> {
  return {
    STA: ct.accent,
    DYN: ct.green,
    DYNB: ct.highlight,
    DNF: ct.amber,
    other: ct.textDim,
  };
}

/** Distance per dive; statics have none, so a session of only statics
 *  shows their times instead. */
function PoolBars({ session, hover }: { session: ParsedSession; hover: number | null }) {
  const t = useT();
  const colors = poolDiscColors(useChartTheme());
  const dives: PoolDiveRow[] = (session as { dives?: PoolDiveRow[] }).dives ?? [];
  const allStatic = dives.length > 0 && dives.every((d) => d.discipline === 'STA');
  const items: BarItem[] = dives.map((d, i) => {
    const v = allStatic ? d.diveTime : d.discipline === 'STA' ? null : d.distance;
    return {
      label: `${i + 1}`,
      value: v,
      text: v == null ? '' : allStatic ? clock(v) : `${v}m`,
      color: colors[d.discipline],
    };
  });
  return <ItemBars title={allStatic ? t('Hold time per dive') : t('Distance per dive')} items={items} hover={hover} />;
}

function PoolDiveList({ session, onHover }: { session: ParsedSession; onHover: (i: number | null) => void }) {
  const t = useT();
  const navigate = useNavigate();
  const setPicks = useDiveCompareStore((s) => s.setPicks);
  const POOL_DISC_COLORS = poolDiscColors(useChartTheme());
  const dives: PoolDiveRow[] = (session as { dives?: PoolDiveRow[] }).dives ?? [];
  if (dives.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-panel py-12 text-center text-textDim">
        {t('This pool session has no dives recorded.')}
      </p>
    );
  }
  const comparable = dives
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.discipline !== 'STA' && (d.distance ?? 0) > 0)
    .sort((a, b) => (b.d.distance ?? 0) - (a.d.distance ?? 0))
    .slice(0, 3);
  return (
    <section className="board overflow-hidden">
      <ul className="divide-y divide-border" onMouseLeave={() => onHover(null)}>
        {dives.map((d, idx) => {
          const isSta = d.discipline === 'STA';
          const primary = isSta ? fmtSec(d.diveTime) : `${d.distance ?? 0}m`;
          const hrs = sample(
            (d.profile ?? d.hrProfile ?? [])
              .map((p) => (p as { hr?: number }).hr)
              .filter((x): x is number => typeof x === 'number'),
          );
          return (
            <li key={idx} onMouseEnter={() => onHover(idx)}>
              <Link
                to={`/session/${session.id}/pool/${idx}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-abyss/60"
              >
                <div className="w-16 shrink-0 font-mono text-xs uppercase tracking-widest text-textDim">
                  {t('Dive')} {idx + 1}
                </div>
                <EffortBar rating={d.rating ?? null} />
                {hrs.length > 1 ? (
                  <Sparkline values={hrs} color={POOL_DISC_COLORS[d.discipline]} />
                ) : (
                  <div className="w-24 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-num text-lg font-bold tracking-wide" style={{ color: POOL_DISC_COLORS[d.discipline] }}>
                    {d.discipline} · {primary}
                  </div>
                  <div className="font-mono text-xs text-textDim">
                    {!isSta && `${fmtSec(d.diveTime)} · `}
                    {d.turns != null && d.turns > 0 ? `${d.turns} ${t(d.turns === 1 ? 'turn' : 'turns')} · ` : ''}
                    SI {fmtSec(d.si)}
                    {d.hrHighest != null && d.hrLowest != null && ` · HR ${d.hrLowest}–${d.hrHighest}`}
                  </div>
                </div>
                <span className="font-mono text-xs text-textDim">→</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {comparable.length >= 2 && (
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => {
              setPicks('pool', comparable.map(({ i }) => ({ sessionId: session.id, idx: i })));
              navigate('/compare/dives?mode=pool');
            }}
            className="pill pill-on px-4 py-1.5 text-sm"
          >
            {t('Compare dives {list}').replace(
              '{list}',
              comparable
                .map(({ i }) => i + 1)
                .sort((a, b) => a - b)
                .join(', '),
            )}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Dry ───────────────────────────────────────────────────────────────────

function HoldBars({ session }: { session: ParsedSession }) {
  const t = useT();
  const ct = useChartTheme();
  const items: BarItem[] = holds(session).map((sec, i) => ({
    label: `${i + 1}`,
    value: sec,
    text: clock(sec),
    color: ct.mode.dry,
  }));
  if (items.length === 0) {
    return (
      <section className="board p-6 text-center text-sm text-textDim">{t('No holds in this session.')}</section>
    );
  }
  return <ItemBars title={t('Hold time per hold')} items={items} hover={null} />;
}

function DryOpenPlayer({ sessionId }: { sessionId: number }) {
  const t = useT();
  return (
    <div className="board p-6">
      <p className="text-sm text-textDim">
        {t('Dry sessions are a single continuous timeline, open the full player to scrub through SpO₂, HR, and the block timeline.')}
      </p>
      <Link
        to={`/session/${sessionId}/dry`}
        className="glow-accent mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-widest text-ink hover:opacity-95"
      >
        {t('Open timeline player')} →
      </Link>
    </div>
  );
}
