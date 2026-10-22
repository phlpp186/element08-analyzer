/**
 * DepthDivePlayer: one depth dive on one screen.
 *
 * URL: /session/:sessionId/dive/:diveIdx[?tab=speed|hr|temp|bands]
 *
 * Left, a chart card showing one chart at a time (profile, speed, heart rate,
 * temperature, depth bands) with that chart's own controls; right, the stats
 * for the open tab, the dive's remarks and the session's dive list. The tab
 * lives in the URL so it survives stepping between dives and deep links.
 * Sources come from the loaded backup in useBackupStore: no fetches.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import {
  usualCompare,
  type UsualCompare,
  type UsualMetric,
  type UsualRow,
} from '../lib/analytics/usualCompare';
import { TONE_VAR } from '../lib/tones';
import { useHangOverridesStore } from '../stores/useHangOverridesStore';
import {
  extractDiveData,
  type ContractionOnset,
  type HangSegment,
  type ProfilePoint,
} from '../lib/analytics/diveProfile';
import { effectiveHangs, diveTimes } from '../lib/analytics/effectiveHangs';
import { edgeSpeeds, seriesSummary, speedPeaks } from '../lib/analytics/diveTabStats';
import { DepthDiveTracks, type AlarmLite } from '../components/charts/DepthDiveTracks';
import { HangEditorPopover } from '../components/HangEditorPopover';
import { FullscreenDive, type FullscreenTab } from '../components/FullscreenDive';
import { BandSizePicker, SpeedBandsTable } from '../components/SpeedBands';
import {
  bandLabel,
  bandSpeed,
  computeBands,
  type BandRow,
  type BandSize,
} from '../lib/analytics/speedBands';
import {
  ChartBody,
  ChartCard,
  DiveHeader,
  DiveListCard,
  DivePage,
  PrevNext,
  RemarksCard,
  SideCard,
  StatsCard,
  type ChartTab,
  type StatTile,
  type Tone,
} from '../components/DivePageLayout';
import { ctrlLabelCls, fmtSec, formatClock, pillCls } from '../lib/divePage';
import type { ParsedSession } from '../schema/backup';
import { formatDate } from '../lib/format';
import { useT } from '../i18n';

type Tab = 'profile' | 'speed' | 'hr' | 'temp' | 'bands';
type DepthSession = Extract<ParsedSession, { mode: 'depth' }>;

/** The depth-dive fields this page reads (the schema keeps dives loose). */
interface DepthDiveRow {
  depth: number;
  diveTime: number;
  si?: number;
  discipline?: string;
  diveType?: string;
  descentTime?: number;
  ascentTime?: number;
  hangTime?: number;
  descentSpeed?: number;
  ascentSpeed?: number;
  hr?: number | null;
  tempDepth?: number | null;
  contractionOnset?: ContractionOnset | null;
  mfChargeDepth?: number | null;
  remarks?: string | null;
  rating?: number | null;
  profile?: ProfilePoint[];
  hangs?: HangSegment[];
}

export function DepthDivePlayer() {
  const t = useT();
  const { sessionId, diveIdx } = useParams<{ sessionId: string; diveIdx: string }>();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'depth') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to sessions')}
        </Link>
        <p className="mt-8 text-textDim">{t('Depth dive not found.')}</p>
      </div>
    );
  }

  const dives = (session.dives ?? []) as unknown as DepthDiveRow[];
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

  return <DepthDiveView session={session} dives={dives} idx={idx} dive={dive} />;
}

