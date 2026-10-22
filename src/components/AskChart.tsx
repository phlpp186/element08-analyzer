/**
 * AskChart — draws the Ask copilot's chart directive inside its answer
 * (Philipp's option A, 2026-10-22). Directives only POINT at dives or carry
 * filters, so every curve here comes from the loaded logbook, never from the
 * model: dive profiles and speeds reuse the Compare overlays, holds and pool
 * laps their Compare charts, and the timeline, scatters and average profile
 * are drawn from the same local data. Each chart carries a way into the
 * matching analyzer page.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactECharts from './charts/EChart';
import { DiveOverlayChart } from './charts/DiveOverlayChart';
import { HoldOverlayChart } from './charts/HoldOverlayChart';
import { PoolLapCompareChart } from './charts/PoolLapCompareChart';
import { useBackupStore } from '../stores/useBackupStore';
import { COMPARE_COLORS, useDiveCompareStore, type CompareMode } from '../stores/useDiveCompareStore';
import { useChartTheme, type ChartTheme } from '../lib/chartTheme';
import { asAiSessions, buildRows, getField } from '../lib/ai';
import type {
  ChartDirective,
  DiveRef,
  DiveScatterDirective,
  ProfileAvgDirective,
  SeriesChartDirective,
} from '../lib/ai';
import { extractDiveData } from '../lib/analytics/diveProfile';
import { extractHoldSlice } from '../lib/analytics/holdCompare';
import { lapSplits } from '../lib/analytics/lapSplits';
import { depthDots, disciplineColor } from '../lib/analytics/depthInsights';
import { averageProfile } from '../lib/analytics/averageProfile';
import type { ProfilePoint } from '../lib/analytics/diveProfile';
import { sessionDay } from '../lib/sessionDay';
import { formatDate } from '../lib/format';
import type { ParsedSession } from '../schema/backup';
import { useT } from '../i18n';

const NO_SESSIONS: ParsedSession[] = [];
const H = 190;

type AnyDive = Record<string, unknown> & { discipline?: string; depth?: number; distance?: number; diveType?: string };

function mmss(v: number): string {
  return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
}

function inDays(date: string, from?: string, to?: string): boolean {
  const day = sessionDay(date);
  return !(from && day < from.slice(0, 10)) && !(to && day > to.slice(0, 10));
}

/** Where a dive ref opens in the analyzer, by its session's mode. */
function refPath(sessions: ParsedSession[], r: DiveRef): string | null {
  const s = sessions.find((x) => x.id === r.session_id);
  if (!s) return null;
  if (s.mode === 'depth') return `/session/${s.id}/dive/${r.dive_index}`;
  if (s.mode === 'pool') return `/session/${s.id}/pool/${r.dive_index}`;
  return `/session/${s.id}/dry`;
}

function refLabel(sessions: ParsedSession[], r: DiveRef, t: (s: string) => string): string {
  const s = sessions.find((x) => x.id === r.session_id);
  if (!s) return '?';
  if (s.mode === 'dry') return `${formatDate(s.date)} · ${t('Hold')} ${r.dive_index + 1}`;
  const d = (s as { dives?: AnyDive[] }).dives?.[r.dive_index];
  const v = s.mode === 'pool' ? d?.distance : d?.depth;
  // The dive number keeps two dives of one session apart (chart legends
  // merge equal names).
  return `${formatDate(s.date)} · #${r.dive_index + 1} ${d?.discipline || ''} ${typeof v === 'number' ? `${v} m` : ''}`.trim();
}

