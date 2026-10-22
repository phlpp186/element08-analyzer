/**
 * SeasonStory — the Progress page's season in one line, and every PB of the
 * last 12 months on one timeline (lib/analytics/seasonStory). Badges
 * alternate above and below the line; where two would overlap the later
 * one keeps only its dot, so a busy month stays readable.
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
const LINE_Y = 64;
const H = 132;

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** Badge rows: 'up' and 'down' in turn, a badge skipped (dot only) when it
 *  would overlap the last one on both rows. */
function place(events: PbEvent[], x: (t: number) => number) {
  const lastX = { up: -Infinity, down: -Infinity };
  let next: 'up' | 'down' = 'up';
  return events.map((e) => {
    const px = x(e.t);
    const other = next === 'up' ? 'down' : 'up';
    let row: 'up' | 'down' | null = null;
    if (px - lastX[next] >= BADGE_W + 4) row = next;
    else if (px - lastX[other] >= BADGE_W + 4) row = other;
    if (row) {
      lastX[row] = px;
      next = row === 'up' ? 'down' : 'up';
    }
    return { e, px, row };
  });
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
          {t('PB timeline')} · {story.events.length} {t('PBs')}
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
              {placed.map(({ e, px, row }, i) => {
                const ink = mixHex(e.color, '#000000', 0.78);
                const by = row === 'up' ? LINE_Y - 14 - BADGE_H : LINE_Y + 14;
                const bx = Math.min(Math.max(px - BADGE_W / 2, 0), w - BADGE_W);
                return (
                  <g key={i}>
                    <title>{`${e.discipline} ${e.text} · ${new Date(e.t).toLocaleDateString()}`}</title>
                    {row && (
                      <>
                        <line
                          x1={px}
                          x2={px}
                          y1={row === 'up' ? by + BADGE_H : LINE_Y}
                          y2={row === 'up' ? LINE_Y : by}
                          stroke={e.color}
                          strokeWidth={2}
                        />
                        <rect x={bx} y={by} width={BADGE_W} height={BADGE_H} rx={7} fill={e.color} />
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
