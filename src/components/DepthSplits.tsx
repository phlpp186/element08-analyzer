/**
 * DepthSplits — the depth compare's "where and why" (Philipp's options A + C,
 * 2026-10-22). Under the overlay, where curves of similar dives sit on top
 * of each other:
 *
 *   - a verdict per dive against the first: the stretch where the time was
 *     won or lost, the speed / hang / time differences, and the kit and
 *     conditions that were not the same
 *   - seconds per 10 m band, down or up, fastest band marked
 *   - how far ahead or behind each dive was against the first, metre by metre
 */
import { useMemo, useState, type CSSProperties } from 'react';
import ReactECharts from './charts/EChart';
import { bandSplits, biggestStretch, diveDifferences, gapCurve, type Stretch } from '../lib/analytics/depthSplits';
import type { ProfilePoint } from '../lib/analytics/diveProfile';
import { useChartTheme } from '../lib/chartTheme';
import { TONE_VAR, type Tone } from '../lib/tones';
import { useT } from '../i18n';

export interface SplitDive {
  color: string;
  /** Short name, e.g. "FIM 77.3m". */
  title: string;
  dive: Record<string, unknown> & { profile?: ProfilePoint[] };
}

const STEP = 10;

const DIFF_LABEL: Record<string, string> = {
  suit: 'Suit',
  weight: 'Weight',
  mouthfill: 'Mouthfill',
  monofin: 'Monofin',
  bifin: 'Bifin',
  fimFins: 'FIM fins',
  mask: 'Mask',
  weights: 'Weights (type)',
  waves: 'Waves',
  current: 'Current',
  thermocline: 'Thermocline',
  eq: 'Equalization',
  pace: 'Pace',
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function secs(v: number): string {
  return `${Math.round(v * 10) / 10} s`;
}

export function DepthSplits({ dives }: { dives: SplitDive[] }) {
  const t = useT();
  const [phase, setPhase] = useState<'descent' | 'ascent'>('descent');
  const splits = useMemo(() => dives.map((d) => bandSplits(d.dive.profile ?? [], STEP)), [dives]);
  const rows = Math.max(0, ...splits.map((s) => s.length));
  if (rows === 0) return null;
  const ref = dives[0];

  return (
    <div className="space-y-4">
      {dives.slice(1).map((d, i) => (
        <Verdict key={i} ref_={ref} other={d} refSplits={splits[0]} otherSplits={splits[i + 1]} />
      ))}

      <div className="board space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-sm font-bold text-text">{t('Splits per 10 m')}</h3>
          <span className="flex-1" />
          {(['descent', 'ascent'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={`pill px-3 py-1 text-xs ${phase === p ? 'pill-on' : ''}`}
            >
              {p === 'descent' ? t('Descent') : t('Ascent')}
            </button>
          ))}
        </div>
        <SplitTable dives={dives} splits={splits} rows={rows} phase={phase} />
        {dives.length > 1 && <GapChart dives={dives} />}
      </div>
    </div>
  );
}

// ── Verdict ─────────────────────────────────────────────────────────────────

function Verdict({
  ref_,
  other,
  refSplits,
  otherSplits,
}: {
  ref_: SplitDive;
  other: SplitDive;
  refSplits: ReturnType<typeof bandSplits>;
  otherSplits: ReturnType<typeof bandSplits>;
}) {
  const t = useT();
  const stretch = biggestStretch(refSplits, otherSplits);
  const { differences, sameKit } = diveDifferences(ref_.dive, other.dive);
  const tiles: { label: string; value: string; tone: Tone }[] = [];
  const pair = (k: string) => {
    const a = num(ref_.dive[k]);
    const b = num(other.dive[k]);
    return a != null && b != null && a > 0 && b > 0 ? a - b : null;
  };
  const signed = (v: number, f: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;
  const speedTone = (v: number): Tone => (Math.abs(v) < 0.005 ? 'highlight' : v > 0 ? 'recover' : 'amber');
  const ds = pair('descentSpeed');
  if (ds != null) tiles.push({ label: t('Descent speed'), value: signed(ds, (x) => `${x.toFixed(2)} m/s`), tone: speedTone(ds) });
  const hang = pair('hangTime');
  if (hang != null) tiles.push({ label: t('Hang'), value: signed(hang, (x) => `${Math.round(x)} s`), tone: 'highlight' });
  const as = pair('ascentSpeed');
  if (as != null) tiles.push({ label: t('Ascent speed'), value: signed(as, (x) => `${x.toFixed(2)} m/s`), tone: speedTone(as) });
  const dt = pair('diveTime');
  if (dt != null) tiles.push({ label: t('Dive time'), value: signed(dt, (x) => `${Math.round(x)} s`), tone: 'profile' });

  const kitPart = sameKit == null ? '' : `, ${sameKit ? t('same kit') : t('different kit')}`;

  return (
    <div className="board space-y-3 p-4">
      <p className="font-heading text-base font-bold leading-snug text-text sm:text-lg">
        <span style={{ color: ref_.color }}>{ref_.title}</span> {t('vs')}{' '}
        <span style={{ color: other.color }}>{other.title}</span>:{' '}
        {stretch ? stretchText(stretch, t) : t('evenly matched all the way')}
        {kitPart}
      </p>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="tile px-3 py-2" style={{ '--tone': TONE_VAR[tile.tone] } as CSSProperties}>
              <div className="tile-value font-num text-lg font-bold">{tile.value}</div>
              <div className="tile-label text-[11px] font-bold">{tile.label}</div>
            </div>
          ))}
        </div>
      )}
      {differences.length > 0 && (
        <p className="text-xs text-textDim">
          <span className="font-mono uppercase tracking-widest">{t('Also differed')}</span>{' '}
          {differences
            .map((d) => `${t(DIFF_LABEL[d.key] ?? d.key)} ${chipWord(d.ref, t)} ${t('vs')} ${chipWord(d.other, t)}`)
            .join(' · ')}
        </p>
      )}
      <p className="text-[11px] text-textDim">
        {t('Differences are {first} minus {second}.').replace('{first}', ref_.title).replace('{second}', other.title)}
      </p>
    </div>
  );
}