export function AskChart({ chart }: { chart: ChartDirective }) {
  const t = useT();
  const sessions = useBackupStore((s) => s.backup?.data.sessions) ?? NO_SESSIONS;
  switch (chart.type) {
    case 'bar':
    case 'line':
    case 'scatter':
    case 'histogram':
      return <SeriesChart chart={chart} />;
    case 'dive_profile':
    case 'dive_compare':
    case 'dive_speed':
    case 'dive_bands':
      return <DiveRefsChart title={chart.title} refs={chart.dives} kind={chart.type} sessions={sessions} />;
    case 'hold_compare':
      return <HoldRefsChart title={chart.title} refs={chart.dives} sessions={sessions} />;
    case 'pool_compare':
      return <PoolRefsChart title={chart.title} refs={chart.dives} sessions={sessions} />;
    case 'open_dive':
      return (
        <Frame title={chart.title}>
          <Actions>
            {chart.dives.slice(0, 4).map((r) => {
              const to = refPath(sessions, r);
              return to ? <Action key={to} to={to} label={refLabel(sessions, r, t)} /> : null;
            })}
          </Actions>
        </Frame>
      );
    case 'open_insights':
      return (
        <Frame title={chart.title}>
          <Actions>
            <Action to={`/insights${chart.tab ? `?tab=${chart.tab}` : ''}`} label={t('Open Insights')} />
          </Actions>
        </Frame>
      );
    case 'depth_timeline':
      return <DepthTimeline title={chart.title} discipline={chart.discipline} from={chart.date_from} to={chart.date_to} sessions={sessions} />;
    case 'pool_scatter':
      return <PoolScatter title={chart.title} discipline={chart.discipline} from={chart.date_from} to={chart.date_to} sessions={sessions} />;
    case 'dive_scatter':
      return <MetricScatter chart={chart} sessions={sessions} />;
    case 'profile_avg':
      return <AvgProfile chart={chart} sessions={sessions} />;
    default:
      return null;
  }
}

// ─── frame ─────────────────────────────────────────────────────────────────

