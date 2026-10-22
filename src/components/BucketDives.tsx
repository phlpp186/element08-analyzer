/**
 * BucketDives — what one Playground bar is made of (Philipp's option A,
 * 2026-10-22): every dive (or dry session) in the bucket as a dot along its
 * value, stacked where they crowd, each opening its own page; the highest
 * and lowest as links under it.
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PivotBucket, PivotItem } from '../lib/analytics/playgroundPivot';
import { useElementWidth } from '../lib/divePage';
import { formatDate } from '../lib/format';
import { useT } from '../i18n';

const PAD = 10;
const R = 5;
const LEVEL = 10;
const H = 84;
/** The middle line the dots stack around. */
const MID = 38;

function itemPath(it: PivotItem): string {
  if (it.mode === 'dry') return `/session/${it.session.id}/dry`;
  const dives = (it.session as { dives?: unknown[] }).dives ?? [];
  return `/session/${it.session.id}/${it.mode === 'pool' ? 'pool' : 'dive'}/${dives.indexOf(it.dive)}`;
}

function itemLabel(it: PivotItem): string {
  const disc = (it.dive as { discipline?: string } | undefined)?.discipline;
  return [formatDate(it.session.date), disc].filter(Boolean).join(' · ');
}

export function BucketDives({
  bucket,
  color,
  format,
  onClose,
}: {
  bucket: PivotBucket;
  color: string;
  format: (v: number) => string;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const rows = useMemo(
    () =>
      bucket.points
        .map((v, i) => ({ v, to: itemPath(bucket.items[i]), label: itemLabel(bucket.items[i]) }))
        .sort((a, b) => a.v - b.v),
    [bucket],
  );
  const w = Math.max(width, 200);
  const lo = rows[0]?.v ?? 0;
  const hi = rows[rows.length - 1]?.v ?? 0;
  const span = hi - lo || 1;

  // A small beeswarm: each dot takes the first level (0, -1, +1, ... ±3)
  // with no dot within a diameter, else sits on the middle line.
  const dots = useMemo(() => {
    const lastX = new Map<number, number>();
    const levels = [0, -1, 1, -2, 2, -3, 3];
    return rows.map((r) => {
      const x = PAD + ((r.v - lo) / span) * (w - 2 * PAD);
      const level = levels.find((l) => x - (lastX.get(l) ?? -Infinity) >= 2 * R + 1) ?? 0;
      lastX.set(level, x);
      return { ...r, x, y: MID + level * LEVEL };
    });
  }, [rows, lo, span, w]);

  const noun = bucket.items[0]?.mode === 'dry' ? t('sessions') : t('dives');
  const top = rows[rows.length - 1];
  const bottom = rows[0];
  return (
    <div className="rounded-lg border border-border bg-deep px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-sm font-bold" style={{ color }}>
          {bucket.label}
        </span>
        <span className="font-mono text-[11px] text-textDim">
          {bucket.n} {noun} · {t('click one to open it')}
        </span>
        <button
          onClick={onClose}
          aria-label={t('Close')}
          className="ml-auto font-mono text-xs text-textDim hover:text-accent"
        >
          ✕
        </button>
      </div>
      <div ref={ref}>
        <svg width={w} height={H} className="block" role="img" aria-label={bucket.label}>
          <line x1={PAD} x2={w - PAD} y1={MID} y2={MID} stroke="rgb(var(--c-border))" strokeWidth={2} />
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={R}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1}
              className="cursor-pointer hover:opacity-70"
              onClick={() => navigate(d.to)}
            >
              <title>{`${d.label} · ${format(d.v)}`}</title>
            </circle>
          ))}
          <text x={PAD} y={H - 2} fontSize={10} fill="rgb(var(--c-textDim))" style={{ fontFamily: 'var(--font-num)' }}>
            {format(lo)}
          </text>
          <text x={w - PAD} y={H - 2} fontSize={10} textAnchor="end" fill="rgb(var(--c-textDim))" style={{ fontFamily: 'var(--font-num)' }}>
            {format(hi)}
          </text>
        </svg>
      </div>
      {rows.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Link to={top.to} className="pill px-2.5 py-0.5 font-mono text-[11px]">
            {t('Highest')}: {top.label} · {format(top.v)} ›
          </Link>
          <Link to={bottom.to} className="pill px-2.5 py-0.5 font-mono text-[11px]">
            {t('Lowest')}: {bottom.label} · {format(bottom.v)} ›
          </Link>
        </div>
      )}
    </div>
  );
}
