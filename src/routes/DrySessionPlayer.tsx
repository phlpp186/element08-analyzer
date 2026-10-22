/**
 * DrySessionPlayer — full-resolution view of one dry breath-hold session.
 *
 * URL: /session/:sessionId/dry
 *
 * Dry sessions are a single continuous timeline (no per-dive concept), so
 * this route renders one player for the whole session, in the dive pages'
 * one-screen frame (Philipp's option A with the SpO₂ zones, 2026-10-22):
 * the block strip over the charts, SpO₂ and heart rate as tabs or
 * together, and a side column with the session's figures and its holds. A
 * hold in the list zooms the charts to it.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { extractDrySessionData } from '../lib/analytics/drySessionProfile';
import { dryHolds, spo2Zone, AFTERDROP_S } from '../lib/analytics/dryHolds';
import { BlockStrip, DrySessionTracks } from '../components/charts/DrySessionTracks';
import { FullscreenDive, type FullscreenTab } from '../components/FullscreenDive';
import {
  ChartBody,
  ChartCard,
  DiveHeader,
  DivePage,
  RemarksCard,
  SideCard,
  StatsCard,
  type ChartTab,
  type StatTile,
} from '../components/DivePageLayout';
import { fmtSec } from '../lib/divePage';
import { TONE_VAR, type Tone } from '../lib/tones';
import { formatDate } from '../lib/format';
import type { ParsedSession } from '../schema/backup';
import { useT } from '../i18n';

type Tab = 'both' | 'spo2' | 'hr';

const NO_SESSIONS: ParsedSession[] = [];

export function DrySessionPlayer() {
  const t = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const backup = useBackupStore((s) => s.backup);
  const sessions = backup?.data.sessions ?? NO_SESSIONS;
  const session = sessions.find((s) => s.id === Number(sessionId));
  const dry = session?.mode === 'dry' ? session : null;

  const [tab, setTab] = useState<Tab | null>(null);
  const [zoomHold, setZoomHold] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsTab, setFsTab] = useState<'spo2' | 'hr'>('spo2');

  const data = useMemo(() => extractDrySessionData((dry ?? {}) as never), [dry]);
  const holds = useMemo(() => dryHolds(data), [data]);

  if (!backup) return <Navigate to="/" replace />;
  if (!dry) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="mt-8 text-textDim">{t('Dry session not found.')}</p>
      </div>
    );
  }

  const hasSpo2 = data.spo2Series.length >= 2;
  const hasHr = data.hrSeries.length >= 2;
  const tabs: ChartTab<Tab>[] = [
    ...(hasSpo2 && hasHr ? [{ id: 'both' as const, label: t('SpO₂ + HR') }] : []),
    ...(hasSpo2 ? [{ id: 'spo2' as const, label: 'SpO₂' }] : []),
    ...(hasHr ? [{ id: 'hr' as const, label: t('Heart rate') }] : []),
  ];
  const active: Tab | null = tab && tabs.some((x) => x.id === tab) ? tab : (tabs[0]?.id ?? null);
  const zoomed = zoomHold != null ? holds[zoomHold] : null;
  // A hold with a little rest before it and its afterdrop after it.
  const zoom: [number, number] | null = zoomed
    ? [Math.max(data.startT, zoomed.startT - 20), Math.min(data.endT, zoomed.endT + AFTERDROP_S + 10)]
    : null;

  const lungVol = (dry as { lungVol?: string | null }).lungVol ?? null;
  const breathing = dry.breathingStyle ?? null;
  let longest = 0;
  for (const h of holds) if (h.seconds > longest) longest = h.seconds;
  let minSpo2: number | null = null;
  for (const [, v] of data.spo2Series) if (minSpo2 == null || v < minSpo2) minSpo2 = v;
  let hrLo: number | null = null;
  let hrHi: number | null = null;
  for (const [, v] of data.hrSeries) {
    if (hrLo == null || v < hrLo) hrLo = v;
    if (hrHi == null || v > hrHi) hrHi = v;
  }

  const zoneTone = (v: number): Tone =>
    spo2Zone(v) === 'ok' ? 'recover' : spo2Zone(v) === 'mild' ? 'amber' : 'red';
  const tiles: StatTile[] = [
    ...(longest > 0 ? [{ label: t('Longest hold'), value: fmtSec(longest), tone: 'hero' as const }] : []),
    { label: t('Holds'), value: String(holds.length), tone: 'highlight' },
    ...(minSpo2 != null ? [{ label: t('Min SpO₂'), value: `${Math.round(minSpo2)}%`, tone: zoneTone(minSpo2) }] : []),
    ...(hrLo != null && hrHi != null
      ? [{ label: t('HR range'), value: `${Math.round(hrLo)}–${Math.round(hrHi)}`, tone: 'red' as const }]
      : []),
    { label: t('Duration'), value: dry.duration || '–', tone: 'profile' },
    ...(lungVol || breathing
      ? [{ label: t(lungVol ? 'Lung volume' : 'Breathing'), value: lungVol ?? t(breathing ?? ''), tone: 'accent' as const }]
      : []),
  ];

  const header = (
    <DiveHeader
      backTo={`/session/${dry.id}`}
      backLabel={dry.name || t('Untitled session')}
      title={dry.name || t('Untitled session')}
      hero={longest > 0 ? fmtSec(longest) : undefined}
      meta={[
        `${t('Dry')} · ${formatDate(dry.date)}`,
        lungVol,
        breathing ? t(breathing) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  );

  const chart = (
    <ChartCard
      tabs={tabs}
      active={active}
      onTab={setTab}
      caption={zoomed ? `${t('Hold')} ${zoomed.idx + 1}` : undefined}
      actions={
        <>
          {zoomed && (
            <button onClick={() => setZoomHold(null)} className="pill px-3 py-1 font-mono text-[11px] uppercase tracking-widest">
              {t('Whole session')}
            </button>
          )}
          {(hasSpo2 || hasHr) && (
            <button
              onClick={() => {
                setFsTab(hasSpo2 ? 'spo2' : 'hr');
                setFullscreen(true);
              }}
              title={t('Fullscreen analysis')}
              className="pill px-3 py-1 font-mono text-[11px] uppercase tracking-widest"
            >
              ⛶ {t('Fullscreen')}
            </button>
          )}
        </>
      }
    >
      {active == null ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center text-textDim">
          {t('No oximeter readings or block timeline recorded for this session.')}
        </div>
      ) : (
        <ChartBody>
          {(h) => (
            <div className="space-y-2">
              {data.blocks.length > 0 && (
                <BlockStrip blocks={data.blocks} range={zoom ?? [data.startT, data.endT]} holds={holds} />
              )}
              <DrySessionTracks
                key={active}
                bare
                data={data}
                holds={holds}
                zoom={zoom}
                groupId={`dry-${dry.id}`}
                solo={active === 'both' ? undefined : active}
                chartHeight={Math.max(220, h - (data.blocks.length > 0 ? 44 : 4))}
              />
            </div>
          )}
        </ChartBody>
      )}
    </ChartCard>
  );

  const side = (
    <>
      <StatsCard title={t('Session')} tiles={tiles} empty={t('No data for this view.')} />
      {holds.length > 0 && (
        <SideCard title={t('Holds')} className="flex min-h-0 flex-col min-[960px]:flex-1">
          <ul className="-mx-1 min-h-0 space-y-0.5 overflow-auto">
            {holds.map((h) => {
              const on = zoomHold === h.idx;
              return (
                <li key={h.idx}>
                  <button
                    onClick={() => setZoomHold(on ? null : h.idx)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                      on ? 'bg-accent/15 font-bold text-accent' : 'text-text hover:bg-abyss hover:text-accent'
                    }`}
                  >
                    <span className="w-14 shrink-0 uppercase tracking-widest">
                      {t('Hold')} {h.idx + 1}
                    </span>
                    <span className="font-num text-sm font-bold">{fmtSec(h.seconds)}</span>
                    <span className="ml-auto flex items-center gap-2 text-textDim">
                      {h.minSpo2 && (
                        <span
                          className="rounded px-1.5 py-px font-bold"
                          style={
                            {
                              color: TONE_VAR[zoneTone(h.minSpo2.v)],
                              background: `color-mix(in srgb, ${TONE_VAR[zoneTone(h.minSpo2.v)]} 15%, transparent)`,
                            } as CSSProperties
                          }
                        >
                          {Math.round(h.minSpo2.v)}%
                        </span>
                      )}
                      {h.firstContraction != null && <span>C {fmtSec(h.firstContraction)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SideCard>
      )}
      <RemarksCard
        title={t('Remarks')}
        remarks={dry.remarks}
        facts={dry.rating != null ? [{ label: t('Session effort'), value: `${dry.rating}/10` }] : []}
      />
    </>
  );

  return (
    <>
      <DivePage header={header} chart={chart} side={side} />
      {fullscreen && (
        <FullscreenDive
          title={dry.name || t('Untitled session')}
          subtitle={`${t('Dry')} · ${formatDate(dry.date)}`}
          tabs={
            [
              ...(hasSpo2 ? [{ id: 'spo2', label: 'SpO₂' }] : []),
              ...(hasHr ? [{ id: 'hr', label: t('Heart Rate') }] : []),
            ] as FullscreenTab[]
          }
          active={fsTab}
          onTab={(id) => setFsTab(id as typeof fsTab)}
          onClose={() => setFullscreen(false)}
        >
          {(h) => (
            <DrySessionTracks
              data={data}
              holds={holds}
              zoom={zoom}
              groupId={`dry-fs-${dry.id}`}
              solo={fsTab}
              // Leave room for the block strip below the solo chart.
              chartHeight={Math.max(220, h - (data.blocks.length > 0 ? 60 : 32))}
            />
          )}
        </FullscreenDive>
      )}
    </>
  );
}