function Frame({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="board mt-2 p-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-heading text-xs font-bold text-text">{title}</span>
        {sub && <span className="shrink-0 font-mono text-[10px] text-textDim">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>;
}

function Action({ to, label, onClick }: { to?: string; label: string; onClick?: () => void }) {
  const cls = 'pill px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest';
  return to ? (
    <Link to={to} className={cls}>
      {label} ›
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {label} ›
    </button>
  );
}

/** Which colour is which dive; the drawer is too narrow for a chart legend. */
function Key({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 font-mono text-[10px] text-textDim">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.color }} />
          <span className="truncate">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function Empty() {
  const t = useT();
  return <p className="py-4 text-center text-xs text-textDim">{t('No matching dives in your logbook.')}</p>;
}

/** "Open in Compare" with these refs already picked. */
function CompareAction({ mode, refs }: { mode: CompareMode; refs: DiveRef[] }) {
  const t = useT();
  const navigate = useNavigate();
  const setPicks = useDiveCompareStore((s) => s.setPicks);
  return (
    <Action
      label={t('Open in Compare')}
      onClick={() => {
        setPicks(mode, refs.map((r) => ({ sessionId: r.session_id, idx: r.dive_index })));
        navigate(`/compare/dives?mode=${mode}`);
      }}
    />
  );
}

/** The single-dive action, or Compare for several. */
function RefActions({ refs, mode, sessions }: { refs: DiveRef[]; mode: CompareMode; sessions: ParsedSession[] }) {
  const t = useT();
  const to = refs.length === 1 ? refPath(sessions, refs[0]) : null;
  return (
    <Actions>
      {to ? <Action to={to} label={mode === 'holds' ? t('Open session') : t('Open dive')} /> : <CompareAction mode={mode} refs={refs} />}
    </Actions>
  );
}

// ─── series ────────────────────────────────────────────────────────────────

function SeriesChart({ chart }: { chart: SeriesChartDirective }) {
  const ct = useChartTheme();
  const fmt = (v: number) => (chart.format === 'mmss' ? mmss(v) : String(Math.round(v * 10) / 10));
  const option = {
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number }) => `${p.name}: ${fmt(p.value)}`,
    },
    xAxis: {
      type: 'category',
      data: chart.series.map((s) => s.label),
      axisLabel: { color: ct.textDim, fontSize: 9 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: chart.type !== 'bar' && chart.type !== 'histogram',
      axisLabel: { color: ct.textDim, fontSize: 9, formatter: fmt },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        type: chart.type === 'histogram' ? 'bar' : chart.type,
        data: chart.series.map((s) => s.value),
        itemStyle: { color: ct.profile },
        lineStyle: { color: ct.profile, width: 2.5 },
        symbolSize: 7,
        barMaxWidth: 26,
        label: chart.series.length <= 8 && chart.type !== 'line' && chart.type !== 'scatter'
          ? { show: true, position: 'top', color: ct.text, fontSize: 10, fontWeight: 700, formatter: (p: { value: number }) => fmt(p.value) }
          : undefined,
      },
    ],
  };
  return (
    <Frame title={chart.title}>
      <ReactECharts option={option} style={{ height: H - 20 }} notMerge />
    </Frame>
  );
}

// ─── dive refs ─────────────────────────────────────────────────────────────

function DiveRefsChart({
  title,
  refs,
  kind,
  sessions,
}: {
  title: string;
  refs: DiveRef[];
  kind: 'dive_profile' | 'dive_compare' | 'dive_speed' | 'dive_bands';
  sessions: ParsedSession[];
}) {
  const t = useT();
  const dives = useMemo(() => {
    const out = [];
    for (const r of refs.slice(0, 3)) {
      const s = sessions.find((x) => x.id === r.session_id);
      const dive = s?.mode === 'depth' ? (s as { dives?: AnyDive[] }).dives?.[r.dive_index] : null;
      if (!s || !dive) continue;
      out.push({
        color: COMPARE_COLORS[out.length % COMPARE_COLORS.length],
        label: refLabel(sessions, r, t),
        data: extractDiveData(dive as never),
      });
    }
    return out;
  }, [refs, sessions, t]);
  if (dives.length === 0) return <Empty />;
  return (
    <Frame title={title}>
      <DiveOverlayChart
        dives={dives}
        align="start"
        metric={kind === 'dive_speed' ? 'speed' : 'depth'}
        speedStep={kind === 'dive_bands' ? 5 : 0}
        showLegend={false}
        height={H}
      />
      {dives.length > 1 && <Key items={dives} />}
      <RefActions refs={refs} mode="depth" sessions={sessions} />
    </Frame>
  );
}

function HoldRefsChart({ title, refs, sessions }: { title: string; refs: DiveRef[]; sessions: ParsedSession[] }) {
  const t = useT();
  const holds = useMemo(() => {
    const out = [];
    for (const r of refs.slice(0, 4)) {
      const s = sessions.find((x) => x.id === r.session_id);
      const slice = s?.mode === 'dry' ? extractHoldSlice(s, r.dive_index) : null;
      if (!slice) continue;
      out.push({
        color: COMPARE_COLORS[out.length % COMPARE_COLORS.length],
        label: refLabel(sessions, r, t),
        durationSec: slice.durationSec,
        hrSeries: slice.hrSeries,
        spo2Series: slice.spo2Series,
      });
    }
    return out;
  }, [refs, sessions, t]);
  if (holds.length === 0) return <Empty />;
  return (
    <Frame title={title}>
      <HoldOverlayChart holds={holds} align="start" groupId={`ask-holds-${title}`} />
      <RefActions refs={refs} mode="holds" sessions={sessions} />
    </Frame>
  );
}

function PoolRefsChart({ title, refs, sessions }: { title: string; refs: DiveRef[]; sessions: ParsedSession[] }) {
  const t = useT();
  const dives = useMemo(() => {
    const out = [];
    for (const r of refs.slice(0, 4)) {
      const s = sessions.find((x) => x.id === r.session_id);
      const dive = s?.mode === 'pool' ? (s as { dives?: AnyDive[] }).dives?.[r.dive_index] : null;
      if (!dive) continue;
      out.push({
        color: COMPARE_COLORS[out.length % COMPARE_COLORS.length],
        label: refLabel(sessions, r, t),
        laps: lapSplits(dive as never),
      });
    }
    return out;
  }, [refs, sessions, t]);
  if (dives.length === 0) return <Empty />;
  return (
    <Frame title={title}>
      <PoolLapCompareChart dives={dives} />
      <RefActions refs={refs} mode="pool" sessions={sessions} />
    </Frame>
  );
}

// ─── whole-logbook charts ──────────────────────────────────────────────────

interface Dot {
  value: [number, number];
  itemStyle: { color: string };
  to: string;
}

function DotChart({
  dots,
  ct,
  xTime,
  inverse,
  xName,
  yName,
}: {
  dots: Dot[];
  ct: ChartTheme;
  xTime: boolean;
  inverse?: boolean;
  xName?: string;
  yName?: string;
}) {
  const navigate = useNavigate();
  const option = {
    grid: { left: 8, right: 12, top: yName ? 22 : 10, bottom: xName ? 20 : 4, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (p: { value: [number, number] }) =>
        `${xTime ? new Date(p.value[0]).toLocaleDateString() : Math.round(p.value[0] * 10) / 10} · ${Math.round(p.value[1] * 10) / 10}`,
    },
    xAxis: {
      type: xTime ? 'time' : 'value',
      scale: !xTime,
      name: xName,
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: { color: ct.textDim, fontSize: 10 },
      axisLabel: { color: ct.textDim, fontSize: 9, hideOverlap: true },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse,
      scale: true,
      name: yName,
      nameTextStyle: { color: ct.textDim, fontSize: 10, align: 'left' },
      axisLabel: { color: ct.textDim, fontSize: 9 },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [{ type: 'scatter', data: dots, symbolSize: 8, itemStyle: { borderColor: '#ffffff', borderWidth: 1 }, cursor: 'pointer' }],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: H }}
      notMerge
      onEvents={{ click: (p: { data?: Dot }) => p.data?.to && navigate(p.data.to) }}
    />
  );
}

