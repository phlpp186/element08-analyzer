/**
 * SpeedBands — per-depth-band pacing for one dive, the analyzer's take on the
 * app's depth pills: for each 5 / 10 / 20 m band, the average vertical speed
 * and the time spent inside the band, split into descent and ascent.
 *
 * Honest numbers, matching the app's band conventions:
 *   - Hang segments are EXCLUDED — a pause at 30 m must not make the
 *     25–30 m band look slow.
 *   - The dive splits into descent/ascent at its deepest sample.
 *   - Speed = vertical metres actually covered inside the band ÷ time in
 *     band (so kick-glide oscillation doesn't fake extra speed).
 *   - The last band is partial ("30–32m") when the dive doesn't fill it.
 */
import { useMemo, useState } from 'react';
import type { DepthDiveData, HangSegment } from '../lib/analytics/diveProfile';
import { useChartTheme } from '../lib/chartTheme';
import { useT } from '../i18n';

type BandSize = 5 | 10 | 20;

interface PhaseAgg {
  time: number;
  dist: number;
}

interface BandRow {
  lo: number;
  hi: number;
  desc: PhaseAgg;
  asc: PhaseAgg;
}

function computeBands(data: DepthDiveData, size: BandSize): BandRow[] {
  const points = data.points;
  if (points.length < 2 || data.maxDepth <= 0) return [];

  // Deepest sample = descent/ascent split.
  let splitT = points[0].t;
  let deepest = -Infinity;
  for (const p of points) {
    if (p.d > deepest) {
      deepest = p.d;
      splitT = p.t;
    }
  }

  const hangs = data.hangs as HangSegment[];
  const inHang = (tm: number) => hangs.some((h) => tm >= h.startT && tm <= h.endT);

  const bands: BandRow[] = [];
  for (let lo = 0; lo < data.maxDepth; lo += size) {
    bands.push({
      lo,
      hi: Math.min(lo + size, data.maxDepth),
      desc: { time: 0, dist: 0 },
      asc: { time: 0, dist: 0 },
    });
  }
  if (bands.length === 0) return [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    if (inHang(a.t) || inHang(b.t)) continue;
    const mid = (a.d + b.d) / 2;
    const idx = Math.min(bands.length - 1, Math.max(0, Math.floor(mid / size)));
    const phase: 'desc' | 'asc' = b.t <= splitT ? 'desc' : 'asc';
    bands[idx][phase].time += dt;
    bands[idx][phase].dist += Math.abs(b.d - a.d);
  }

  // Keep only bands the dive actually moved through.
  return bands.filter((bd) => bd.desc.time > 0 || bd.asc.time > 0);
}

function fmtTime(s: number): string {
  if (s < 60) return `${s.toFixed(1).replace(/\.0$/, '')}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function PhaseCell({ agg, color }: { agg: PhaseAgg; color: string }) {
  if (agg.time <= 0 || agg.dist <= 0.1) {
    return <span className="font-mono text-xs text-textDim opacity-40">–</span>;
  }
  const speed = agg.dist / agg.time;
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="font-semibold" style={{ color }}>
        {speed.toFixed(2)} m/s
      </span>
      <span className="ml-2 text-textDim">{fmtTime(agg.time)}</span>
    </span>
  );
}

export function SpeedBands({ data }: { data: DepthDiveData }) {
  const t = useT();
  const ct = useChartTheme();
  const [size, setSize] = useState<BandSize>(5);
  const rows = useMemo(() => computeBands(data, size), [data, size]);

  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
          {t('Speed per depth band')}
        </h3>
        <span className="font-mono text-[10px] text-textDim opacity-60">
          · {t('hangs excluded')}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {([5, 10, 20] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={[
                'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
                size === s
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-textDim hover:border-accent hover:text-accent',
              ].join(' ')}
            >
              {s}m
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-x-4 border-b border-border bg-abyss px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
            {t('Band')}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
            {t('Descent')}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
            {t('Ascent')}
          </span>
        </div>
        <ul className="divide-y divide-border bg-panel">
          {rows.map((r) => (
            <li key={r.lo} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-x-4 px-4 py-2">
              <span className="inline-flex w-fit rounded-full border border-border bg-abyss px-2.5 py-0.5 font-mono text-[11px] text-text tabular-nums">
                {r.lo}–{Number.isInteger(r.hi) ? r.hi : r.hi.toFixed(1)}m
              </span>
              <PhaseCell agg={r.desc} color={ct.amber} />
              <PhaseCell agg={r.asc} color={ct.red} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