/** Logged chip ids that do not read as words once the hyphens go. */
const CHIP_WORDS: Record<string, string> = {
  beltweight: 'belt weight',
  neckweight: 'neck weight',
  'neckweight-extension': 'neck weight extension',
  'noseclip-goggles': 'noseclip and goggles',
  'noseclip-only': 'noseclip only',
  'frenzel-failure': 'Frenzel failure',
};

/** A logged chip value as words, translated. */
function chipWord(v: string, t: (k: string) => string): string {
  return v === '–' ? v : t(CHIP_WORDS[v] ?? v.replace(/[-_]/g, ' '));
}

function stretchText(s: Stretch, t: (k: string) => string): string {
  const template =
    s.phase === 'descent'
      ? s.saved > 0
        ? t('{s} faster on the way down from {a} to {b} m')
        : t('{s} slower on the way down from {a} to {b} m')
      : s.saved > 0
        ? t('{s} faster on the way up from {b} to {a} m')
        : t('{s} slower on the way up from {b} to {a} m');
  return template
    .replace('{s}', secs(Math.abs(s.saved)))
    .replace('{a}', String(s.from))
    .replace('{b}', String(s.to));
}

// ── Split table ─────────────────────────────────────────────────────────────

function SplitTable({
  dives,
  splits,
  rows,
  phase,
}: {
  dives: SplitDive[];
  splits: ReturnType<typeof bandSplits>[];
  rows: number;
  phase: 'descent' | 'ascent';
}) {
  const t = useT();
  const order = Array.from({ length: rows }, (_, i) => (phase === 'descent' ? i : rows - 1 - i));
  // One scale for the whole table, from zero: a bar's length is its time, so
  // rows compare with each other too and the gaps are not exaggerated.
  let scale = 0;
  for (const sp of splits) for (const b of sp) if ((b[phase] ?? 0) > scale) scale = b[phase] as number;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center font-num text-xs">
        <thead>
          <tr>
            <th className="w-16 text-left font-mono text-[10px] font-normal uppercase tracking-widest text-textDim">
              {phase === 'descent' ? t('Down') : t('Up')}
            </th>
            {dives.map((d, i) => (
              <th key={i} className="font-bold" style={{ color: d.color }}>
                {d.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((r) => {
            const vals = splits.map((s) => s[r]?.[phase] ?? null);
            const present = vals.filter((v): v is number => v != null);
            const min = present.length > 1 ? Math.min(...present) : null;
            const band = splits.find((s) => s[r])?.[r];
            if (!band) return null;
            return (
              <tr key={r}>
                <th className="text-left font-mono text-[11px] font-normal text-textDim">
                  {phase === 'descent' ? `${band.from}–${band.to}` : `${band.to}–${band.from}`} m
                </th>
                {vals.map((v, i) => {
                  const fastest = v != null && min != null && v === min;
                  // Notably slow: 10% and half a second over the fastest.
                  const slow = v != null && min != null && v > min * 1.1 && v - min >= 0.5;
                  const fill = fastest
                    ? TONE_VAR.recover
                    : slow
                      ? `color-mix(in srgb, ${TONE_VAR.red} 45%, transparent)`
                      : // Neutral: a dive colour (orange) read as the red "slower".
                        'rgb(var(--c-text) / 0.18)';
                  return (
                    <td key={i} className="p-0">
                      <div
                        className="relative h-7 overflow-hidden rounded-md"
                        style={{ background: 'rgb(var(--c-text) / 0.06)' }}
                      >
                        {v != null && scale > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-md"
                            style={{ width: `${(v / scale) * 100}%`, background: fill }}
                          />
                        )}
                        <span
                          className="relative flex h-full items-center px-2 font-bold"
                          style={{
                            color: fastest
                              ? `color-mix(in srgb, ${TONE_VAR.recover}, #000 78%)`
                              : slow
                                ? TONE_VAR.red
                                : undefined,
                          }}
                        >
                          {v != null ? (Math.round(v * 10) / 10).toFixed(1) : '–'}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-textDim">{t('Seconds per band: the longer the bar, the slower. Green is the fastest of the row, red notably slower.')}</p>
    </div>
  );
}

// ── Gap chart ───────────────────────────────────────────────────────────────

function GapChart({ dives }: { dives: SplitDive[] }) {
  const t = useT();
  const ct = useChartTheme();
  const ref = dives[0];
  const curves = useMemo(
    () => dives.slice(1).map((d) => gapCurve(ref.dive.profile ?? [], d.dive.profile ?? [])),
    [dives, ref],
  );
  const turn = Math.max(0, ...curves.map((c) => c?.turn ?? 0));
  if (turn < 2) return null;
  // One category per metre: down 1..turn, an empty "turn" slot that breaks
  // the line (the way up restarts its count), then up turn..1.
  const cats: { key: string; label: string; depth: number }[] = [];
  for (let d = 1; d <= turn; d++) cats.push({ key: `down${d}`, label: `↓${d}`, depth: d });
  cats.push({ key: 'turn', label: t('turn'), depth: -1 });
  for (let d = turn; d >= 1; d--) cats.push({ key: `up${d}`, label: `↑${d}`, depth: d });
  // Seconds gained read as "faster", lost as "slower": a signed gap made
  // readers stop and work out which way "ahead" was.
  const pace = (v: number, digits: number) =>
    Math.abs(v) < 0.05
      ? t('even')
      : (v > 0 ? t('{s} s faster') : t('{s} s slower')).replace('{s}', Math.abs(v).toFixed(digits));
  const option = {
    grid: { left: 8, right: 16, top: 24, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => (typeof v === 'number' ? pace(v, 1) : '–'),
    },
    xAxis: {
      type: 'category',
      data: cats.map((c) => c.label),
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisLabel: {
        color: ct.textDim,
        fontSize: 10,
        // Depth labels next to the turn would run into its label.
        interval: (i: number) =>
          cats[i].key === 'turn' || (cats[i].depth % 10 === 0 && turn - cats[i].depth >= 6),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: ct.textDim, fontSize: 10, formatter: (v: number) => pace(v, 0) },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: dives.slice(1).map((d, i) => {
      const byKey = new Map<string, number>((curves[i]?.points ?? []).map((p) => [`${p.phase}${p.depth}`, p.gap]));
      return {
        name: d.title,
        type: 'line',
        symbol: 'none',
        smooth: 0.3,
        lineStyle: { color: d.color, width: 2.5 },
        itemStyle: { color: d.color },
        data: cats.map((c) => {
          const v = byKey.get(c.key);
          return v == null ? '-' : Math.round(v * 10) / 10;
        }),
        markLine:
          i === 0
            ? {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { color: ref.color, type: 'dashed', width: 1.5 },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      };
    }),
  };
  return (
    <div className="border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-heading text-sm font-bold text-text">
          {t('Faster or slower than {ref}').replace('{ref}', ref.title)}
        </h3>
        <span className="text-[11px] text-textDim">{t('Above the line: that many seconds faster, below: slower. Down counts from the start, up from leaving the bottom.')}</span>
      </div>
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </div>
  );
}