function DepthTimeline({
  title,
  discipline,
  from,
  to,
  sessions,
}: {
  title: string;
  discipline?: string;
  from?: string;
  to?: string;
  sessions: ParsedSession[];
}) {
  const t = useT();
  const ct = useChartTheme();
  const dots = useMemo(() => {
    const disc = discipline?.trim().toUpperCase() || null;
    return depthDots(sessions)
      .filter((d) => (!disc || d.discipline === disc) && inDays(d.date, from, to))
      .map((d) => ({
        value: [Date.parse(d.date), d.depth] as [number, number],
        itemStyle: { color: d.color },
        to: `/session/${d.sessionId}/dive/${d.diveIdx}`,
      }));
  }, [sessions, discipline, from, to]);
  if (dots.length === 0) return <Empty />;
  return (
    <Frame title={title} sub={t('{n} dives').replace('{n}', String(dots.length))}>
      <DotChart dots={dots} ct={ct} xTime inverse />
      <Actions>
        <Action to="/insights?tab=depth" label={t('Open Insights')} />
      </Actions>
    </Frame>
  );
}

function PoolScatter({
  title,
  discipline,
  from,
  to,
  sessions,
}: {
  title: string;
  discipline?: string;
  from?: string;
  to?: string;
  sessions: ParsedSession[];
}) {
  const t = useT();
  const ct = useChartTheme();
  const dots = useMemo(() => {
    const disc = discipline?.trim().toUpperCase() || null;
    const out: Dot[] = [];
    for (const s of sessions) {
      if (s.mode !== 'pool' || !inDays(s.date, from, to)) continue;
      ((s as { dives?: AnyDive[] }).dives ?? []).forEach((d, i) => {
        const dd = (d.discipline ?? '').toString().toUpperCase();
        if (d.diveType === 'excluded' || (disc && dd !== disc)) return;
        if (typeof d.distance !== 'number' || typeof d.diveTime !== 'number' || d.distance <= 0) return;
        out.push({ value: [d.diveTime, d.distance], itemStyle: { color: disciplineColor(dd) }, to: `/session/${s.id}/pool/${i}` });
      });
    }
    return out;
  }, [sessions, discipline, from, to]);
  if (dots.length === 0) return <Empty />;
  return (
    <Frame title={title} sub={t('{n} dives').replace('{n}', String(dots.length))}>
      <DotChart dots={dots} ct={ct} xTime={false} xName={`${t('Time')} (s)`} yName="m" />
      <Actions>
        <Action to="/insights?tab=pool" label={t('Open Insights')} />
      </Actions>
    </Frame>
  );
}

