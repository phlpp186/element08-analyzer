/**
 * SeasonStory — the Progress page's season in one line, and every PB of the
 * last 12 months on one timeline (lib/analytics/seasonStory). Badges go
 * above or below the line wherever there is room, the most telling first:
 * each discipline's current best (outlined), then the most recent. A PB that
 * finds no room keeps only its dot, so a busy month stays readable and the
 * PBs that matter are the ones labelled.
 */
import { useMemo } from 'react';
import type { ParsedSession } from '../schema/backup';
import { seasonStory, type PbEvent } from '../lib/analytics/seasonStory';
import { disciplineColor } from '../lib/analytics/depthInsights';
import { mixHex } from '../lib/chartTheme';
import { useElementWidth } from '../lib/divePage';
import { useT } from '../i18n';

const BADGE_W = 56;
const BADGE_H = 26;
const PAD = 12;
/** Badge rows: next to the line, and a second tier further out. */
const ROW_GAP = 6;
const LINE_Y = 14 + 2 * BADGE_H + ROW_GAP + 14;
const H = 2 * LINE_Y + 4;

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

type Row = 'up' | 'down' | 'up2' | 'down2';

/** Badge rows, filled in order of importance: current bests, then the most
 *  recent. A badge takes the first row with no badge within its width: next
 *  to the line above, then below; a current best may also use the outer
 *  tier, where a month of new bests in several disciplines would otherwise
 *  leave some unlabelled. Its connector runs behind any inner badge (all
 *  connectors are drawn first). */
function place(events: PbEvent[], x: (t: number) => number) {
  const xs = events.map((e) => x(e.t));
  const order = events
    .map((_, i) => i)
    .sort((a, b) => Number(events[b].current) - Number(events[a].current) || events[b].t - events[a].t);
  const taken: Record<Row, number[]> = { up: [], down: [], up2: [], down2: [] };
  const free = (row: Row, px: number) => taken[row].every((o) => Math.abs(px - o) >= BADGE_W + 4);
  const rows: (Row | null)[] = events.map(() => null);
  for (const i of order) {
    const options: Row[] = events[i].current ? ['up', 'down', 'up2', 'down2'] : ['up', 'down'];
    const row = options.find((r) => free(r, xs[i])) ?? null;
    if (row) {
      taken[row].push(xs[i]);
      rows[i] = row;
    }
  }
  return events.map((e, i) => ({ e, px: xs[i], row: rows[i] }));
}

/** Top of a badge in its row. */
function badgeY(row: Row): number {
  if (row === 'up') return LINE_Y - 14 - BADGE_H;
  if (row === 'up2') return LINE_Y - 14 - 2 * BADGE_H - ROW_GAP;
  if (row === 'down') return LINE_Y + 14;
  return LINE_Y + 14 + BADGE_H + ROW_GAP;
}