function DepthDiveView({
  session,
  dives,
  idx,
  dive,
}: {
  session: DepthSession;
  dives: DepthDiveRow[];
  idx: number;
  dive: DepthDiveRow;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const diveUrl = (i: number) => `/session/${session.id}/dive/${i}${search}`;

  // Depth-track overlay toggles. Alarms default ON (they're dive-computer
  // safety config, worth seeing); speed markers default OFF (opt-in
  // detail). speedStep: 0 = off, else 5 or 10 metres.
  const [showAlarms, setShowAlarms] = useState(true);
  // The profile line coloured by speed: on, it shows where the dive sped up
  // or braked without opening the Speed tab.
  const [colorBySpeed, setColorBySpeed] = useState(true);
  const [speedStep, setSpeedStep] = useState<0 | 5 | 10>(0);
  // Vertical-speed smoothing window in samples, driven by a continuous
  // slider: 0/1 = raw, up to 31 = heavy moving average (FIM dives
  // oscillate hard). Odd values keep the average centred.
  const [speedSmooth, setSpeedSmooth] = useState(0);
  const [speedAxis, setSpeedAxis] = useState<'time' | 'depth'>('time');
  const [speedDepthOverlay, setSpeedDepthOverlay] = useState(false);
  const [bandSize, setBandSize] = useState<BandSize>(5);
  const [editHangs, setEditHangs] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  // Which hang band is being edited + the click position that anchors the
  // editor popover. Null = no popover.
  const [selectedHang, setSelectedHang] = useState<{ idx: number; x: number; y: number } | null>(
    null,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [fsTab, setFsTab] = useState<'depth' | 'speed' | 'hr' | 'temp'>('depth');

  // Stepping to another dive keeps the view settings but drops anything tied
  // to the old dive's seconds (an A->B selection, an open hang editor).
  const diveKey = `${session.id}-${idx}`;
  const [seenKey, setSeenKey] = useState(diveKey);
  if (seenKey !== diveKey) {
    setSeenKey(diveKey);
    setMeasuring(false);
    setSelectedHang(null);
  }

  // Manual hang overrides, persisted to localStorage so user corrections
  // survive a reload as long as the same backup is re-imported.
  const overrideRaw = useHangOverridesStore((s) => s.overrides[`${session.id}-${idx}`]);
  const setOverride = useHangOverridesStore((s) => s.set);
  const clearOverride = useHangOverridesStore((s) => s.clear);

  const data = useMemo(() => extractDiveData(dive), [dive]);
  const effective = useMemo(
    () => effectiveHangs(overrideRaw, data.hangs),
    [overrideRaw, data.hangs],
  );
  const dataWithHangs = useMemo(() => ({ ...data, hangs: effective }), [data, effective]);
  const times = useMemo(
    () => diveTimes(data.points, effective, data.maxDepth),
    [data.points, effective, data.maxDepth],
  );
  const bands = useMemo(() => computeBands(dataWithHangs, bandSize), [dataWithHangs, bandSize]);
  const hasOverride = overrideRaw !== undefined;
  const hasProfile = data.points.length >= 2;

  const alarms = (session.alarms ?? []) as AlarmLite[];
  const hasDepthAlarms = alarms.some(
    (a) => a.enabled !== false && a.type === 'depth' && a.depth != null && a.depth > 0,
  );

  const tabs: ChartTab<Tab>[] = [
    { id: 'profile', label: t('Profile') },
    ...(hasProfile && data.hasSpeed ? [{ id: 'speed' as const, label: t('Speed') }] : []),
    ...(data.hasHR ? [{ id: 'hr' as const, label: t('Heart rate') }] : []),
    ...(data.hasTemp ? [{ id: 'temp' as const, label: t('Temperature') }] : []),
    ...(bands.length > 0 ? [{ id: 'bands' as const, label: t('Depth bands') }] : []),
  ];
  const requested = searchParams.get('tab');
  const tab: Tab = tabs.find((x) => x.id === requested)?.id ?? 'profile';
  const tabLabel = tabs.find((x) => x.id === tab)?.label ?? '';

  function selectTab(id: Tab) {
    setMeasuring(false);
    setSelectedHang(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'profile') next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  }

  function setHangs(next: HangSegment[]) {
    setOverride(session.id, idx, next);
  }
  function handleEditHang(updated: HangSegment) {
    if (!selectedHang) return;
    setHangs(effective.map((h, i) => (i === selectedHang.idx ? updated : h)));
  }
  function handleDeleteHang() {
    if (!selectedHang) return;
    setHangs(effective.filter((_, i) => i !== selectedHang.idx));
    setSelectedHang(null);
  }
  function handleAddHang(e: React.MouseEvent<HTMLButtonElement>) {
    // Drop a default 5-second bottom hang centred on the deepest sample,
    // clamped to the dive's time bounds, and open its editor straight away
    // so the user can nudge start/end.
    let maxT = data.points[0]?.t ?? 0;
    let bestD = data.points[0]?.d ?? 0;
    for (const p of data.points) {
      if (p.d > bestD) {
        bestD = p.d;
        maxT = p.t;
      }
    }
    const newHang: HangSegment = {
      startT: Math.max(data.startT, Math.round(maxT - 2)),
      endT: Math.min(data.endT, Math.round(maxT + 3)),
      avgD: data.maxDepth,
      type: 'bottom',
    };
    const next = [...effective, newHang];
    setHangs(next);
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedHang({ idx: next.length - 1, x: rect.left, y: rect.bottom });
  }
  function handleResetHangs() {
    clearOverride(session.id, idx);
    setSelectedHang(null);
  }

  const hasPrev = idx > 0;
  const hasNext = idx < dives.length - 1;

  // Arrow keys step between dives (not while fullscreen is open or a form
  // control has focus, so the smoothing slider keeps its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fullscreen) return;
      const el = document.activeElement;
      if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (e.key === 'ArrowLeft' && hasPrev) navigate(`/session/${session.id}/dive/${idx - 1}${search}`);
      else if (e.key === 'ArrowRight' && hasNext)
        navigate(`/session/${session.id}/dive/${idx + 1}${search}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, hasPrev, hasNext, idx, session.id, navigate, search]);

  const tiles = statTiles(tab, { dive, data: dataWithHangs, times, bands, hasProfile }, t);
  const allSessions = useBackupStore((st) => st.backup?.data.sessions);
  const usual = useMemo(
    () => (allSessions ? usualCompare(allSessions, session.id, idx) : null),
    [allSessions, session.id, idx],
  );

  const caption: Record<Tab, string> = {
    profile: `${t('Depth')} · m`,
    speed:
      speedAxis === 'time'
        ? `${t('Vertical Speed')} · m/s · ${t('negative = descending')}`
        : `${t('Speed by depth')} · m/s`,
    hr: `${t('Heart Rate')} · bpm`,
    temp: `${t('Temperature')} · °C`,
    bands: `${t('Speed per depth band')} · ${t('hangs excluded')}`,
  };

  const markerControls = (
    <MarkerControls
      hasAlarms={hasDepthAlarms}
      showAlarms={showAlarms}
      onAlarms={setShowAlarms}
      speedStep={speedStep}
      onStep={setSpeedStep}
      colorBySpeed={colorBySpeed}
      onColorBySpeed={setColorBySpeed}
      hasSpeed={data.hasSpeed}
    />
  );
  const speedControls = (
    <SpeedControls
      axis={speedAxis}
      onAxis={setSpeedAxis}
      smooth={speedSmooth}
      onSmooth={setSpeedSmooth}
      overlay={speedDepthOverlay}
      onOverlay={setSpeedDepthOverlay}
    />
  );

  let controls: React.ReactNode = null;
  if (hasProfile && tab === 'profile') {
    controls = (
      <>
        {markerControls}
        <button
          onClick={() => setMeasuring(!measuring)}
          title={t('Drag across the profile to measure a stretch of the dive')}
          className={pillCls(measuring)}
        >
          ⇤⇥ {t('Measure A→B')}
        </button>
        <button
          onClick={() => {
            setEditHangs(!editHangs);
            setSelectedHang(null);
          }}
          aria-expanded={editHangs}
          className={pillCls(editHangs)}
        >
          ✎ {t('Edit hangs')}
          {hasOverride && ` · ${t('manual')}`}
        </button>
        {editHangs && (
          // One chip per hang opens its editor, + Add creates one, Reset drops
          // manual corrections. The bands on the chart are clickable too but
          // can be very thin; the chips are the reliable hit target.
          <div className="flex basis-full flex-wrap items-center gap-2">
            <span className={ctrlLabelCls()}>{t('Hangs')}</span>
            <button onClick={handleAddHang} className={pillCls(false)}>
              + {t('Add')}
            </button>
            {effective.map((h, i) => (
              <button
                key={i}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSelectedHang({ idx: i, x: rect.left, y: rect.bottom });
                }}
                title={h.type === 'bottom' ? t('Bottom hang') : t('Off-bottom hang')}
                className={pillCls(selectedHang?.idx === i)}
              >
                {h.type === 'bottom' ? t('Bottom') : t('Off-bottom')} {fmtSec(h.startT)}-
                {fmtSec(h.endT)}
              </button>
            ))}
            {hasOverride && (
              <button
                onClick={handleResetHangs}
                className="pill px-3 py-0.5 font-mono text-[11px] hover:text-red"
              >
                {t('Reset')}
              </button>
            )}
          </div>
        )}
      </>
    );
  } else if (tab === 'speed') {
    controls = speedControls;
  } else if (tab === 'bands') {
    controls = <BandSizePicker size={bandSize} onSize={setBandSize} />;
  }

  const soloOf: Record<Tab, 'depth' | 'speed' | 'hr' | 'temp'> = {
    profile: 'depth',
    speed: 'speed',
    hr: 'hr',
    temp: 'temp',
    bands: 'depth',
  };

  const chart = (
    <ChartCard
      tabs={tabs}
      active={tab}
      onTab={selectTab}
      caption={caption[tab]}
      controls={controls}
      actions={
        hasProfile && (
          <button
            onClick={() => {
              setFsTab(soloOf[tab]);
              setFullscreen(true);
            }}
            title={t('Fullscreen analysis')}
            className="pill px-3 py-1 font-mono text-[11px] uppercase tracking-widest"
          >
            ⛶ {t('Fullscreen')}
          </button>
        )
      }
    >
      {!hasProfile ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-textDim">{t('No profile recorded for this dive, nothing to render.')}</p>
        </div>
      ) : tab === 'bands' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <SpeedBandsTable rows={bands} />
        </div>
      ) : (
        <ChartBody>
          {(h) => (
            <DepthDiveTracks
              key={tab}
              bare
              data={dataWithHangs}
              contractionOnset={dive.contractionOnset ?? null}
              mouthfillDepth={dive.mfChargeDepth ?? null}
              colorBySpeed={colorBySpeed}
              alarms={alarms}
              showAlarms={showAlarms}
              speedStep={speedStep}
              speedSmooth={speedSmooth}
              speedAxis={speedAxis}
              speedDepthOverlay={speedDepthOverlay}
              groupId={`dive-${session.id}-${idx}`}
              onHangClick={(hangIdx, x, y) => setSelectedHang({ idx: hangIdx, x, y })}
              solo={soloOf[tab]}
              // Room under the chart for the A->B hint and readout while
              // measuring, so they show without scrolling the card.
              chartHeight={Math.max(200, (tab === 'profile' && measuring ? h - 140 : h) - 4)}
              measuring={measuring}
              onMeasuringChange={setMeasuring}
            />
          )}
        </ChartBody>
      )}
    </ChartCard>
  );

  const side = (
    <>
      <StatsCard title={tabLabel} tiles={tiles} empty={t('No data for this view.')} />
      {(tab === 'profile' || tab == null) && usual && <UsualCard usual={usual} />}
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
          detail: `${d.discipline ? `${d.discipline} · ` : ''}${d.depth}m · ${fmtSec(d.diveTime)}`,
          current: i === idx,
          dim: d.diveType === 'excluded',
        }))}
      />
    </>
  );

  const clock = formatClock(session.date);
  const header = (
    <DiveHeader
      backTo={`/session/${session.id}`}
      backLabel={session.name || t('session')}
      title={`${t('Dive')} ${idx + 1} · ${dive.discipline ?? t('Depth dive')}`}
      hero={`${dive.depth}m`}
      meta={[
        fmtSec(dive.diveTime),
        `${formatDate(session.date)}${clock ? ` ${clock}` : ''}`,
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

      {selectedHang && effective[selectedHang.idx] && (
        <HangEditorPopover
          hang={effective[selectedHang.idx]}
          minT={data.startT}
          maxT={data.endT}
          position={{ x: selectedHang.x, y: selectedHang.y }}
          onChange={handleEditHang}
          onDelete={handleDeleteHang}
          onClose={() => setSelectedHang(null)}
        />
      )}

      {fullscreen && (
        <FullscreenDive
          title={`${dive.discipline ?? t('Depth dive')} · ${dive.depth}m`}
          subtitle={`${formatDate(session.date)} · ${t('Dive')} ${idx + 1} ${t('of')} ${dives.length}`}
          tabs={
            [
              { id: 'depth', label: t('Dive profile') },
              ...(data.hasSpeed ? [{ id: 'speed', label: t('Speed') }] : []),
              ...(data.hasHR ? [{ id: 'hr', label: t('Heart Rate') }] : []),
              ...(data.hasTemp ? [{ id: 'temp', label: t('Temperature') }] : []),
            ] as FullscreenTab[]
          }
          active={fsTab}
          onTab={(id) => setFsTab(id as typeof fsTab)}
          onClose={() => setFullscreen(false)}
          controls={
            fsTab === 'speed' ? speedControls : fsTab === 'depth' ? markerControls : undefined
          }
        >
          {(h) => (
            <DepthDiveTracks
              data={dataWithHangs}
              contractionOnset={dive.contractionOnset ?? null}
              mouthfillDepth={dive.mfChargeDepth ?? null}
              colorBySpeed={colorBySpeed}
              alarms={alarms}
              showAlarms={showAlarms}
              speedStep={speedStep}
              speedSmooth={speedSmooth}
              speedAxis={speedAxis}
              speedDepthOverlay={speedDepthOverlay}
              groupId={`dive-fs-${session.id}-${idx}`}
              solo={fsTab}
              chartHeight={Math.max(220, h - 32)}
            />
          )}
        </FullscreenDive>
      )}
    </>
  );
}

const ms = (v: number) => `${v.toFixed(2)} m/s`;
const bpm = (v: number) => `${Math.round(v)} bpm`;
const deg = (v: number) => `${v.toFixed(1)}°C`;
// fmtSec prints 0 as a dash; a reading at the first sample is t=0s.
const at = (s: number) => `t=${s > 0 ? fmtSec(s) : '0s'}`;

/** The stat tiles for one tab. Only values the dive actually carries: a tile
 *  whose value is missing is left out rather than shown as a dash. */
function statTiles(
  tab: Tab,
  ctx: {
    dive: DepthDiveRow;
    data: ReturnType<typeof extractDiveData>;
    times: ReturnType<typeof diveTimes>;
    bands: BandRow[];
    hasProfile: boolean;
  },
  t: (s: string) => string,
): StatTile[] {
  const { dive, data, times, bands, hasProfile } = ctx;
  const tiles: StatTile[] = [];
  // The colour of the tiles added next (see Tone).
  let tone: Tone = 'accent';
  const add = (label: string, value: string | null, sub?: string) => {
    if (value != null) tiles.push({ label, value, sub, tone });
  };
  // Without a profile the stored per-dive figures are all there is.
  const descentTime = hasProfile ? times.descentTime : (dive.descentTime ?? 0);
  const ascentTime = hasProfile ? times.ascentTime : (dive.ascentTime ?? 0);
  const hangTime = hasProfile ? times.hangTime : (dive.hangTime ?? 0);

  if (tab === 'profile') {
    tone = 'hero';
    add(t('Max depth'), `${dive.depth}m`);
    tone = 'highlight';
    add(t('Dive time'), dive.diveTime > 0 ? fmtSec(dive.diveTime) : null);
    tone = 'profile';
    add(t('Descent'), descentTime > 0 ? fmtSec(descentTime) : null);
    tone = 'amber';
    add(t('Ascent'), ascentTime > 0 ? fmtSec(ascentTime) : null);
    tone = 'recover';
    add(t('Hang'), hangTime > 0 ? fmtSec(hangTime) : null);
    const c = dive.contractionOnset;
    if (c) {
      tone = 'red';
      add(
        t('First contraction'),
        `${c.depth}m`,
        c.direction === 'up' ? `↑ ${t('ascent')}` : `↓ ${t('descent')}`,
      );
    }
  } else if (tab === 'speed') {
    const descentSpeed = hasProfile ? times.descentSpeed : (dive.descentSpeed ?? null);
    const ascentSpeed = hasProfile ? times.ascentSpeed : (dive.ascentSpeed ?? null);
    const edge = edgeSpeeds(data.points, data.maxDepth);
    const peaks = speedPeaks(data.speedSeries);
    tone = 'profile';
    add(t('Descent speed'), descentSpeed != null ? ms(descentSpeed) : null);
    tone = 'amber';
    add(t('Ascent speed'), ascentSpeed != null ? ms(ascentSpeed) : null);
    tone = 'profile';
    add(t('Descent, first 10 m'), edge.firstDescent != null ? ms(edge.firstDescent) : null);
    tone = 'amber';
    add(t('Ascent, last 10 m'), edge.lastAscent != null ? ms(edge.lastAscent) : null);
    tone = 'profile';
    add(t('Peak descent'), peaks.descent != null ? ms(peaks.descent) : null);
    tone = 'amber';
    add(t('Peak ascent'), peaks.ascent != null ? ms(peaks.ascent) : null);
  } else if (tab === 'hr') {
    tone = 'highlight';
    const s = seriesSummary(data.hrSeries);
    if (s) {
      add(t('Start'), bpm(s.start));
      add(t('Minimum'), bpm(s.min), at(s.minT));
      const drop = s.start - s.min;
      add(t('Drop'), drop > 0 ? `-${Math.round(drop)} bpm` : null, drop > 0 ? `${Math.round((drop / s.start) * 100)}%` : undefined);
      add(t('At surface'), bpm(s.end));
      add(t('HR high'), bpm(s.max), at(s.maxT));
    }
    add(t('Avg HR'), dive.hr != null ? bpm(dive.hr) : null);
  } else if (tab === 'temp') {
    const s = seriesSummary(data.tempSeries);
    if (s) {
      add(t('Surface'), deg(s.start));
      add(t('Minimum'), deg(s.min), at(s.minT));
      const drop = s.start - s.min;
      add(t('Drop'), drop > 0.05 ? deg(drop) : null);
      add(t('At surface'), deg(s.end));
    }
    add(t('Temp @ depth'), dive.tempDepth != null ? deg(dive.tempDepth) : null);
  } else if (tab === 'bands') {
    const pick = (phase: 'desc' | 'asc') => {
      const rated = bands
        .map((r) => ({ r, v: bandSpeed(r[phase]) }))
        .filter((x): x is { r: BandRow; v: number } => x.v != null);
      if (rated.length === 0) return null;
      rated.sort((a, b) => b.v - a.v);
      const time = bands.reduce((sum, r) => sum + r[phase].time, 0);
      const dist = bands.reduce((sum, r) => sum + r[phase].dist, 0);
      return { fast: rated[0], slow: rated[rated.length - 1], avg: time > 0 ? dist / time : null };
    };
    const desc = pick('desc');
    const asc = pick('asc');
    // Descent left, ascent right, as in the bars.
    if (desc && asc) {
      tone = 'profile';
      add(t('Fastest descent'), ms(desc.fast.v), bandLabel(desc.fast.r));
      tone = 'amber';
      add(t('Fastest ascent'), ms(asc.fast.v), bandLabel(asc.fast.r));
      tone = 'profile';
      add(t('Slowest descent'), ms(desc.slow.v), bandLabel(desc.slow.r));
      tone = 'amber';
      add(t('Slowest ascent'), ms(asc.slow.v), bandLabel(asc.slow.r));
    } else {
      tone = desc ? 'profile' : 'amber';
      const one = desc ?? asc;
      if (one) {
        add(t(desc ? 'Fastest descent' : 'Fastest ascent'), ms(one.fast.v), bandLabel(one.fast.r));
        add(t(desc ? 'Slowest descent' : 'Slowest ascent'), ms(one.slow.v), bandLabel(one.slow.r));
      }
    }
    // Time-weighted over the bands: metres moved / seconds moving, hangs out.
    tone = 'profile';
    add(t('Descent avg'), desc?.avg != null ? ms(desc.avg) : null, t('hangs excluded'));
    tone = 'amber';
    add(t('Ascent avg'), asc?.avg != null ? ms(asc.avg) : null, t('hangs excluded'));
  }
  return tiles;
}

/** This dive against the diver's usual at its depth: a tile per figure with
 *  the difference, and one line on what stands out most. */
function UsualCard({ usual }: { usual: UsualCompare }) {
  const t = useT();
  const META: Record<UsualMetric, { label: string; tone: Tone; speed: boolean }> = {
    descentSpeed: { label: t('Descent speed'), tone: 'profile', speed: true },
    ascentSpeed: { label: t('Ascent speed'), tone: 'amber', speed: true },
    hangTime: { label: t('Hang'), tone: 'recover', speed: false },
    diveTime: { label: t('Dive time'), tone: 'highlight', speed: false },
  };
  const fmt = (m: UsualMetric, v: number) => (META[m].speed ? `${v.toFixed(2)} m/s` : fmtSec(v));
  const diff = (r: UsualRow) => {
    if (META[r.metric].speed) {
      if (Math.abs(r.delta) < 0.5) return t('as usual');
      return (r.delta > 0 ? t('▲ {p}% faster') : t('▼ {p}% slower')).replace('{p}', String(Math.round(Math.abs(r.delta))));
    }
    if (Math.abs(r.delta) < 1) return t('as usual');
    return (r.delta > 0 ? t('▲ {s} longer') : t('▼ {s} shorter')).replace('{s}', fmtSec(Math.abs(r.delta)));
  };
  const standout = usual.standout
    ? t('{metric}: {value} against your usual {usual}.')
        .replace('{metric}', META[usual.standout.metric].label)
        .replace('{value}', fmt(usual.standout.metric, usual.standout.value))
        .replace('{usual}', fmt(usual.standout.metric, usual.standout.usual))
    : t('A usual dive for this depth.');
  return (
    <SideCard title={t('Against your usual')} className="shrink-0">
      <p className="-mt-1 mb-2 font-mono text-[10px] text-textDim">
        {t('{disc} at {from}–{to} m · {n} dives')
          .replace('{disc}', usual.discipline)
          .replace('{from}', String(usual.from))
          .replace('{to}', String(usual.to))
          .replace('{n}', String(usual.count))}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {usual.rows.map((r) => (
          <div
            key={r.metric}
            className="tile min-w-0 break-words px-3 py-2"
            style={{ '--tone': TONE_VAR[META[r.metric].tone] } as React.CSSProperties}
          >
            <div className="tile-value font-num text-lg font-bold tabular-nums">{fmt(r.metric, r.value)}</div>
            <div className="tile-label font-mono text-[10px] font-extrabold uppercase tracking-widest">
              {META[r.metric].label}
            </div>
            <div className="tile-label font-mono text-[10px] opacity-90">{diff(r)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-textDim">{standout}</p>
    </SideCard>
  );
}

/** Depth-track marker controls: the alarms toggle + speed-marker interval.
 *  Shared by the Profile tab and the fullscreen Dive profile tab. */
function MarkerControls({
  hasAlarms,
  showAlarms,
  onAlarms,
  speedStep,
  onStep,
  colorBySpeed,
  onColorBySpeed,
  hasSpeed,
}: {
  hasAlarms: boolean;
  showAlarms: boolean;
  onAlarms: (v: boolean) => void;
  speedStep: 0 | 5 | 10;
  onStep: (v: 0 | 5 | 10) => void;
  colorBySpeed: boolean;
  onColorBySpeed: (v: boolean) => void;
  hasSpeed: boolean;
}) {
  const t = useT();
  return (
    <>
      {hasAlarms && (
        <label className={`flex items-center gap-2 ${ctrlLabelCls()}`}>
          <input
            type="checkbox"
            checked={showAlarms}
            onChange={(e) => onAlarms(e.target.checked)}
            className="accent-accent"
          />
          {t('Depth alarms')}
        </label>
      )}
      <div className="flex items-center gap-2">
        <span className={ctrlLabelCls()}>{t('Speed markers')}</span>
        {([0, 5, 10] as const).map((step) => (
          <button key={step} onClick={() => onStep(step)} className={pillCls(speedStep === step)}>
            {step === 0 ? t('Off') : `${step}m`}
          </button>
        ))}
      </div>
      {hasSpeed && (
        <div className="flex items-center gap-2">
          <button onClick={() => onColorBySpeed(!colorBySpeed)} className={pillCls(colorBySpeed)}>
            {t('Speed colour')}
          </button>
          {colorBySpeed && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-textDim">
              {t('slow')}
              <span
                className="h-1.5 w-12 rounded-full"
                style={{ background: 'linear-gradient(90deg, rgb(var(--c-recover)), rgb(var(--c-amber)))' }}
              />
              {t('fast')}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Speed-track controls: x-axis toggle (over time / over depth), the
 *  mirrored/overlaid layout toggle for the over-depth view, plus the
 *  continuous smoothing slider (0 = raw, 31 = heavy moving average). Shared
 *  by the Speed tab and the fullscreen Speed tab. */
function SpeedControls({
  axis,
  onAxis,
  smooth,
  onSmooth,
  overlay,
  onOverlay,
}: {
  axis: 'time' | 'depth';
  onAxis: (a: 'time' | 'depth') => void;
  smooth: number;
  onSmooth: (n: number) => void;
  overlay: boolean;
  onOverlay: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="flex items-center gap-2">
        <span className={ctrlLabelCls()}>{t('Speed')}</span>
        {(['time', 'depth'] as const).map((a) => (
          <button key={a} onClick={() => onAxis(a)} className={pillCls(axis === a)}>
            {a === 'time' ? t('Over time') : t('Over depth')}
          </button>
        ))}
      </div>
      {axis === 'depth' && (
        <div className="flex items-center gap-2">
          <button onClick={() => onOverlay(false)} className={pillCls(!overlay)}>
            {t('Mirrored')}
          </button>
          <button onClick={() => onOverlay(true)} className={pillCls(overlay)}>
            {t('Overlaid')}
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className={ctrlLabelCls()}>{t('Smoothing')}</span>
        <input
          type="range"
          min={0}
          max={31}
          step={1}
          value={smooth}
          onChange={(e) => onSmooth(Number(e.target.value))}
          className="w-28 accent-accent"
          aria-label={t('Speed smoothing')}
        />
        <span className="w-12 font-mono text-[11px] text-textDim tabular-nums">
          {smooth <= 1 ? t('Raw') : `${smooth}`}
        </span>
      </div>
    </>
  );
}