function MetricScatter({ chart, sessions }: { chart: DiveScatterDirective; sessions: ParsedSession[] }) {
  const t = useT();
  const ct = useChartTheme();
  const ai = useMemo(() => asAiSessions(sessions), [sessions]);
  const dots = useMemo(() => {
    const disc = chart.discipline?.trim().toUpperCase() || null;
    const out: Dot[] = [];
    for (const r of buildRows(ai, chart.dataset)) {
      if (!r.day || (chart.date_from && r.day < chart.date_from.slice(0, 10)) || (chart.date_to && r.day > chart.date_to.slice(0, 10))) continue;
      if (r.dataset !== 'dry' && (r.dive as { diveType?: string }).diveType === 'excluded') continue;
      const d = getField(r, 'discipline');
      const dd = typeof d === 'string' ? d.toUpperCase() : '';
      if (disc && dd !== disc) continue;
      const x = getField(r, chart.x);
      const y = getField(r, chart.y);
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const to =
        r.dataset === 'depth'
          ? `/session/${r.session.id}/dive/${r.diveIdx}`
          : r.dataset === 'pool'
            ? `/session/${r.session.id}/pool/${r.diveIdx}`
            : `/session/${r.session.id}/dry`;
      out.push({ value: [x, y], itemStyle: { color: dd ? disciplineColor(dd) : ct.profile }, to });
    }
    return out.slice(-400);
  }, [ai, chart, ct.profile]);
  if (dots.length < 2) return <Empty />;
  return (
    <Frame title={chart.title} sub={t('{n} dives').replace('{n}', String(dots.length))}>
      <DotChart dots={dots} ct={ct} xTime={false} xName={chart.x_label || chart.x} yName={chart.y_label || chart.y} />
    </Frame>
  );
}

function AvgProfile({ chart, sessions }: { chart: ProfileAvgDirective; sessions: ParsedSession[] }) {
  const t = useT();
  const ct = useChartTheme();
  const avg = useMemo(() => {
    const disc = chart.discipline?.trim().toUpperCase() || null;
    const type = chart.diveType?.trim().toLowerCase() || null;
    const profiles: ProfilePoint[][] = [];
    for (const s of sessions) {
      if (s.mode !== 'depth' || !inDays(s.date, chart.date_from, chart.date_to)) continue;
      for (const d of (s as { dives?: (AnyDive & { profile?: ProfilePoint[] })[] }).dives ?? []) {
        if (d.diveType === 'excluded' || d.discipline === 'MIX') continue;
        // A diveType filter overrides the usual warm-up / safety hiding.
        if (type ? d.diveType !== type : d.diveType === 'warmup' || d.diveType === 'safety') continue;
        if (disc && (d.discipline ?? '').toUpperCase() !== disc) continue;
        const depth = typeof d.depth === 'number' ? d.depth : 0;
        if (chart.depth_min != null && depth < chart.depth_min) continue;
        if (chart.depth_max != null && depth > chart.depth_max) continue;
        if (d.profile && d.profile.length >= 2 && depth > 0) profiles.push(d.profile);
      }
    }
    return averageProfile(profiles);
  }, [sessions, chart]);
  if (!avg) return <Empty />;
  // A category axis of the samples: the spread band stacks on its lower
  // edge, which only lines up reliably by index.
  const secs = avg.points.map((p) => p.f * avg.avgDurationSec);
  const option = {
    grid: { left: 8, right: 12, top: 10, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (ps: { seriesName: string; dataIndex: number; value: number }[]) => {
        const mean = ps.find((p) => p.seriesName === 'mean');
        return mean ? `${mmss(secs[mean.dataIndex])} · ${mean.value.toFixed(1)} m` : '';
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: secs.map(mmss),
      axisLabel: { color: ct.textDim, fontSize: 9, interval: 9 },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 0,
      axisLabel: { color: ct.textDim, fontSize: 9 },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      { name: 'lo', type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, data: avg.points.map((p) => p.minDepth) },
      {
        name: 'band',
        type: 'line',
        stack: 'band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: ct.profile, opacity: 0.18 },
        data: avg.points.map((p) => p.maxDepth - p.minDepth),
      },
      { name: 'mean', type: 'line', symbol: 'none', smooth: 0.3, lineStyle: { color: ct.profile, width: 3 }, data: avg.points.map((p) => p.meanDepth) },
    ],
  };
  return (
    <Frame title={chart.title} sub={t('{n} dives').replace('{n}', String(avg.n))}>
      <ReactECharts option={option} style={{ height: H }} notMerge />
      <Actions>
        <Action to="/insights?tab=depth" label={t('Open Insights')} />
      </Actions>
    </Frame>
  );
}