export function SeasonStory({ sessions }: { sessions: ParsedSession[] }) {
  const t = useT();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const story = useMemo(() => seasonStory(sessions), [sessions]);
  if (story.sessions === 0) return null;

  const span = Math.max(1, story.to - story.from);
  const w = Math.max(width, 280);
  const x = (tm: number) => PAD + ((tm - story.from) / span) * (w - 2 * PAD);
  const placed = place(story.events, x);
  // Month ticks: the first of each month in the window.
  const ticks: { t: number; label: string }[] = [];
  const d = new Date(story.from);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= story.to) {
    ticks.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short' }) });
    d.setMonth(d.getMonth() + 2);
  }

  const { depth, hold, pool } = story;
  return (
    <section className="board mb-6 p-5">
      <p className="font-heading text-lg leading-relaxed text-text">
        <span className="text-textDim">{t('Last 12 months')}: </span>
        {depth && (
          <span style={{ color: placedColor(depth.discipline, story.events) }}>
            {depth.discipline} {Math.round(depth.best * 10) / 10} m
            {depth.gain != null && depth.gain >= 0.5 && ` (+${Math.round(depth.gain)} m)`}
          </span>
        )}
        {hold != null && (
          <>
            {depth && <span className="text-textDim"> · </span>}
            <span style={{ color: placedColor('STA', story.events) }}>
              {t('static')} {mmss(hold)}
            </span>
          </>
        )}
        {pool && (
          <>
            {(depth || hold != null) && <span className="text-textDim"> · </span>}
            <span style={{ color: placedColor(pool.discipline, story.events) }}>
              {pool.discipline} {Math.round(pool.best)} m
            </span>
          </>
        )}
        <span className="text-textDim">
          {' · '}
          {story.sessions} {t(story.sessions === 1 ? 'session' : 'sessions')}
        </span>
      </p>

      <div className="mt-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('PB timeline')} · {story.events.length} {t('PBs')} · {t('outlined: current best')}
        </div>
        <div ref={ref}>
          {story.events.length === 0 ? (
            <p className="py-6 text-center text-sm text-textDim">{t('No new PBs in the last 12 months.')}</p>
          ) : (
            <svg width={w} height={H} role="img" aria-label={t('PB timeline')} className="block">
              <line
                x1={PAD}
                x2={w - PAD}
                y1={LINE_Y}
                y2={LINE_Y}
                stroke="rgb(var(--c-border))"
                strokeWidth={3}
                strokeLinecap="round"
              />
              {ticks.map((tk) => (
                <text
                  key={tk.t}
                  x={x(tk.t)}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="rgb(var(--c-textDim))"
                  style={{ fontFamily: 'var(--font-num)' }}
                >
                  {tk.label}
                </text>
              ))}
              {/* Connectors first, so an outer badge's line runs behind the
                  inner badges it passes. */}
              {placed.map(({ e, px, row }, i) => {
                if (!row) return null;
                const by = badgeY(row);
                const above = row === 'up' || row === 'up2';
                return (
                  <line
                    key={`c${i}`}
                    x1={px}
                    x2={px}
                    y1={above ? by + BADGE_H : LINE_Y}
                    y2={above ? LINE_Y : by}
                    stroke={e.color}
                    strokeWidth={2}
                  />
                );
              })}
              {placed.map(({ e, px, row }, i) => {
                const ink = mixHex(e.color, '#000000', 0.78);
                const by = row ? badgeY(row) : 0;
                const bx = Math.min(Math.max(px - BADGE_W / 2, 0), w - BADGE_W);
                return (
                  <g key={i}>
                    <title>{`${e.discipline} ${e.text} · ${new Date(e.t).toLocaleDateString()}`}</title>
                    {row && (
                      <>
                        <rect
                          x={bx}
                          y={by}
                          width={BADGE_W}
                          height={BADGE_H}
                          rx={7}
                          fill={e.color}
                          stroke={e.current ? 'rgb(var(--c-text))' : 'none'}
                          strokeWidth={e.current ? 2 : 0}
                        />
                        <text
                          x={bx + BADGE_W / 2}
                          y={by + 10}
                          textAnchor="middle"
                          fontSize={8}
                          fontWeight={800}
                          fill={ink}
                        >
                          {e.discipline}
                        </text>
                        <text
                          x={bx + BADGE_W / 2}
                          y={by + 21}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={700}
                          fill={ink}
                          style={{ fontFamily: 'var(--font-num)' }}
                        >
                          {e.text}
                        </text>
                      </>
                    )}
                    <circle cx={px} cy={LINE_Y} r={row ? 5 : 3.5} fill={e.color} stroke="#ffffff" strokeWidth={1.5} />
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}

/** A discipline's colour as its badges show it, so the sentence and the
 *  timeline match. */
function placedColor(discipline: string, events: PbEvent[]): string {
  return events.find((e) => e.discipline === discipline)?.color ?? disciplineColor(discipline);
}
